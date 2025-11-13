# Automatisation du Statut "Nouveau" des Produits

## ✅ Solution Implémentée

Le système retire automatiquement le statut "nouveau" (`est_nouveau = false`) des produits après 7 jours de leur création.

## 📋 Fichiers Créés/Modifiés

### Nouveaux Fichiers

1. **`migrations/005_auto_update_produit_nouveau_status.sql`**
   - Fonction SQL `retirer_statut_nouveau_produits()`
   - Fonction SQL `stats_produits_nouveau()`
   - Exécution initiale pour nettoyer les produits existants

2. **`src/services/cron.service.ts`**
   - Service pour gérer les tâches planifiées
   - Exécution automatique tous les jours à 2h du matin
   - Méthodes pour démarrer/arrêter/lister les tâches

3. **`src/controllers/cron.controller.ts`**
   - Contrôleur pour les endpoints API cron
   - Permet l'exécution manuelle et la récupération de stats

4. **`src/routes/cron.routes.ts`**
   - Routes API pour gérer les tâches cron
   - Protection par authentification admin

5. **`INSTALLATION_CRON.md`**
   - Guide d'installation et de configuration détaillé

6. **`AUTOMATISATION_STATUT_NOUVEAU.md`** (ce fichier)
   - Résumé de la solution implémentée

### Fichiers Modifiés

1. **`src/index.ts`**
   - Initialisation du `CronService` au démarrage
   - Arrêt propre des tâches lors de l'arrêt du serveur

2. **`src/routes/index.ts`**
   - Ajout des routes cron à l'API

## 🚀 Installation Rapide

### 1. Installer la dépendance

```bash
npm install node-cron
npm install --save-dev @types/node-cron
```

### 2. Exécuter la migration SQL

Connectez-vous à Supabase et exécutez :

```bash
migrations/005_auto_update_produit_nouveau_status.sql
```

### 3. Redémarrer l'application

```bash
npm run dev  # ou npm start
```

Vous verrez dans les logs :

```
[CronService] Initialisation des tâches planifiées...
[CronService] Tâche planifiée: retirer-statut-nouveau-produits - Tous les jours à 2h00
[CronService] Tâches planifiées initialisées avec succès
```

## 🎯 Fonctionnement

### Automatique

**Quand** : Tous les jours à 2h00 du matin  
**Action** : Appelle la fonction SQL `retirer_statut_nouveau_produits()`  
**Résultat** : Met à jour tous les produits avec `est_nouveau = true` créés il y a plus de 7 jours

### Manuel via API

#### Exécuter la tâche manuellement

```bash
POST /api/v1/cron/retirer-statut-nouveau
Authorization: Bearer {token_admin}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Tâche exécutée avec succès",
  "count": 5,
  "details": "5 produit(s) mis à jour"
}
```

#### Obtenir les statistiques

```bash
GET /api/v1/cron/stats-produits-nouveau
Authorization: Bearer {token_admin}
```

**Réponse :**
```json
{
  "success": true,
  "stats": {
    "total_produits": 150,
    "produits_nouveau": 25,
    "produits_nouveau_recents": 20,
    "produits_nouveau_anciens": 5,
    "pourcentage_nouveau": "16.67%"
  }
}
```

#### Lister les tâches actives

```bash
GET /api/v1/cron/jobs
Authorization: Bearer {token_admin}
```

**Réponse :**
```json
{
  "success": true,
  "jobs": ["retirer-statut-nouveau-produits"],
  "count": 1
}
```

## ⚙️ Configuration

### Modifier la durée (par défaut 7 jours)

Dans `migrations/005_auto_update_produit_nouveau_status.sql`, ligne 17 :

```sql
WHERE 
  est_nouveau = true
  AND date_creation <= NOW() - INTERVAL '7 days'  -- Modifier ici
```

Puis réexécuter la migration dans Supabase.

### Modifier l'heure d'exécution (par défaut 2h00)

Dans `src/services/cron.service.ts`, ligne 30 :

```typescript
// Format: minute heure jour mois jour_semaine
const task = cron.schedule('0 2 * * *', async () => {
  // '0 2 * * *' = tous les jours à 2h00
  // '0 0 * * *' = tous les jours à minuit
  // '0 */6 * * *' = toutes les 6 heures
});
```

Exemples de fréquences :
- `'0 2 * * *'` → Tous les jours à 2h00
- `'0 0 * * 0'` → Tous les dimanches à minuit
- `'*/30 * * * *'` → Toutes les 30 minutes
- `'0 */6 * * *'` → Toutes les 6 heures

