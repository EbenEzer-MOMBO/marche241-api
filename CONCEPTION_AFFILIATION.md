# Conception — Système d'affiliation Marché241

Statut : conception validée avec Eben, prête pour implémentation.
Périmètre : `marche241-api` (system of record), `marche241_admin` (gestion back-office + lanceur de campagnes WhatsApp), `marche241_v2` (inscription affilié, capture de tracking, checkout, mini dashboard affilié).

## 1. Rappel du besoin

Marché241 veut lancer un programme d'affiliation simple : une personne s'inscrit comme affilié (nom, email, WhatsApp, pays), reçoit un code unique à partager, et touche une commission chaque fois qu'une commande passée avec son code est **livrée**. La gestion (liste des affiliés, suivi et versement des commissions) se fait depuis le back-office admin existant. Les affiliés eux-mêmes doivent pouvoir suivre leurs performances et leurs gains via un mini tableau de bord dédié — une session de formation est prévue avec un premier groupe d'affiliés inscrits au lancement.

## 2. Décisions produit confirmées

1. **Code affilié global** : un seul code par affilié, valable chez tous les vendeurs de la marketplace (pas de code limité à un vendeur) — cohérent avec le fait que c'est la plateforme, pas le vendeur, qui finance la commission.
2. **Commission = 2,5 % du montant effectivement payé** sur la commande, par défaut (25 % de la marge plateforme de 10 %). Taux unique par défaut, pas de coefficient différent entre paiement total et paiement livraison seule — la base de calcul (montant réellement encaissé) s'adapte déjà proportionnellement.
3. **Taux de commission personnalisable par affilié** (ajouté après la conception initiale) : 2,5 % est une valeur par défaut, mais chaque affilié peut se voir attribuer un taux différent — négociation d'une augmentation, ou taux préférentiel décidé par la plateforme pour un affilié qui rapporte particulièrement bien. Voir §4 et §6.
4. **Pas de réduction acheteur** au lancement — commission seule, prix payé inchangé.
5. **Code appliqué** par saisie manuelle OU lien de tracking (`?ref=CODE`), mémorisé côté client jusqu'au checkout. Le paramètre fonctionne sur n'importe quelle URL du site (accueil, boutique, produit) — l'affilié n'a pas besoin d'une page dédiée pour que le tracking fonctionne.
6. **Commission déclenchée à la livraison confirmée** (statut `livree`), pas à la simple validation de commande — évite de commissionner des commandes annulées.
7. **Inscription minimaliste** : nom, email, WhatsApp, pays.
8. **Gestion admin** : CRUD affiliés + suivi/versement des commissions, sur le modèle du système de versements vendeurs déjà en place.
9. **Mini dashboard affilié obligatoire** (décision confirmée après une première itération de conception sans dashboard) : les affiliés doivent pouvoir suivre leurs gains et générer leurs liens eux-mêmes — voir §7.
10. **Liste "Affiliés" dans le lanceur de campagnes WhatsApp** (ajouté après la conception initiale) : les affiliés doivent pouvoir être ciblés comme audience de campagne au même titre que les vendeurs ou les abonnés — voir §11.

## 3. Découverte architecturale clé : les deux chemins vers `livree`

Une commande peut passer au statut `livree` par **deux chemins totalement indépendants**, tous deux en écriture SQL directe sur la même base Postgres (Neon) :

- **API Node** (`marche241-api/src/models/commande.model.ts::updateCommandeStatus`, ligne ~281) — `UPDATE commandes SET statut = ...`
- **Admin Laravel** (`marche241_admin/app/Http/Controllers/CommandesController.php::updateStatut`, ligne ~296) — `MarketplaceDatabase::update('commandes', ...)`, donc aussi un `UPDATE` direct, sans jamais appeler l'API Node.

**Conséquence** : toute logique de création de commission codée uniquement en TypeScript ou uniquement en PHP manquerait un des deux chemins. La seule solution qui voit les deux : un **trigger PostgreSQL** sur la table `commandes`, exécuté côté base peu importe qui a fait l'`UPDATE`.

