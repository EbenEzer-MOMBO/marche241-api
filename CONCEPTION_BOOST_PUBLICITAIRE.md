# Conception — Service Boost publicitaire (Meta Ads) Marché241

Statut : brouillon de conception, à valider avant implémentation.
Périmètre : `marche241-api` (system of record), `marche241_admin` (supervision), `marche241_v2` (UI vendeur côté storefront/espace boutique).

## 1. Rappel du besoin

Les vendeurs Marché241 ne font pas leur propre communication et attendent que la plateforme fasse la promotion pour eux. Objectif : leur permettre de "booster" une boutique ou un produit sur Facebook/Instagram sans jamais toucher à Meta Ads Manager ni créer de compte Facebook Business personnel.

## 2. Correction importante sur le découpage technique

La note de conception précédente supposait deux apps Laravel. Après inspection du code, ce n'est pas le cas :

- **`marche241-api`** : Node.js / Express 5 / TypeScript, PostgreSQL (Neon) via `pg` brut (pas d'ORM — chaque modèle est une classe avec des méthodes statiques et du SQL paramétré, ex. `boutique.model.ts`, `produit.model.ts`, `transaction.model.ts`). Tâches planifiées gérées par `node-cron` dans `CronService` (`src/services/cron.service.ts`). Migrations en SQL brut numérotées dans `migrations/` (dernière : `018_add_est_verifiee_to_boutique.sql`). C'est le system of record : boutiques, produits, commandes, transactions, vendeurs.
- **`marche241_admin`** : Laravel 12 + Inertia + React, déployé sur Laravel Cloud. Contient déjà une intégration Meta fonctionnelle à réutiliser comme patron : le module WhatsApp Business (`app/Services/Meta/*`) avec OAuth Meta (`WhatsAppBusinessConnectionService`), vérification de signature webhook HMAC (`VerifyWhatsappWebhookSignature`), jobs de campagne en file d'attente (`LaunchWhatsappCampaignJob`), et synchro de stats (`SyncWhatsappCampaignStats`). Le service Boost doit suivre le même patron de connexion Meta (OAuth + stockage sécurisé des tokens + jobs asynchrones), pas le réinventer.
- **`marche241_v2`** : à confirmer côté UI vendeur (espace boutique) où le vendeur déclenchera un boost.

Décision confirmée : toute la logique métier du Boost (validation, appels Marketing API Meta, statut, argent) vit dans `marche241-api`, en Node/Express — pas en Laravel. `marche241_admin` reste consommatrice via des endpoints admin-scopés de l'API (même patron que les routes `email` actuelles, protégées par une clé de service admin), jamais de logique Meta dupliquée côté Laravel.

Confirmé (question reportée de la note précédente, tranchée par Eben) : `marche241-api` et `marche241_admin` sont connectés à deux bases Postgres distinctes. Conséquence directe pour la conception des endpoints de reporting (§7) : `marche241_admin` ne doit jamais lire en direct dans la base de `marche241-api` — tout reporting Boost côté admin (liste des boosts, dépenses agrégées, santé du compte pub) passe obligatoirement par les endpoints admin-scopés de l'API, jamais par un accès DB direct.

## 3. Décisions d'architecture publicitaire (rappel, confirmées)

- Régie centralisée : un seul Business Manager Marché241, un seul compte publicitaire Meta (limite Meta tant que l'entreprise n'est pas vérifiée). Pas de compte Facebook du vendeur, pas de portefeuille business par boutique.
- Distinction entre boutiques au niveau campagne/ensemble de pub (nommage `boost_<boutique_id>_<AAAA-MM>`, tag interne `boost_id`), pas au niveau compte.
- Catalogue produits synchronisé vers Meta Commerce Manager pour la pub dynamique par produit (phase 2, voir §8).
- Page annonceur toujours "Marché241" ; le lien de destination pointe vers la page produit/boutique précise sur marche241.ga avec tracking UTM + Facebook Attribution par boost. Engagement (commentaires, Messenger) sur cette Page : pas de modération humaine dédiée pour le MVP — réponse automatique (Instant Reply Messenger / réponse auto aux commentaires) qui renvoie systématiquement vers le site marche241.ga.
- Vérification d'entreprise Meta à lancer tôt (limite les plafonds de dépense tant qu'elle n'est pas faite).
- Risque systémique de facturation Meta (carte à seuil, pas prépayée) : mitigation par marge de sécurité sur la carte, suivi des statuts de facturation, carte de secours enregistrée.

## 4. Porte-monnaie interne vs paiement à l'acte — décidé

La note initiale prévoyait un "porte-monnaie interne" (solde préchargé). Constat après inspection : **ce concept n'existe pas encore dans le schéma**. La table `transactions` actuelle est toujours rattachée à une `commande_id` et le `type_paiement` (`paiement_complet`, `acompte`, `frais_livraison`, `solde_apres_livraison`, `complement`) est pensé pour le cycle de commande, pas pour un solde libre.

Deux options :

1. **Paiement à l'acte (recommandé pour la v1)** : le vendeur paie directement le boost au moment de la création (mobile money/carte, même flux que pour une commande), sans notion de solde stocké. Impact schéma minimal : une nouvelle valeur de paiement liée à un `boost_id` plutôt qu'à une `commande_id`, ou une table `boost_paiements` dédiée qui référence les mêmes méthodes de paiement. Pas de ledger à maintenir, pas de risque de solde qui diverge.
2. **Portefeuille prépayé (vision cible, v2+)** : le vendeur recharge un solde FCFA, puis les boosts le débitent. Nécessite une vraie table `portefeuilles_vendeur` + `mouvements_portefeuille` (crédit/débit), une politique de remboursement en cas de rejet Meta, et une réconciliation comptable. Plus proche de l'expérience Jumia/Amazon Ads mais complexité et surface de risque (fraude, remboursements, solde qui ne matche plus) largement supérieures.

Décision (validée par Eben) : **option 1** pour le MVP (paiement à l'acte). On pourra migrer vers un portefeuille prépayé plus tard si le volume de boosts le justifie (voir Phase 4, §8), mais ce n'est pas dans le périmètre de la première itération.

## 5. Modèle de données proposé (marche241-api, SQL brut, suite de `018_...`)

```sql
-- 019_create_boosts_table.sql
CREATE TYPE type_boost AS ENUM ('boutique', 'produit');
CREATE TYPE statut_boost AS ENUM (
  'en_attente_paiement', -- créé, paiement pas encore confirmé
  'en_attente_revue',    -- payé, soumis à Meta, en attente de la revue
  'actif',
  'rejete',
  'en_pause',
  'termine',
  'erreur'               -- échec technique (appel Meta en échec, à retraiter)
);

CREATE TABLE boosts (
  id SERIAL PRIMARY KEY,
  boutique_id INTEGER NOT NULL REFERENCES boutiques(id),
  produit_id INTEGER REFERENCES produits(id), -- NULL si boost de boutique
  type_boost type_boost NOT NULL,
  statut statut_boost NOT NULL DEFAULT 'en_attente_paiement',
  budget_fcfa INTEGER NOT NULL,          -- forfait choisi par le vendeur
  duree_jours INTEGER NOT NULL,
  ciblage_zone VARCHAR(100) NOT NULL,    -- ex. 'libreville', 'gabon' (simplifié pour le vendeur)
  lien_destination TEXT NOT NULL,        -- URL marche241.ga trackée (UTM)
  meta_campaign_id VARCHAR(64),
  meta_adset_id VARCHAR(64),
  meta_ad_id VARCHAR(64),
  meta_dernier_statut VARCHAR(64),       -- dernier statut brut renvoyé par Meta
  meta_derniere_erreur TEXT,
  date_debut TIMESTAMPTZ,
  date_fin TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_boosts_boutique ON boosts(boutique_id);
CREATE INDEX idx_boosts_statut ON boosts(statut);

-- Historique des changements de statut / événements Meta, pour audit et debug
CREATE TABLE boost_evenements (
  id SERIAL PRIMARY KEY,
  boost_id INTEGER NOT NULL REFERENCES boosts(id),
  type_evenement VARCHAR(64) NOT NULL, -- 'paiement_confirme', 'campagne_creee', 'revue_meta', 'stats_maj', 'erreur', ...
  donnees JSONB,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stats agrégées récupérées périodiquement, pour affichage vendeur sans re-appeler Meta à chaque vue
CREATE TABLE boost_stats (
  boost_id INTEGER PRIMARY KEY REFERENCES boosts(id),
  impressions BIGINT NOT NULL DEFAULT 0,
  clics BIGINT NOT NULL DEFAULT 0,
  depense_fcfa INTEGER NOT NULL DEFAULT 0,
  date_maj TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Le paiement du boost (option 1, §4) : soit une nouvelle table légère `boost_paiements` (même forme que `transactions` mais sans `commande_id` obligatoire), soit rendre `commande_id` nullable sur `transactions` et ajouter `boost_id` + une valeur `'boost'` à l'enum `type_paiement`. La deuxième option réutilise l'infrastructure de paiement existante (mobile money/carte déjà branchés) et le dashboard transactions actuel sans dupliquer de code — à privilégier si l'impact sur les requêtes existantes qui filtrent par `commande_id NOT NULL` est vérifié comme sûr.

## 6. Flux fonctionnel détaillé

1. Vendeur choisit un boost (boutique ou produit), un forfait (budget + durée prédéfinis, ex. "5 000 FCFA / 3 jours"), et une zone de ciblage simplifiée, depuis son espace boutique (marche241_v2 ou storefront).
2. `POST /api/v1/boutiques/:id/boosts` (ou `/produits/:id/boosts`) crée l'enregistrement `boosts` en `en_attente_paiement`.
3. Paiement déclenché via le flux mobile money/carte existant (`paiement.controller.ts`), avec `boost_id` en référence. Sur confirmation du paiement (même mécanisme que pour une commande), passage à `en_attente_revue` et événement `paiement_confirme` journalisé.
4. `BoostService.publier(boostId)` construit la créa (image produit ou boutique + titre + description, prises du catalogue existant) et le lien tracké, puis appelle `MetaAdsService` dans l'ordre : Campagne → Ensemble de publicités (ciblage, budget, durée) → Publicité, chacun tagué avec `boost_id`.
5. Les identifiants Meta renvoyés sont stockés (`meta_campaign_id`, `meta_adset_id`, `meta_ad_id`).
6. Un job planifié (`node-cron`, même patron que `CronService`) interroge périodiquement le statut de revue Meta (pas de webhook fiable par annonce sur la Marketing API — le polling est le mécanisme standard). Passage à `actif` ou `rejeté` selon la réponse, notification vendeur, remboursement si rejeté (option 1 : remboursement du paiement à l'acte).
7. Un second job planifié récupère les statistiques (impressions/clics/dépense) et alimente `boost_stats`, affiché simplifié côté vendeur.
8. Fin de campagne (budget épuisé ou date atteinte) → `terminé`, récap final au vendeur.

Point technique clé, déjà noté : tout est asynchrone côté Meta (retries, pas d'appel synchrone bloquant dans la requête HTTP du vendeur). Le patron `LaunchWhatsappCampaignJob` côté admin peut servir de référence de style pour la gestion des retries/erreurs, même si l'implémentation Boost est côté Node.

## 7. Découpage technique proposé côté `marche241-api`

Nouveaux fichiers, dans le style existant (classes statiques + SQL paramétré) :

- `src/models/boost.model.ts` — CRUD `boosts`, `boost_evenements`, `boost_stats`.
- `src/services/meta-ads.service.ts` — encapsule tous les appels Marketing API Meta (créer campagne/adset/ad, lire statut de revue, lire insights). Isole le SDK/HTTP Meta du reste du code, comme `whatsapp.service.ts` isole déjà Meta Graph pour WhatsApp.
- `src/services/boost.service.ts` — orchestration : validation métier (budget min/max, créa exploitable), création du boost, déclenchement de la publication Meta, gestion des transitions de statut.
- `src/controllers/boost.controller.ts` + `src/routes/boost.routes.ts` — endpoints vendeur (créer, lister, voir un boost, annuler) et endpoints admin-scopés (lister tous, forcer pause, forcer remboursement, relancer) protégés par la même clé de service admin que les routes `email`.
- Ajout dans `cron.service.ts` (ou nouveau `boost-cron.service.ts` si la classe grossit trop) : `scheduleSyncStatutsBoost()` (revue Meta) et `scheduleSyncStatsBoost()` (impressions/clics/dépense).
- `migrations/019_create_boosts_table.sql` (et suivantes) suivant la numérotation existante.
- Config : `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN` (ou refresh token longue durée), `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_PIXEL_ID` dans `.env`, jamais commités (suivre `.env.example`).

Côté `marche241_admin` : un écran de supervision (liste boosts, statuts, dépenses agrégées, alerte santé du compte pub Meta) qui consomme ces endpoints admin-scopés — pas de logique Meta dupliquée. Le patron `WhatsappController` + `Services/Meta/*` montre déjà comment Laravel appelle une API Graph externe et gère les erreurs ; ici Laravel n'appelle pas Meta directement, il appelle `marche241-api`.

## 8. Phasage recommandé

- **Phase 0 — Prérequis** : lancer la vérification d'entreprise Meta (documents, site actif) ; créer le Business Manager et le compte publicitaire unique ; obtenir un token d'accès système (system user token) longue durée pour l'API, pas un token utilisateur qui expire.
- **Phase 1 — MVP boost boutique, paiement à l'acte** : boost de boutique uniquement (pas encore produit), forfaits fixes (budget + durée prédéfinis, pas de saisie libre), ciblage simplifié (2-3 zones prédéfinies), paiement à l'acte (option 1, §4), polling statut + stats basiques. Pas de catalogue Meta Commerce Manager à ce stade.
- **Phase 2 — Boost produit + catalogue dynamique** : synchro catalogue produits vers Meta Commerce Manager, boost par produit avec créa dynamique.
- **Phase 3 — Supervision admin** : écran santé compte pub (alertes facturation/rejet carte), remboursements/pauses manuels, dépenses agrégées par boutique.
- **Phase 4 — Portefeuille prépayé (si le volume le justifie)** : migration du paiement à l'acte vers un vrai solde interne (option 2, §4).

## 9. Forfaits de boost — proposition à valider avec Eben

Point de départ chiffré, pas une vérité mesurée : à ajuster après les premières campagnes réelles (Phase 1). Logique voulue : un palier d'entrée accessible ("pour toutes les poches"), une marge Marché241 qui baisse en pourcentage mais grimpe en valeur absolue à mesure que le palier monte — ça garde l'entrée de gamme rentable sans décourager les petits vendeurs, et rend les gros paliers plus attractifs que d'aller négocier seul sur Meta Ads Manager.

| Palier | Prix payé par le vendeur | Dépense pub réelle transmise à Meta | Marge Marché241 | Durée | Ciblage |
|---|---|---|---|---|---|
| Découverte | 3 000 FCFA | ~2 000 FCFA | ~1 000 FCFA (33 %) | 3 jours | Libreville |
| Standard | 7 500 FCFA | ~5 500 FCFA | ~2 000 FCFA (27 %) | 5 jours | Libreville + Port-Gentil |
| Boost Pro | 15 000 FCFA | ~11 500 FCFA | ~3 500 FCFA (23 %) | 7 jours | Gabon entier |
| Boost Max | 30 000 FCFA | ~24 000 FCFA | ~6 000 FCFA (20 %) | 10 jours | Gabon entier + reciblage des visiteurs du site |

Réserves à garder en tête avant de figer ces chiffres :

- Conversion utilisée pour construire la grille : ~600 FCFA/USD, à vérifier. Il n'est pas confirmé que le XAF soit une devise de facturation acceptée par Meta pour le compte publicitaire (recherche non concluante) — si le compte doit être facturé en USD/EUR, prévoir une marge de sécurité change (~5-10 %) en plus de la marge commerciale ci-dessus, en cohérence avec le risque de facturation déjà noté en §3. À vérifier pendant la Phase 0 (vérification d'entreprise Meta).
- Les repères Meta habituels (10-25 USD/jour pour une optimisation correcte de l'algorithme) viennent de marchés US/EU à CPM élevé ; un marché comme Libreville a probablement un CPM très inférieur, donc le palier Découverte (~667 FCFA/jour, sous ces repères) peut très bien fonctionner — mais ça reste à confirmer avec de vraies données une fois les premières campagnes lancées, pas avant.
- Le palier Découverte tourne sous le seuil que Meta considère confortable pour l'optimisation par algorithme : le limiter à l'objectif "notoriété/reach" plutôt que "trafic" ou "conversions", qui ont besoin de plus de volume pour bien fonctionner.
- Montants et durées à figer définitivement pour la Phase 1 une fois validés — nécessaire pour dimensionner l'UI vendeur et les règles de validation budget min/max côté Meta.
