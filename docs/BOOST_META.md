# Boost publicitaire Meta Ads (Facebook & Instagram)

Le vendeur paie une publicité depuis son espace (`marche241_v2`, `/admin/[boutique]/boost`). L'équipe Marché 241 la valide dans le back-office (`marche241_admin`, `/boosts`), puis l'API la publie sur le compte publicitaire Meta de Marché 241. Le fonctionnement reprend celui de `boost_meta` (Eventime Ads), avec deux différences : le paiement se fait à l'acte, et les remboursements sont traités à la main.

La « mise en avant sur la plateforme » est affichée dans le parcours vendeur, mais elle est désactivée (`parametres.types.plateforme = false`).

## Cycle de vie

```
brouillon → en_attente_paiement → (paiement eBilling confirmé) en_attente_validation
  → approuver → actif ⇄ en_pause → termine
  sorties : refuse (équipe), rejete_meta (revue Meta DISAPPROVED), erreur (publication en échec, republiable)
```

- **Remboursement** : `statut_remboursement` passe de `aucun` à `a_rembourser`, puis à `rembourse`. Le montant à rembourser est stocké dans `montant_a_rembourser_fcfa`.
  - Refus par l'équipe : le total payé est remboursé, **hors frais d'encaissement**.
  - Clôture ou rejet Meta : le reliquat est remboursé. Il vaut le total payé, moins la dépense réelle (plafonnée au budget média), moins la commission et la TVA gardées au prorata de la dépense, moins les frais d'encaissement (`src/lib/boost/reliquat.ts`).
  - **Frais d'encaissement** : `frais_encaissement_bps` (paramètre, 250 = 2,5 %, le taux eBilling) est appliqué au total et figé sur le boost à la soumission (`boosts.frais_encaissement_fcfa`, migration 029). Ces frais ne sont jamais remboursés ; le vendeur en est informé avant de payer. Les boosts soumis avant la migration ont 0 (remboursement intégral). Un paiement en double reste remboursé en totalité.
- **Transitions autorisées** : `src/lib/boost/transitions.ts`. Chaque changement de statut est conditionnel (`UPDATE … WHERE statut = ANY(...)`), ce qui rend les actions idempotentes.

## Tarification

Le vendeur choisit un **total payé**. Il peut prendre un pack ou saisir un montant libre. Le budget média se déduit du total : `media = total − max(commission_min, media × commission_bps)` (`src/lib/boost/devis.ts`).

Les valeurs par défaut sont dans la table `boost_parametres` et se modifient dans le back-office :

| Paramètre | Valeur par défaut |
|---|---|
| Packs | 3 000 / 7 500 / 15 000 / 30 000 FCFA, durées 3 / 5 / 7 / 10 j |
| Commission | 2 000 bps, minimum 1 000 FCFA |
| TVA | 0 |
| Total payé | de 3 000 à 500 000 FCFA |
| Durée | de 3 à 14 jours |
| Budget média minimum par jour | 600 FCFA |
| Taux de change | 600 FCFA/USD |
| CPM estimé | de 46 à 85 FCFA |
| Kill switch | désactivé |

## Paiement (à l'acte)

1. `POST /boosts/:id/soumettre` vérifie le boost. En cas d'erreur, l'API renvoie `VALIDATION_ERROR` avec `errors[]` par champ. Sinon, elle fige le devis et ajoute les paramètres UTM au lien.
2. `POST /boosts/:id/paiement` crée la facture eBilling avec le montant côté serveur, crée la transaction (`type_paiement = 'boost'`, `boost_id`, `commande_id` NULL), puis lance le push USSD. En mode `carte`, l'API renvoie l'URL de paiement par carte.
3. Le front interroge `GET /paiements/verification/:bill_id`, le flux existant. Quand la transaction est payée, `BoostService.confirmerPaiement()` fait passer le boost en `en_attente_validation`.
   - Le montant est vérifié par rapport à `boosts.total_fcfa`.
   - La confirmation est idempotente (un même `transaction_id` n'est traité qu'une fois). Un paiement en double, ou confirmé alors que le boost n'est plus en attente de paiement (retour en brouillon), est ajouté au montant à rembourser.

Les requêtes de transactions qui joignent `commandes` excluent naturellement les paiements de boost. Dans le back-office, les versements et le chiffre d'affaires du tableau de bord les excluent aussi.

## Meta (`src/services/meta-ads.service.ts`)

