# marche241-api — API centrale Marché 241

> Contexte plateforme, contrats inter-projets et conventions Linear : voir `../CLAUDE.md` (chargé automatiquement dans le workspace). Cette API est la **source de vérité** consommée par `marche241_v2` (front) et `marche241_admin` (back-office).

## Stack

Node ≥ 22 · Express 5 · TypeScript (strict, `tsc` → `dist/`) · PostgreSQL Neon via `pg` (SQL brut, pas d'ORM) · Joi · Cloudflare R2 (`@aws-sdk/client-s3`) · JWT + WebAuthn (`@simplewebauthn/server`) · Sentry · `node-cron` · WebSocket (`ws`) · web-push · Swagger (`swagger-jsdoc`).

## Commandes

```bash
npm run dev      # ts-node-dev, rechargement auto (port via PORT, 3001 en local)
npm run build    # tsc + copie de src/public → dist/  — à lancer pour vérifier le typage
npm start        # node dist/index.js
```

- `npm test` : tests unitaires `node:test` via `tsx` (`src/**/*.test.ts`, sans base ni réseau). Le test d'intégration du boost (`src/services/boost.integration.test.ts`) ne s'exécute que si `BOOST_IT_DATABASE_URL` vise une base Postgres **locale** jetable (cf. `docs/BOOST_META.md`). Les scripts `test-*.ts` à la racine sont des scripts manuels (`npx ts-node test-xxx.ts`) qui frappent une vraie base — ne pas les lancer sans accord.
- Vérification minimale après modification : `npx tsc --noEmit`.
- Swagger : `http://localhost:3001/api/docs` (JSON : `/api/docs.json`).

## Architecture (`src/`)

```
index.ts / app.ts / instrument.ts (Sentry, importé en premier)
config/      database.ts (Pool pg, helper `query`) · storage.ts (R2)
routes/      *.routes.ts — schémas Joi + chaîne de middlewares ; montage dans routes/index.ts sous API_PREFIX (/api/v1)
controllers/ classes à méthodes statiques (ex. ProduitController.creer)
models/      accès SQL par entité (requêtes paramétrées $1, $2…)
services/    email (Resend), whatsapp (Meta + Green API), push, passkey, billet, htmltopdf, cron, websocket, monitor
middlewares/ auth (JWT vendeur), service-auth (x-service-key admin), cron-auth, validation (Joi), rate-limit, captcha (Turnstile), upload (multer), error, logger
utils/       validation.schemas*.ts, swagger-schemas*.ts, jwt, storage, logger…
lib/database-types.ts   types du schéma — COPIE DE RÉFÉRENCE (cf. ../CLAUDE.md)
```

## Conventions

- **Ajouter un endpoint** : schéma Joi (messages d'erreur en français) → `validate` / `validateParams` / `validateQuery` → middleware d'auth adapté → méthode de contrôleur → modèle → annotation Swagger → montage dans `routes/index.ts` si nouveau module.
- **Auth** : `auth` (vendeur obligatoire), `optionalAuth`, `authOrServiceKey` (vendeur **ou** admin — le contrôleur doit gérer `req.isAdmin` sans `req.vendeur`), `requireCronSecret`. Toujours vérifier qu'un vendeur n'agit que sur **ses** boutiques/produits/commandes.
- **SQL** : toujours paramétré. Les noms de colonnes interpolés doivent venir d'une liste blanche (`COLONNES_AUTORISEES` dans les modèles). Opérations multi-tables (commande + paiement + stock) dans une transaction.
- **Réponses** : `{ success: true, <ressource> }` / `{ success: false, message, code? }` ; erreurs de validation au format `VALIDATION_ERROR` (`docs/ERREURS_VALIDATION.md`). Ne pas changer une forme de réponse sans mettre à jour le front et l'admin.
- **Migrations** : fichier `migrations/NNN_description_snake_case.sql` (numéro suivant, actuellement après `023`), idempotent si possible (`IF NOT EXISTS`), puis mise à jour de `src/lib/database-types.ts` **et** des copies front/admin. Appliquer d'abord sur une branche Neon ; ne jamais exécuter sur la base principale sans accord.
- **Uploads** : via `utils/storage.utils.ts` (R2) — URLs publiques basées sur `STORAGE_PUBLIC_URL`.
- **Logs** : `utils/logger` (pas de `console.log` dans le code applicatif).
- Nommage métier en français (`boutique_id`, `statut`, `prix_promo`, `communes_livraison`…).

## Domaines sensibles

- **Paiements** (eBilling / mobile money Airtel & Moov / carte) : webhooks, réconciliation (`PAYMENT_RECONCILE_AFTER_MINUTES`), paiements partiels et acomptes (`PAIEMENTS_PARTIELS_GUIDE.md`, `CORRECTION_MAJORATION_TRANSACTION.md`). Toute modification = relire le flux complet transaction → commande.
- **Crons** : expiration des transactions, annulation des commandes orphelines, statut « nouveau » des produits (`INSTALLATION_CRON.md`).
- **Variants / quantités** : `docs/VARIANTS-QUANTITES.md`, `NOUVEAU_FORMAT_VARIANTS.md`.
- **Billets d'événement** : `billet.service.ts`, PDF via htmltopdf, envoi WhatsApp.

## Impacts inter-projets à vérifier

- Route ou champ modifié → Grep dans `../marche241_v2/src/lib/services` et `../marche241_admin/app/Services/MarketplaceApi.php`.
- Nouvelle origine front → `CORS_ORIGIN`, `FRONTEND_URL`, `WEBAUTHN_ORIGIN` / `WEBAUTHN_RP_ID`.
- Nouvelle table lue par l'admin → l'ajouter à `MarketplaceDatabase::TABLES` côté admin.