## 4. Modèle de données (`marche241-api`, SQL brut, suite de `015_add_carte_bancaire_methode_paiement.sql`)

### 016_create_affilies_table.sql

```sql
CREATE TABLE affilies (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  telephone VARCHAR(50) NOT NULL UNIQUE,
  pays VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE, -- format AFF-XXXXXX
  statut VARCHAR(20) NOT NULL DEFAULT 'actif', -- actif | inactif
  taux_commission NUMERIC(5,4) NOT NULL DEFAULT 0.0250, -- personnalisable par affilié
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  date_modification TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_affilies_code ON affilies(code);
CREATE INDEX idx_affilies_statut ON affilies(statut);
```

`taux_commission` est modifiable à tout moment depuis l'admin (§6). Chaque commission créée capture le taux en vigueur *au moment de la création* dans `commissions_affiliees.taux` (voir plus bas) — changer le taux d'un affilié n'affecte donc jamais rétroactivement les commissions déjà générées, seulement les futures.

### 017_add_affilie_columns_to_commandes.sql

```sql
ALTER TABLE commandes
  ADD COLUMN affilie_id INTEGER REFERENCES affilies(id),
  ADD COLUMN code_affilie VARCHAR(20); -- traçabilité, même si le code change plus tard

CREATE INDEX idx_commandes_affilie_id ON commandes(affilie_id);
```

### 018_create_commissions_affiliees_table.sql

```sql
CREATE TABLE commissions_affiliees (
  id SERIAL PRIMARY KEY,
  affilie_id INTEGER NOT NULL REFERENCES affilies(id),
  commande_id INTEGER NOT NULL UNIQUE REFERENCES commandes(id), -- empêche le doublon
  boutique_id INTEGER NOT NULL REFERENCES boutiques(id),
  montant_base NUMERIC(12,2) NOT NULL,
  taux NUMERIC(5,4) NOT NULL, -- taux figé au moment de la création, copié depuis affilies.taux_commission
  montant_commission NUMERIC(12,2) NOT NULL,
  statut VARCHAR(20) NOT NULL DEFAULT 'due', -- due | payee | annulee
  reference_versement VARCHAR(255),
  notifie_le TIMESTAMP,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW(),
  date_versement TIMESTAMP
);
CREATE INDEX idx_commissions_affilie_id ON commissions_affiliees(affilie_id);
CREATE INDEX idx_commissions_statut ON commissions_affiliees(statut);
CREATE INDEX idx_commissions_notifie_le ON commissions_affiliees(notifie_le);
```

Puis le cœur du système, un trigger sur `commandes` — il lit désormais le taux propre à l'affilié plutôt qu'une constante fixe :

```sql
CREATE OR REPLACE FUNCTION fn_creer_commission_affilie() RETURNS TRIGGER AS $$
DECLARE
  v_taux NUMERIC(5,4);
  v_montant_base NUMERIC(12,2);
BEGIN
  v_montant_base := COALESCE(NEW.montant_paye, 0);
  IF v_montant_base <= 0 THEN RETURN NEW; END IF;

  SELECT taux_commission INTO v_taux FROM affilies WHERE id = NEW.affilie_id;
  IF v_taux IS NULL THEN v_taux := 0.0250; END IF; -- garde-fou si jamais l'affilié a disparu

  INSERT INTO commissions_affiliees (affilie_id, commande_id, boutique_id, montant_base, taux, montant_commission, statut)
  VALUES (NEW.affilie_id, NEW.id, NEW.boutique_id, v_montant_base, v_taux, ROUND(v_montant_base * v_taux, 2), 'due')
  ON CONFLICT (commande_id) DO NOTHING;

  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_commandes_creer_commission_affilie
  AFTER UPDATE OF statut ON commandes
  FOR EACH ROW
  WHEN (NEW.statut = 'livree' AND OLD.statut IS DISTINCT FROM 'livree' AND NEW.affilie_id IS NOT NULL)
  EXECUTE FUNCTION fn_creer_commission_affilie();
```