- **Connexion centralisée** (`src/services/meta-connexion.service.ts`, table `meta_connexion`, migration 028) :
  - l'environnement ne contient que les secrets `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN` (jeton permanent d'un utilisateur système) et le garde-fou `META_DRY_RUN` ;
  - le compte publicitaire et la Page sont découverts (`me/adaccounts`, `me/accounts`) puis choisis dans le back-office ; le compte Instagram est déduit de la Page ;
  - la vérification (`debug_token`, compte, Page) enregistre en base la validité du jeton, ses permissions, la devise, le fuseau et le statut du compte. Elle est relancée à chaque passage du cron de synchro (hors mode simulé) ;
  - chaque appel Graph porte `appsecret_proof` ; la version de Graph est figée dans le code (`META_GRAPH_VERSION`, `src/lib/meta/graph.ts`).
- `META_DRY_RUN` est activé par défaut : la publication renvoie des identifiants `dry_*` sans appel à Meta. Hors mode simulé, une connexion incomplète (secret absent, compte ou Page non choisi, jeton invalide, permission `ads_management` absente, compte non actif) **bloque l'approbation** avec `409 META_NON_CONFIGURE` au lieu de simuler en silence. Les estimations se replient alors sur la fourchette CPM.
- **Publication** : la campagne, l'ensemble de publicités et la publicité sont créés en `PAUSED`. Ils ne passent en `ACTIVE` qu'après le verrou du statut `actif` en base. Si l'activation échoue, le boost repasse en `erreur` avec les identifiants Meta conservés (la republication réactive la même campagne).
  - Budget `lifetime` exprimé dans la devise du compte publicitaire.
  - `advantage_audience: 0`.
  - Villes et centres d'intérêt : identifiants Meta **figés** et vérifiés dans `src/config/ciblage-boost.config.ts` (aucune recherche à la publication). L'estimation d'audience (`reachestimate`) utilise exactement le même ciblage. Les intérêts sont regroupés par thème (`groupes_interets` dans `GET /boosts/parametres`).
- **Synchronisation** (`GET /cron/boosts/sync` et node-cron toutes les 3 h) :
  - insights jour par jour (`time_increment=1`) depuis la date de début ;
  - lecture du statut effectif de la publicité : `DISAPPROVED` entraîne `rejete_meta` ;
  - clôture automatique à la date de fin ou quand le budget est épuisé.
- **Estimations** : audience via `reachestimate`. Impressions par jour à partir du CPM du compte sur 90 jours, sinon avec la fourchette CPM des paramètres.

## Routes

| Accès | Routes |
|---|---|
| Vendeur (JWT, propriétaire de la boutique) | `GET /boosts/parametres`, `GET /boosts/prefill`, `POST /boosts/devis`, `POST /boosts/estimation/{audience,impressions}`, `GET /boosts/boutique/:boutiqueId`, `POST /boosts`, `GET\|PUT\|DELETE /boosts/:id`, `POST /boosts/:id/{soumettre,annuler-soumission,paiement,pause,reprendre}` |
| Back-office (`x-service-key` seule, sans JWT) | `GET /boosts/admin`, `GET /boosts/admin/stats`, `GET /boosts/admin/:id`, `POST /boosts/admin/:id/{approuver,refuser,pause,reprendre,cloturer,rembourse}`, `GET\|PUT /boosts/admin/parametres`, `GET /boosts/admin/meta/{sante,decouverte}`, `PUT /boosts/admin/meta/connexion`, `POST /boosts/admin/meta/verifier` |
| Cron (`CRON_SECRET_KEY`) | `GET /cron/boosts/sync` |

Le détail des routes est dans Swagger (`/api/docs`, tag `Boosts`).

## Tests

- `npm test` : tests unitaires (devis, reliquat, transitions, UTM, planning, client Graph, payloads Meta avec `fetch` simulé, estimations).
- Test d'intégration HTTP, de bout en bout, contre une base Postgres **locale** (le test refuse de viser Neon) :

  ```
  BOOST_IT_DATABASE_URL=postgres://postgres@localhost:5432/base_de_test npx tsx --test src/services/boost.integration.test.ts
  ```

  Le schéma est réinitialisé à chaque exécution : `tests/boost/schema-minimal.sql` puis les migrations 026, 027 et 028 (028 appliquée deux fois pour vérifier l'idempotence). `DATABASE_SSL=false` est positionné automatiquement.

## Mise en production

1. Appliquer `026_create_boosts_tables.sql`, `027_extend_transactions_for_boost.sql` puis `028_create_meta_connexion.sql`, d'abord sur une branche Neon.
2. Renseigner `META_APP_ID`, `META_APP_SECRET` et `META_ACCESS_TOKEN`, garder `META_DRY_RUN=true`, puis choisir le compte publicitaire et la Page dans le back-office (Boosts → Paramètres → Connexion Meta) et vérifier que l'état est « prêt ».
3. Passer `META_DRY_RUN=false` seulement pour le premier test réel avec le plus petit pack.
4. Back-office : exécuter `php artisan db:seed --class=PermissionsSeeder` pour ajouter les permissions `boosts.view`, `boosts.manage` et `boosts.settings`.
