# Templates WhatsApp — Guide de référence

## Architecture

| Canal | Usage |
|-------|--------|
| **Meta Cloud API** | Templates transactionnels : confirmation, expédition, livraison, annulation, paiement échoué, notif vendeur |
| **GREEN-API** | Fallback texte + `en_preparation` / `remboursee` + check-number + messages libres |

Variables d'environnement Meta (mêmes credentials que l'admin campagnes) :

```
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
META_WHATSAPP_GRAPH_VERSION=v21.0   # optionnel
```

Variables GREEN-API (fallback / utilitaires) :

```
GREEN_API_ID_INSTANCE=...
GREEN_API_TOKEN=...
GREEN_API_URL=https://api.green-api.com
```

Réconciliation paiements :

```
PAYMENT_RECONCILE_AFTER_MINUTES=60
CRON_SECRET_KEY=...
```

---

## Mapping événements → templates Meta

| Événement | Template | Langue |
|-----------|----------|--------|
| Client `confirmee` (paiement live ou réconciliation cron) | `confirmation_de_commande` | `fr` |
| Client `expedie` | `commande_expediee` | `fr` |
| Client `livree` | `commande_livree_notification` | `fr` |
| Client `annulee` (cron orphelines / PATCH) | `commande_annulee_notification` | `fr` |
| Paiement échoué / encore `ready` après 1h | `tentative_de_paiement_echouee` | `fr` |
| Vendeur nouvelle commande (au paiement → `confirmee`) | `confirmation_de_commande_vendeur` | `fr` |

---

## `confirmation_de_commande` (client)

**Header :** `Confirmation de la commande {{1}}` → n° commande  
**Body :**

| Var | Contenu |
|-----|---------|
| `{{1}}` | N° commande |
| `{{2}}` | Détails articles (une ligne, séparés par `•`) |
| `{{3}}` | Total (XAF) |
| `{{4}}` | Montant payé (XAF) |
| `{{5}}` | Adresse de livraison |
| `{{6}}` | Contact boutique |

---

## `commande_expediee` (client)

**Header :** `Votre commande {{1}} a été expédiée!` → n° commande  
**Body :**

| Var | Contenu |
|-----|---------|
| `{{1}}` | Nom client |
| `{{2}}` | N° commande |
| `{{3}}` | Adresse de livraison |

---

## `commande_livree_notification` (client)

**Body :**

| Var | Contenu |
|-----|---------|
| `{{1}}` | Nom client |
| `{{2}}` | N° commande |
| `{{3}}` | Nom boutique |

---

## `confirmation_de_commande_vendeur` (vendeur)

**Header :** `Nouvelle commande {{1}}` → n° commande  
**Body :**

| Var | Contenu |
|-----|---------|
| `{{1}}` | Nom client |
| `{{2}}` | Détails articles |
| `{{3}}` | Total (XAF) |
| `{{4}}` | Montant payé (XAF) |
| `{{5}}` | Adresse de livraison |

---

## `commande_annulee_notification` (client)

**Header :** `Oh non, {{1}}...` → nom client  
**Body :** aucun paramètre  
**Bouton URL dynamique :** `https://marche241.ga/{{1}}` → **slug boutique**

---

## `tentative_de_paiement_echouee` (client)

Aucun paramètre (header/body fixes ; bouton phone support dans le template Meta).

---

## Déclencheurs code

1. **Paiement réussi (live)** — poll `verifierPaiement` → `paid`/`processed`  
   - Templates confirmation client + vendeur
2. **Réconciliation cron 1h** — `GET /cron/expirer-transactions?key=…`  
   - Relit Ebilling pour TX `en_attente` ≥ `PAYMENT_RECONCILE_AFTER_MINUTES`  
   - `paid`/`processed` → confirmation WA  
   - `ready`/`expired` → TX `echec` + `tentative_de_paiement_echouee` (sans template annulation)
3. **Cron orphelines** — `GET /cron/annuler-commandes-orphelines?key=…`  
   - Commandes `en_attente` sans TX → `annulee` + `commande_annulee_notification`
4. **PATCH `/commandes/:id/status`** — Meta pour `confirmee` / `expedie` / `livree` / `annulee`  
   - GREEN-API pour `en_preparation` / `remboursee`

Pas de webhook Make.com : le suivi repose sur le poll front + la réconciliation cron externe.

---

## Crons externes (Render free)

Planifier hors Render (cPanel, cron-job.org, etc.), toutes les **5–15 min** :

```bash
# Toutes les tâches (inclut réconciliation + orphelines)
curl "https://VOTRE_API/cron/tasks?key=$CRON_SECRET_KEY"

# Réconciliation paiements seule
curl "https://VOTRE_API/cron/expirer-transactions?key=$CRON_SECRET_KEY"

# Annulation orphelines seule
curl "https://VOTRE_API/api/v1/cron/annuler-commandes-orphelines?key=$CRON_SECRET_KEY"
```

Le seuil métier reste **60 minutes** (`PAYMENT_RECONCILE_AFTER_MINUTES`) : un paiement réussi resté `ready` côté UI à cause du réseau sera confirmé au prochain cron après 1h ; un paiement non abouti passera en échec + notif.

---

## Règles Meta sur les paramètres

- Pas de retours à la ligne, tabulations, ni plus de 4 espaces consécutifs dans les variables
- Les paramètres texte ne doivent pas être vides (fallback `-`)
- Numéro destinataire : digits internationaux (`241XXXXXXXX`), sans `+` ni `@c.us`

---

## Test de configuration

```bash
GET /api/v1/whatsapp/status
```

Réponse attendue : `data.meta.configured` et/ou `data.greenApi.configured`.
