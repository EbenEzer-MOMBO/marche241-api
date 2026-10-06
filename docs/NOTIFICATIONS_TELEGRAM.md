# Notifications Telegram de l'équipe

L'API publie les événements importants de la plateforme sur un canal Telegram de l'équipe Marché 241.

## Configuration

- **Environnement de l'API** : `TELEGRAM_BOT_TOKEN` (jeton du bot, créé avec @BotFather) et `ADMIN_URL` (base des liens vers le back-office). Le jeton n'est jamais stocké en base ni renvoyé par l'API.
- **Back-office** : Paramètres → Notifications. On y règle le canal (`@nom_du_canal` ou identifiant `-100…`), l'interrupteur général et les événements cochés. Ces réglages sont dans la table `notifications_telegram` (ligne unique, migration 031).
- Le bot doit être **administrateur du canal**, avec le droit de publier. À l'enregistrement, l'API vérifie l'accès au canal (`getChat`) si le jeton est présent.

## Événements (`src/config/notifications.config.ts`)

| Groupe | Événement | Déclencheur |
|---|---|---|
| Boosts | `boost_a_valider` | paiement d'un boost confirmé (`BoostService.confirmerPaiement`) |
| Boosts | `boost_erreur_meta` | échec de publication Meta à l'approbation |
| Boosts | `boost_rejete_meta` | publicité refusée par Meta (synchro) |
| Boosts | `boost_a_rembourser` | refus, reliquat à la clôture, paiement en double |
| Commandes | `commande_payee` | premier paiement confirmé d'une commande |
| Commandes | `paiement_echoue` | facture eBilling non payée à la réconciliation |
| Versements | `versement_effectue`, `versement_echec` | émis par le back-office via `POST /notifications/admin/evenement` |
| Vendeurs | `vendeur_inscrit`, `boutique_creee` | création d'un vendeur, d'une boutique |
| Vendeurs | `produit_a_valider` | produit (événement) passé en `en_attente_validation` |

`notifier()` (`src/services/telegram.service.ts`) ne fait jamais échouer le flux métier : l'envoi est fait sans attente, les erreurs sont journalisées et la dernière erreur est affichée dans le back-office.

## Routes (clé de service uniquement)

`GET|PUT /notifications/admin/telegram`, `POST /notifications/admin/telegram/test`, `POST /notifications/admin/evenement` (cf. Swagger, tag `Notifications`).