Base de calcul = `montant_paye` au moment de la livraison (déjà maintenu automatiquement par le trigger existant `update_montant_restant()` de la migration 003) — capture naturellement aussi bien un paiement total qu'un paiement livraison-seule, sans coefficient séparé.

Durcissement complémentaire : un second trigger annule (`statut = 'annulee'`) la commission `due` si la commande passe à `annulee`/`remboursee` après avoir été livrée (retour produit) :

```sql
CREATE OR REPLACE FUNCTION fn_annuler_commission_affilie() RETURNS TRIGGER AS $$
BEGIN
  UPDATE commissions_affiliees
  SET statut = 'annulee'
  WHERE commande_id = NEW.id AND statut = 'due';
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_commandes_annuler_commission_affilie
  AFTER UPDATE OF statut ON commandes
  FOR EACH ROW
  WHEN (NEW.statut IN ('annulee', 'remboursee') AND OLD.statut = 'livree')
  EXECUTE FUNCTION fn_annuler_commission_affilie();
```

Ne pas réutiliser `PlatformCommission.php` de l'admin (calcul `/11` pour les versements vendeurs) — le taux d'affiliation est une notion propre à ce système, désormais variable par affilié plutôt qu'une constante globale.

### 019_create_affilie_otp_table.sql (pour le mini dashboard, voir §7)

```sql
CREATE TABLE affilie_codes_connexion (
  id SERIAL PRIMARY KEY,
  affilie_id INTEGER NOT NULL REFERENCES affilies(id),
  code_hash VARCHAR(255) NOT NULL, -- jamais stocké en clair
  tentatives INTEGER NOT NULL DEFAULT 0,
  expire_le TIMESTAMP NOT NULL,
  utilise_le TIMESTAMP,
  date_creation TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_affilie_codes_affilie_id ON affilie_codes_connexion(affilie_id);
```

## 5. Logique applicative `marche241-api`

- **`src/models/affilie.model.ts`** : `create()`, `getByCode()`, `getByEmailOuTelephone()`, `genererCodeUnique()` (format `AFF-XXXXXX`, boucle de vérification d'unicité, même schéma que la génération de référence dans `storage.utils.ts`), `updateTauxCommission()` (appelée depuis l'admin, voir §6).
- **`src/models/commission.model.ts`** : lecture seule côté applicatif (`getAllByAffilie`, `getNonNotifiees`, `marquerNotifiee`) — la création de la ligne se fait uniquement par le trigger SQL, jamais par un `INSERT` applicatif, pour qu'il n'existe qu'un seul endroit qui calcule la commission.
- **`src/controllers/affilie.controller.ts`** :
  - `POST /api/v1/affilies/inscription` — valide via Joi, vérifie unicité, génère le code, insère (avec `taux_commission` par défaut), envoie email/WhatsApp de bienvenue avec le code et le lien principal.
  - `GET /api/v1/affilies/resoudre/:code` — renvoie juste `{valide: boolean}`, pour la validation en direct côté front, sans exposer de PII.
- **`src/controllers/commande.controller.ts::createCommande`** : avant construction de `commandeToCreate`, résoudre `code_affilie` reçu → `AffilieModel.getByCode()` → si affilié actif, poser `affilie_id`/`code_affilie` ; **sinon ignorer silencieusement** (un code invalide ne bloque jamais la commande).
- **`src/models/commande.model.ts`** : ajouter `affilie_id`, `code_affilie` à la whitelist de colonnes persistées.
- **Notification (cron, pas de queue disponible)** : `src/services/affiliate-notification.service.ts::notifierCommissionsEnAttente()`, appelé toutes les 5 min depuis `src/services/cron.service.ts` (même pattern que les tâches cron existantes) : lit les commissions `notifie_le IS NULL`, envoie email (Resend, nouveau template calqué sur `vendeurBienvenue.ts`) + WhatsApp (nouvelle méthode `WhatsAppService.notifyAffiliateCommission`, calquée sur `notifyVendeurNewOrder`), marque `notifie_le`.
- Validation Joi : nouveau schéma `inscriptionAffilieSchema`, et ajout de `code_affilie` (optionnel) au schéma de création de commande.