## 🔍 Vérification

### Vérifier dans Supabase SQL Editor

```sql
-- Voir les produits "nouveau" de plus de 7 jours
SELECT 
  id,
  nom,
  est_nouveau,
  date_creation,
  EXTRACT(DAY FROM (NOW() - date_creation)) as jours
FROM produits
WHERE 
  est_nouveau = true
  AND date_creation <= NOW() - INTERVAL '7 days';

-- Obtenir les statistiques
SELECT * FROM stats_produits_nouveau();

-- Exécuter manuellement la fonction
SELECT retirer_statut_nouveau_produits();
```

### Logs du serveur

Lors de l'exécution quotidienne, vous verrez :

```
[CronService] Début de la tâche: retirer le statut nouveau des produits
[CronService] Tâche terminée: 5 produit(s) mis à jour
```

## 📊 Base de Données

### Fonction SQL créée

**`retirer_statut_nouveau_produits()`**
- Retourne le nombre de produits mis à jour
- Met à jour `est_nouveau = false` pour les produits de plus de 7 jours
- Met à jour `date_modification`

**`stats_produits_nouveau()`**
- Retourne les statistiques des produits "nouveau"
- `total_produits` : Nombre total de produits
- `produits_nouveau` : Nombre de produits avec `est_nouveau = true`
- `produits_nouveau_recents` : Nouveaux de moins de 7 jours
- `produits_nouveau_anciens` : Nouveaux de plus de 7 jours (à mettre à jour)

## 🛡️ Sécurité

Tous les endpoints cron sont protégés par :
1. ✅ Authentification requise (`auth` middleware)
2. ✅ Rôle admin requis (`isAdmin` middleware)

Seuls les utilisateurs authentifiés avec un rôle admin peuvent :
- Exécuter les tâches manuellement
- Voir les statistiques
- Gérer les tâches (start/stop)

## 🐛 Troubleshooting

### La tâche ne s'exécute pas

**Solution** : Vérifiez que le serveur Node.js est en cours d'exécution. Les tâches cron ne s'exécutent que si l'application est active.

### Erreur "Function not found"

**Solution** : La migration SQL n'a pas été exécutée. Allez dans Supabase SQL Editor et exécutez `migrations/005_auto_update_produit_nouveau_status.sql`.

### Les produits ne sont pas mis à jour

**Solutions** :
1. Vérifiez que les produits ont `est_nouveau = true`
2. Vérifiez que leur `date_creation` est supérieure à 7 jours
3. Testez la fonction SQL directement : `SELECT retirer_statut_nouveau_produits();`
4. Vérifiez les logs du serveur pour les erreurs

### node-cron n'est pas installé

**Solution** :
```bash
npm install node-cron @types/node-cron
```

## 🚀 Alternatives

Si vous ne pouvez pas garder le serveur Node.js actif 24/7 :

### 1. Service Cron Externe

Utilisez un service comme [cron-job.org](https://cron-job.org) pour appeler votre endpoint :

```
URL: https://votre-api.com/api/v1/cron/retirer-statut-nouveau
Méthode: POST
Headers: Authorization: Bearer {token_admin}
Fréquence: Tous les jours à 2h00
```

### 2. GitHub Actions

Créez `.github/workflows/cron-nouveau-produits.yml` :

```yaml
name: Retirer Statut Nouveau
on:
  schedule:
    - cron: '0 2 * * *'  # Tous les jours à 2h00 UTC
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - name: Appeler API
        run: |
          curl -X POST https://votre-api.com/api/v1/cron/retirer-statut-nouveau \
            -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}"
```

### 3. Supabase Edge Function + Webhook

Créez une Edge Function Supabase et utilisez un service externe pour l'appeler.

## 📝 Notes

- ✅ La tâche s'exécute automatiquement tous les jours à 2h00
- ✅ Peut être déclenchée manuellement via l'API
- ✅ Les statistiques sont disponibles à tout moment
- ✅ Fonctionne uniquement quand l'application est active
- ✅ Arrêt propre lors de l'arrêt du serveur
- ✅ Protection admin sur tous les endpoints

## 📚 Documentation Complète

Pour plus de détails, consultez :
- **`INSTALLATION_CRON.md`** : Guide d'installation complet
- **`migrations/005_auto_update_produit_nouveau_status.sql`** : Fonctions SQL
- **`src/services/cron.service.ts`** : Implémentation du service

