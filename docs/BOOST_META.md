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
  - Refus par l'équipe : le total payé est remboursé.
  - Clôture ou rejet Meta : le reliquat est remboursé. Il vaut le total payé, moins la dépense réelle (plafonnée au budget média), moins la commission et la TVA gardées au prorata de la dépense (`src/lib/boost/reliquat.ts`).
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
   - La confirmation est idempotente : un paiement en double est ajouté au montant à rembourser.

Les requêtes de transactions qui joignent `commandes` excluent naturellement les paiements de boost. Dans le back-office, les versements et le chiffre d'affaires du tableau de bord les excluent aussi.

## Meta (`src/services/meta-ads.service.ts`)

- La configuration vient des variables d'environnement `META_ACCESS_TOKEN` (system user), `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_INSTAGRAM_ID` et `META_GRAPH_VERSION`.
- `META_DRY_RUN` est activé par défaut. En mode simulé, ou si la configuration est incomplète, la publication renvoie des identifiants `dry_*` et ne fait aucun appel à Meta.
- **Publication** : la campagne, l'ensemble de publicités et la publicité sont créés en `PAUSED`, puis activés tous les trois.
  - Budget `lifetime` exprimé dans la devise du compte publicitaire.
  - `advantage_audience: 0`.
  - Villes et centres d'intérêt résolus via `search` (`adgeolocation`, `adinterest`).
- **Synchronisation** (`GET /cron/boosts/sync` et node-cron toutes les 3 h) :
  - insights jour par jour (`time_increment=1`) depuis la date de début ;
  - lecture du statut effectif de la publicité : `DISAPPROVED` entraîne `rejete_meta` ;
  - clôture automatique à la date de fin ou quand le budget est épuisé.
- **Estimations** : audience via `reachestimate`. Impressions par jour à partir du CPM du compte sur 90 jours, sinon avec la fourchette CPM des paramètres.

## Routes

| Accès | Routes |
|---|---|
| Vendeur (JWT, propriétaire de la boutique) | `GET /boosts/parametres`, `GET /boosts/prefill`, `POST /boosts/devis`, `POST /boosts/estimation/{audience,impressions}`, `GET /boosts/boutique/:boutiqueId`, `POST /boosts`, `GET\|PUT\|DELETE /boosts/:id`, `POST /boosts/:id/{soumettre,annuler-soumission,paiement,pause,reprendre}` |
| Back-office (`x-service-key` seule, sans JWT) | `GET /boosts/admin`, `GET /boosts/admin/stats`, `GET /boosts/admin/:id`, `POST /boosts/admin/:id/{approuver,refuser,pause,reprendre,cloturer,rembourse}`, `GET\|PUT /boosts/admin/parametres`, `GET /boosts/admin/meta/sante` |
| Cron (`CRON_SECRET_KEY`) | `GET /cron/boosts/sync` |

Le détail des routes est dans Swagger (`/api/docs`, tag `Boosts`).

## Tests

- `npm test` : tests unitaires (devis, reliquat, transitions, UTM, planning, client Graph, payloads Meta avec `fetch` simulé, estimations).
- Test d'intégration HTTP, de bout en bout, contre une base Postgres **locale** (le test refuse de viser Neon) :

  ```
  BOOST_IT_DATABASE_URL=postgres://postgres@localhost:5432/base_de_test npx tsx --test src/services/boost.integration.test.ts
  ```

  Le schéma est réinitialisé à chaque exécution : `tests/boost/schema-minimal.sql` puis les migrations 026 et 027. `DATABASE_SSL=false` est positionné automatiquement.

## Mise en production

1. Appliquer `026_create_boosts_tables.sql` puis `027_extend_transactions_for_boost.sql`, d'abord sur une branche Neon.
2. Renseigner les variables `META_*` et garder `META_DRY_RUN=true` jusqu'au premier test réel avec le plus petit pack.
3. Back-office : exécuter `php artisan db:seed --class=PermissionsSeeder` pour ajouter les permissions `boosts.view`, `boosts.manage` et `boosts.settings`.
