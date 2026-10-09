# Tâches planifiées pilotées par cron-job.org

L'API lance elle-même 7 tâches (`CronService.init()`, node-cron). Pour les piloter depuis
cron-job.org, **couper d'abord les tâches internes** (`CRON_INTERNE_ACTIVE=false`, puis
redémarrer l'API), sinon chaque tâche s'exécute deux fois.

## Appel

- Méthode : `GET`, URL de base de l'API (`https://<api>`).
- Authentification : en-tête **`x-cron-key: <CRON_SECRET_KEY>`**. Éviter `?key=` : la clé finirait
  dans les journaux des serveurs.
- Réponse : `200` + `{ success: true, ... }`. Les tâches sont idempotentes : un doublon est sans danger.
- Délai de cron-job.org : 30 s. Si la tâche dure plus longtemps, le job est marqué en échec côté
  cron-job.org mais l'API va au bout de son traitement.

## Jobs de l'API

Fuseau des jobs : `Africa/Libreville` (UTC+1). Les horaires ci-dessous sont ceux de Libreville.

| Job | Fréquence | Route |
|---|---|---|
| Réconciliation des paiements en attente | toutes les 15 min | `/api/v1/cron/expirer-transactions/execute` |
| Annulation des commandes orphelines | toutes les 30 min | `/api/v1/cron/annuler-commandes-orphelines` |
| Statuts des publicités | toutes les heures, minute 5 | `/api/v1/cron/publicites/statuts` |
| Synchronisation des boosts Meta | toutes les heures, minute 20 | `/api/v1/cron/boosts/sync` |
| Retrait du badge « nouveau » | chaque jour à 03:00 | `/api/v1/cron/retirer-statut-nouveau` |
| Agrégation des statistiques d'audience | chaque jour à 00:15 | `/api/v1/cron/agreger-statistiques` |
| Nettoyage des vues (> 90 jours) | chaque jour à 00:45 | `/api/v1/cron/nettoyer-vues` |
| Santé (optionnel, remplace l'auto-ping) | toutes les 10 min | `/health` (sans clé) |

L'agrégation (00:15) doit passer **avant** le nettoyage (00:45).

Si cron-job.org garde le serveur éveillé via `/health`, mettre `MONITOR_AUTOPING_ACTIVE=false`.

`/api/v1/cron/tasks` regroupe 5 tâches en un appel (retrait « nouveau », agrégation, nettoyage,
commandes orphelines, réconciliation). Ne pas l'utiliser en plus des jobs ci-dessus.
`/api/v1/cron/nettoyer-vues-mois` fait la même chose que `nettoyer-vues` : ne pas le planifier.

## Vérifier

```bash
curl -s -H "x-cron-key: $CRON_SECRET_KEY" https://<api>/api/v1/cron/retirer-statut-nouveau
```

Au démarrage, l'API journalise `CRON_INTERNE_ACTIVE=false : tâches internes désactivées`
quand l'interrupteur est coupé.
