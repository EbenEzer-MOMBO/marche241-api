# Installation et Configuration du Système de Cron Jobs

## Vue d'ensemble

Le système de cron jobs permet d'automatiser certaines tâches, notamment le retrait automatique du statut "nouveau" des produits après 7 jours.

## Installation

### 1. Installer la dépendance node-cron

```bash
npm install node-cron
npm install --save-dev @types/node-cron
```

### 2. Exécuter la migration SQL

Exécutez le fichier `migrations/005_auto_update_produit_nouveau_status.sql` dans votre base de données Supabase :

1. Connectez-vous à votre projet Supabase
2. Allez dans `SQL Editor`
3. Copiez et collez le contenu de la migration
4. Exécutez la requête

Cette migration crée :
- ✅ Une fonction `retirer_statut_nouveau_produits()` pour retirer le statut "nouveau"
- ✅ Une fonction `stats_produits_nouveau()` pour obtenir des statistiques
- ✅ Exécute une première mise à jour des produits existants

### 3. Le service CronService est déjà intégré

Le service `CronService` est automatiquement initialisé au démarrage de l'application dans `src/app.ts`.

## Fonctionnement

### Tâche Automatique

**Tâche** : Retirer le statut "nouveau" des produits  
**Planification** : Tous les jours à 2h00 du matin  
**Action** : Met à jour `est_nouveau = false` pour tous les produits créés il y a plus de 7 jours

### Exécution Manuelle

Vous pouvez aussi déclencher la tâche manuellement via l'API :

```bash
POST /api/v1/cron/retirer-statut-nouveau
```

Ou en utilisant le service directement dans le code :

```typescript
import { CronService } from './services/cron.service';

// Exécuter manuellement
const result = await CronService.executeRetirerStatutNouveauManually();
console.log(`${result.count} produits mis à jour`);
```

## Endpoints API

### Exécuter manuellement la tâche de retrait du statut "nouveau"

```http
POST /api/v1/cron/retirer-statut-nouveau
Authorization: Bearer {token_admin}

Response:
{
  "success": true,
  "message": "Tâche exécutée avec succès",
  "count": 5
}
```

### Obtenir les statistiques des produits "nouveau"

```http
GET /api/v1/cron/stats-produits-nouveau
Authorization: Bearer {token_admin}

Response:
{
  "success": true,
  "stats": {
    "total_produits": 150,
    "produits_nouveau": 25,
    "produits_nouveau_recents": 20,
    "produits_nouveau_anciens": 5
  }
}
```

## Configuration

### Modifier la fréquence d'exécution

Dans `src/services/cron.service.ts`, ligne ~30 :

```typescript
// Format cron: minute heure jour mois jour_semaine
const task = cron.schedule('0 2 * * *', async () => {
  // '0 2 * * *' = tous les jours à 2h00
  // '0 */6 * * *' = toutes les 6 heures
  // '0 0 * * 0' = tous les dimanches à minuit
  // '*/30 * * * *' = toutes les 30 minutes
});
```

### Modifier la durée avant retrait du statut

Dans `migrations/005_auto_update_produit_nouveau_status.sql`, ligne ~17 :

```sql
WHERE 
  est_nouveau = true
  AND date_creation <= NOW() - INTERVAL '7 days'  -- Modifier ici
```

Exemples d'intervalles :
- `'3 days'` = 3 jours
- `'14 days'` = 2 semaines
- `'1 month'` = 1 mois

## Gestion des Tâches

### Arrêter toutes les tâches

```typescript
CronService.stopAll();
```

### Arrêter une tâche spécifique

```typescript
CronService.stopJob('retirer-statut-nouveau-produits');
```

### Lister les tâches actives

```typescript
const jobs = CronService.listJobs();
console.log('Tâches actives:', jobs);
```

## Logs

Les tâches cron génèrent des logs dans la console :

```
[CronService] Initialisation des tâches planifiées...
[CronService] Tâche planifiée: retirer-statut-nouveau-produits - Tous les jours à 2h00
[CronService] Tâches planifiées initialisées avec succès

# Lors de l'exécution quotidienne :
[CronService] Début de la tâche: retirer le statut nouveau des produits
[CronService] Tâche terminée: 5 produit(s) mis à jour
```

## Tests

### Test de la fonction SQL directement

Dans Supabase SQL Editor :

```sql
-- Exécuter la fonction
SELECT retirer_statut_nouveau_produits();

-- Voir les statistiques
SELECT * FROM stats_produits_nouveau();

-- Voir les produits qui seraient modifiés
SELECT 
  id,
  nom,
  est_nouveau,
  date_creation,
  EXTRACT(DAY FROM (NOW() - date_creation)) as jours_depuis_creation
FROM produits
WHERE 
  est_nouveau = true
  AND date_creation <= NOW() - INTERVAL '7 days';
```

### Test via l'API

```bash
# Obtenir les stats avant
curl -X GET http://localhost:3000/api/v1/cron/stats-produits-nouveau

# Exécuter la tâche
curl -X POST http://localhost:3000/api/v1/cron/retirer-statut-nouveau

# Vérifier les stats après
curl -X GET http://localhost:3000/api/v1/cron/stats-produits-nouveau
```

## Alternatives pour Supabase

Si vous utilisez Supabase et que `pg_cron` n'est pas disponible, vous avez plusieurs alternatives :

### 1. **Service Node.js (Recommandé)**
Utilisez le `CronService` fourni (déjà configuré).

### 2. **Supabase Edge Functions**
Créez une Edge Function appelée par un service externe comme GitHub Actions ou Vercel Cron.

### 3. **Service externe**
Utilisez un service comme :
- [cron-job.org](https://cron-job.org)
- GitHub Actions avec schedule
- Vercel Cron Jobs
- AWS EventBridge

Qui appelle votre endpoint `/api/v1/cron/retirer-statut-nouveau` régulièrement.

## Troubleshooting

### La tâche ne s'exécute pas

1. Vérifiez que le serveur Node.js est en cours d'exécution
2. Vérifiez les logs pour voir si l'initialisation a réussi
3. Testez l'exécution manuelle via l'API

### Erreur "Function not found"

La migration SQL n'a pas été exécutée correctement. Réexécutez `migrations/005_auto_update_produit_nouveau_status.sql`.

### Les produits ne sont pas mis à jour

1. Vérifiez que les produits ont bien `est_nouveau = true`
2. Vérifiez que `date_creation <= NOW() - INTERVAL '7 days'`
3. Testez la fonction SQL directement dans Supabase

## Sécurité

Les endpoints de cron sont protégés et nécessitent une authentification admin. Assurez-vous que seuls les utilisateurs autorisés peuvent y accéder.

