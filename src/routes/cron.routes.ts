import { Router } from 'express';
import { CronController } from '../controllers/cron.controller';
import { auth, isAdmin } from '../middlewares/auth.middleware';
import { requireCronSecret } from '../middlewares/cron-auth.middleware';

const router = Router();

router.post('/retirer-statut-nouveau', auth, isAdmin, CronController.executeRetirerStatutNouveau);
router.get('/stats-produits-nouveau', auth, isAdmin, CronController.getStatsProduitNouveau);
router.get('/jobs', auth, isAdmin, CronController.listCronJobs);
router.post('/jobs/:jobName/stop', auth, isAdmin, CronController.stopCronJob);
router.post('/jobs/:jobName/start', auth, isAdmin, CronController.startCronJob);

/**
 * Triggers publics (cPanel / cron externe) — CRON_SECRET_KEY obligatoire
 */
router.get('/tasks', requireCronSecret, CronController.executeAllTasks);
router.get('/health', CronController.healthCheck);
router.get('/expirer-transactions/execute', requireCronSecret, CronController.executeExpirerTransactions);
router.get('/nettoyer-vues', requireCronSecret, CronController.executeNettoyerVues);
router.get('/nettoyer-vues-mois', requireCronSecret, CronController.executeNettoyerVuesMoisEnCours);
router.get('/annuler-commandes-orphelines', requireCronSecret, CronController.executeAnnulerCommandesOrphelines);
router.get('/boosts/sync-revue', requireCronSecret, CronController.executeSyncRevueBoosts);
router.get('/boosts/sync-stats', requireCronSecret, CronController.executeSyncStatsBoosts);
router.get('/boosts/expirer', requireCronSecret, CronController.executeExpirerBoosts);

export default router;
