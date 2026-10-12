# Relances des boosts non finalisés

Relance WhatsApp (template Meta) et e-mail pour les boosts Meta restés en `brouillon` ou `en_attente_paiement`. Les mises en avant plateforme ne sont pas concernées.

## Règles

- Un vendeur désinscrit (`vendeurs.relances_boost_desinscrit_le`) n'est plus relancé.
- Seuls les boosts créés depuis moins de `relance_age_max_jours` sont éligibles.
- Le compteur repart de `boosts.date_modification` : la relance n°(n+1) part quand `n < relance_max` et que `relance_delai_initial_heures + n × relance_intervalle_heures` se sont écoulées.
- Un seul message par boutique, qui résume tous les boosts encore ouverts. L'événement `relance` n'est écrit que sur les boosts dus.
- Pas plus d'un message automatique par boutique par `relance_intervalle_heures`.
- Le cron `40 * * * *` n'envoie qu'à l'heure `relance_heure_envoi` (fuseau `Africa/Libreville`).
- Le bouton admin envoie tout de suite, sans délai, heure ni maximum. Il refuse si le vendeur est désinscrit (`409 VENDEUR_DESINSCRIT`) ou si les deux canaux sont coupés (`409 CANAUX_COUPES`).
- Un paiement fait passer le boost en `en_attente_validation` : il sort de la relance.

Résumé construit dans le code : `2 boost(s) en brouillon et 1 boost(s) en attente de paiement`.

## Paramètres (`boost_parametres`)

| Clé | Défaut |
|---|---|
| `relance_active` | `true` |
| `relance_whatsapp_active` | `true` |
| `relance_email_active` | `true` |
| `relance_delai_initial_heures` | 24 |
| `relance_intervalle_heures` | 48 |
| `relance_max` | 2 |
| `relance_heure_envoi` | 10 |
| `relance_age_max_jours` | 30 |
| `relance_email_objet` | `{boutique} : vos boosts vous attendent 🚀` |
| `relance_email_message` | texte avec `{vendeur}`, `{boutique}`, `{resume}` |

## Routes

- `POST /api/v1/boosts/admin/:id/relancer` — clé de service. Réponse `{ success, resultat }`.
- `GET /api/v1/boosts/relances/desinscription?jeton=` — public, sans effet. `{ success, desinscrit, boutique? }`.
- `POST /api/v1/boosts/relances/desinscription` — `{ jeton, desinscrit }`. Sans corps, `?jeton=` désinscrit (one-click e-mail).
- `GET` / `PUT /api/v1/boosts/relances/preferences` — vendeur. `{ success, preferences: { relances_boost } }`.
- `GET /api/v1/cron/boosts/relances?key=` — secret cron.

Le jeton est `base64url(vendeurId).hmac-sha256`, secret `RELANCE_DESINSCRIPTION_SECRET` ou `JWT_SECRET`, sans expiration.

## Template WhatsApp à soumettre

- Nom : `relance_boosts_vendeur`
- Catégorie : Marketing
- Langue : Français
- En-tête : `Vos boosts vous attendent 🚀`
- Corps :

```
Bonjour {{1}} 👋

Votre boutique *{{2}}* a {{3}}.

Vous y étiez presque ! Finalisez-les en quelques clics pour mettre vos produits sous les yeux de milliers d'acheteurs au Gabon 🇬🇦

Une question ? Répondez simplement à ce message, l'équipe Marché 241 est là pour vous aider.
```

Exemples : `{{1}}` = Aïcha, `{{2}}` = Mode Akanda, `{{3}}` = 2 boost(s) en brouillon et 1 boost(s) en attente de paiement.

- Pied : `Marché 241 · Boostez vos ventes`
- Bouton URL « Finaliser mes boosts » : `https://marche241.ga/admin/{{1}}/boost` (exemple `mode-akanda`)
- Bouton URL « Ne plus recevoir » : `https://marche241.ga/desinscription/relances-boost?jeton={{1}}`

Pas de repli Green API : seul le template Meta est envoyé.