## 6. Interface de gestion `marche241_admin`

- **`MarketplaceDatabase::TABLES`** (`app/Services/MarketplaceDatabase.php`) : ajouter `'affilies'` et `'commissions_affiliees'` à la whitelist, sinon tout accès lève une exception.
- **Permissions** (`database/seeders/PermissionsSeeder.php`) : `affilies.view`, `affilies.create`, `affilies.edit`, `affilies.taux` (permission dédiée pour modifier `taux_commission` — action financière sensible, séparée de l'édition de profil courante), `commissions.view`, `commissions.verser`.
- **FormRequests** : `StoreAffilieRequest`, `UpdateAffilieRequest` (calqués sur `StoreVendeurRequest`), `UpdateTauxAffilieRequest` (nouveau, `authorize()` vérifie `hasPermission('affilies.taux')`, valide `taux_commission` dans une fourchette raisonnable ex. 0 à 0.10), `UpdateCommissionAffilieRequest` (calqué sur `StoreVersementVendeurRequest`, `authorize()` vérifie `hasPermission('commissions.verser')`).
- **`AffiliesController`** (calqué sur `VendeursController`) : `index`/`store`/`update`/`destroy` via `MarketplaceDatabase`, + une action dédiée `updateTaux` (ou un champ conditionnel dans `update` selon la permission de l'utilisateur connecté). `destroy` désactive (`statut = inactif`) plutôt que supprimer, pour préserver l'intégrité avec `commissions_affiliees`. Important : la création d'un affilié depuis l'admin **appelle l'API Node** (`POST /api/v1/affilies/inscription`) plutôt que de dupliquer la génération de code en PHP — une seule règle métier, un seul endroit.
- **`CommissionsAffilieesController`** : `index` (jointure applicative avec `affilies`/`commandes`, pattern `PaiementsController`), `update` (marque `payee` + `date_versement`, avec `reference_versement` optionnel).
- **Routes** dans `routes/web.php`, groupe authentifié, avec middleware `permission:...` par action.
- **Pages Inertia** : `resources/js/Pages/Affilies.tsx` (liste + modales create/edit/toggle-statut, pattern `Vendeurs.tsx`, avec le taux de commission affiché dans la liste et modifiable via un champ dédié visible seulement si l'utilisateur a la permission `affilies.taux`) et `resources/js/Pages/Commissions.tsx` (liste filtrable par statut + modale "marquer comme versée"). Entrées de menu ajoutées dans le layout de navigation, visibles selon permission.

## 7. Parcours affilié `marche241_v2` : inscription, liens, checkout, mini dashboard

### 7.1 Inscription et capture du lien de tracking

- **`src/lib/services/affiliation.ts`** (nouveau, pattern `session.ts`) : `memoriserCodeAffilie()`/`getCodeAffilieMemorise()`/`effacerCodeAffilieMemorise()` via localStorage avec expiration (~1 mois), `validerCodeAffilie()` (appelle `/affilies/resoudre/:code`), `inscrireAffilie()` (appelle `/affilies/inscription`).
- **Capture du lien de tracking** : composant client monté globalement, lit `useSearchParams().get('ref')` et appelle `memoriserCodeAffilie()` si présent — persiste même si l'utilisateur navigue ensuite sans le paramètre. Fonctionne sur n'importe quelle page du site.
- **`src/app/affiliation/inscription/page.tsx`** (nouveau, calqué sur `src/app/admin/register/page.tsx`) : champs nom/email/téléphone (avec `PhoneNumberInput` + `checkWhatsAppNumber`)/pays (select). Pas de flow de vérification par code à l'inscription (volontairement simple). Écran de confirmation affichant le code généré et le lien principal prêt à copier (`https://marche241.ga/?ref=CODE`).

### 7.2 Génération de liens

Comme la capture `?ref=` fonctionne sur n'importe quelle URL du site, un affilié n'a techniquement besoin que de son code pour rendre traçable n'importe quel lien Marché241 qu'il partage. Pour rester utilisable par un public non technique :

- Le **lien principal** (accueil) est fourni automatiquement à l'inscription et rappelé dans l'email/WhatsApp de bienvenue.
- Un **générateur de lien** simple (intégré au dashboard, §7.3) permet de coller une URL boutique/produit Marché241 et d'obtenir la version avec `?ref=` ajouté proprement, avec bouton copier et partage direct vers WhatsApp.

### 7.3 Mini tableau de bord affilié

Décision confirmée : indispensable pour que les affiliés suivent leurs gains et restent motivés — une session de formation est prévue avec un premier groupe d'affiliés au lancement.

**Authentification** — email + code OTP à 4 chiffres envoyé par email (pas de mot de passe classique) :

- Le **code affilié public** (`AFF-XXXXXX`, utilisé dans les liens de tracking) n'est **jamais** utilisé comme identifiant de connexion — il est exposé publiquement dans les liens partagés, donc totalement séparé du mécanisme d'authentification (voir table `affilie_codes_connexion`, §4).
- Validité du code OTP : 5 à 10 minutes.
- Maximum 5 tentatives avant blocage temporaire (~15 minutes).
- Délai minimum entre deux demandes de renvoi : 30 à 60 secondes (anti-spam email).
- Session après connexion validée : longue durée (~30 jours), token stocké côté client (localStorage), indépendante par appareil — un affilié peut être connecté simultanément sur plusieurs appareils, chacun avec son propre code demandé et son propre jeton.
- Email non reconnu comme affilié : réponse générique ("si cet email est associé à un compte affilié, un code a été envoyé"), jamais de confirmation explicite d'inexistence.
- Affilié désactivé (`statut = inactif`) : connexion refusée avec message explicite plutôt que d'afficher un dashboard figé.

Nouveaux endpoints `marche241-api` :

- `POST /api/v1/affilies/connexion/demander-code` (email) → génère un code à 4 chiffres, le hash et le stocke avec expiration dans `affilie_codes_connexion`, l'envoie par email.
- `POST /api/v1/affilies/connexion/verifier` (email + code) → valide, incrémente `tentatives` en cas d'échec, émet un jeton de session (JWT) en cas de succès.
- Endpoints protégés par ce jeton pour alimenter le dashboard : profil + solde, historique des commissions, historique des versements.

**Fonctionnalités du dashboard (v1)** :

- **Accueil / vue d'ensemble** : solde dû (commissions `due` non encore versées), total déjà versé à vie, nombre de commandes livrées attribuées (mois en cours + total), statut du compte.
- **Génération de liens** : lien principal affiché avec bouton copier, + générateur de lien pour boutique/produit avec partage direct WhatsApp (voir §7.2).
- **Historique des commissions** : liste des commandes ayant généré une commission (date, boutique, montant de base, taux appliqué, montant de commission, statut due/payée/annulée), paginée.
- **Suivi des versements** : historique des paiements reçus (date, montant, référence de versement).
- **Profil** : modifier WhatsApp/email/pays, consulter son code affilié. Le taux de commission est affiché en lecture seule (modifiable uniquement depuis l'admin, §6).

**Explicitement hors scope v1** : statistiques de clics/visites (nécessiterait un tracking d'événements en plus du simple `?ref=`), graphiques d'évolution, export de données, système multi-niveaux (parrainage d'affiliés par affiliés).

Emplacement technique : routes `/affiliation/connexion` et `/affiliation/tableau-de-bord` dans `marche241_v2`.

### 7.4 Checkout

- **`src/components/OrderSummary.tsx`** + **`src/lib/services/commandes.ts`** : ajouter `code_affilie?: string` à `CreerCommandeData` ; champ optionnel au formulaire, pré-rempli avec `getCodeAffilieMemorise()`, validation en direct (debounce) via `validerCodeAffilie()` sans jamais bloquer la soumission ; effacer le code mémorisé après succès de la commande.

## 8. Ordre d'implémentation

1. `marche241-api` — migrations 016/017/018/019 (les triggers doivent exister avant tout code applicatif qui en dépend), déployées sur Neon.
2. `marche241-api` — modèles, endpoints d'inscription/résolution, intégration dans `createCommande`, notification cron. Tester en isolation (curl/Postman).
3. `marche241_admin` — whitelist, permissions (dont `affilies.taux`), FormRequests, contrôleurs, routes, pages (peut démarrer en parallèle de l'étape 2, sauf la création d'affilié qui dépend de l'endpoint Node).
4. `marche241_v2` — capture `?ref=`, page d'inscription, checkout (dépend des endpoints publics de l'étape 2). Indépendant de l'étape 3.
5. `marche241-api` + `marche241_v2` — mini dashboard affilié (OTP, endpoints protégés, pages `/affiliation/connexion` et `/affiliation/tableau-de-bord`, générateur de lien). Dépend des étapes 1-2 pour les données à afficher.
6. `marche241_admin` — liste "Affiliés" dans le lanceur de campagnes WhatsApp (§11). Dépend de l'étape 3 (whitelist `affilies` déjà faite) mais indépendant des étapes 4-5.

## 9. Vérification end-to-end

1. `POST /api/v1/affilies/inscription` → code `AFF-XXXXXX` généré, ligne créée avec `taux_commission = 0.0250` par défaut, notification de bienvenue envoyée.
2. Ouvrir un lien `?ref=AFF-XXXXXX`, vérifier la mémorisation localStorage, naviguer sans le paramètre et confirmer que le code persiste.
3. Passer une commande en **paiement complet** avec le code → vérifier `commandes.affilie_id`/`code_affilie` renseignés.
4. Passer une commande en **paiement livraison seule** avec le code → vérifier que `montant_paye` ne contient que les frais de livraison.
5. Marquer la commande #3 `livree` **depuis l'admin** → vérifier qu'une ligne `commissions_affiliees` est créée avec `montant_commission = montant_base * 0.025`.
6. Marquer la commande #4 `livree` **depuis l'API** (chemin vendeur) → vérifier qu'une commission est aussi créée, avec une base = frais de livraison uniquement — confirme que le taux s'applique correctement dans les deux modes.
7. Rejouer la même transition de statut → vérifier l'idempotence (pas de doublon, grâce à `UNIQUE(commande_id)`).
8. **Modifier le taux de commission** de l'affilié depuis l'admin (ex. 2,5 % → 4 %), passer une nouvelle commande avec son code et la marquer `livree` → vérifier que la nouvelle commission utilise bien 4 %, alors que les commissions #3 et #4 déjà créées gardent leur `taux` de 2,5 % (non rétroactif).
9. Déclencher le cron de notification → vérifier réception email/WhatsApp et `notifie_le` renseigné.
10. Dans l'admin, vérifier l'affichage des commissions, les marquer "versées" avec une référence, vérifier `statut`/`date_versement`.
11. Désactiver l'affilié dans l'admin, repasser une commande avec son code → vérifier qu'il est ignoré silencieusement, commande non bloquée.
12. Faire passer une commande déjà `livree` à `remboursee` → vérifier que sa commission passe automatiquement à `annulee`.
13. Demander un code OTP pour un email affilié → recevoir le code par email, se connecter depuis 2 appareils différents avec 2 codes distincts, vérifier que le dashboard affiche un solde et un historique cohérents avec les données créées ci-dessus.
14. Tester le blocage après 5 tentatives de code erroné, et le délai minimum entre deux demandes de renvoi.
15. Créer une campagne WhatsApp ciblant la liste "Affiliés" → vérifier que le nombre de destinataires affiché correspond aux affiliés actifs avec un téléphone valide, et que l'envoi atteint bien ces contacts.

## 10. Fichiers critiques

- `marche241-api/migrations/018_create_commissions_affiliees_table.sql` (trigger, cœur du système, lit désormais `affilies.taux_commission`)
- `marche241-api/migrations/019_create_affilie_otp_table.sql` (stockage des codes OTP)
- `marche241-api/src/models/commande.model.ts` (whitelist colonnes)
- `marche241-api/src/controllers/commande.controller.ts` (résolution du code à la création)
- `marche241_admin/app/Services/MarketplaceDatabase.php` (whitelist des tables Neon, dont `affilies` pour le lanceur de campagnes)
- `marche241_admin/app/Jobs/LaunchWhatsappCampaignJob.php` (résolution de l'audience "Affiliés")
- `marche241_v2/src/components/OrderSummary.tsx` (champ code affilié au checkout)

## 11. Ajout d'une liste "Affiliés" au lanceur de campagnes WhatsApp (`marche241_admin`)

Le lanceur de campagnes WhatsApp existant (module `Whatsapp*`) permet déjà de cibler plusieurs audiences (abonnés, vendeurs, anciens clients, contacts spécifiques, etc.). Investigation du code existant, patron à suivre pour ajouter "Affiliés" comme nouvelle audience, à l'identique des types déjà en place (ex. `venders`) :

- **`app/Models/WhatsappCampaign.php`** — ajouter une constante `TARGET_AFFILIATES = 'affiliates'` à côté de `TARGET_SUBSCRIBERS`, `TARGET_VENDERS`, etc., et un cas dans `targetLabel()` → `"Affiliés"`.
- **`app/Http/Controllers/WhatsappController.php`** :
  - Validation (`~ligne 280`) : ajouter `affiliates` à la liste `in:subscribers,venders,both,specific,buyers,venders_no_shop,venders_inactive`.
  - Préparation des données pour le formulaire (`campaigns()`, `~lignes 170-230`) : calculer un `affiliatesCount` (nombre d'affiliés actifs avec téléphone valide) et le transmettre en prop Inertia, sur le modèle des compteurs déjà calculés pour les autres audiences.
- **`app/Jobs/LaunchWhatsappCampaignJob.php`**, méthode `buildRecipients()` (`~ligne 248`) : ajouter un cas `TARGET_AFFILIATES` qui délègue à une nouvelle méthode privée `buildAffiliatesRecipients()`, sur le modèle de `buildFilteredVendersRecipients()` — requête `$marketplace->from('affilies')` filtrée sur `statut = 'actif'` et `telephone IS NOT NULL`, retournant `{phone, name}[]`.
- **`app/Services/MarketplaceDatabase.php`** : `affilies` doit déjà être dans la whitelist `TABLES` (ajoutée en §6 pour la gestion CRUD) — aucun changement supplémentaire nécessaire ici, juste s'assurer que cette étape est faite avant.
- **`resources/js/types/whatsapp.ts`** (`~ligne 50`) : ajouter `'affiliates'` au type `CampaignTargetType`, et un cas dans le mapping de libellé (`targetLabel()` côté front, `~ligne 124`).
- **`resources/js/Components/Whatsapp/CreateCampaignModal.tsx`** (`~lignes 223-232`) : ajouter une `<option value="affiliates">Affiliés ({affiliatesCount})</option>` dans le `<select>` de ciblage, et threader la nouvelle prop `affiliatesCount` depuis `resources/js/Pages/Whatsapp/Campaigns.tsx`.

Cette liste "Affiliés" permettra par exemple d'annoncer un changement de taux de commission, une opération spéciale, ou simplement de relancer les affiliés inactifs — directement depuis l'outil de campagne déjà utilisé pour les vendeurs et les clients.
