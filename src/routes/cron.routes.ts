import { Router } from 'express';
import { CronController } from '../controllers/cron.controller';
import { auth, isAdmin } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/cron/retirer-statut-nouveau:
 *   post:
 *     summary: Exécute manuellement la tâche de retrait du statut "nouveau"
 *     description: Retire le statut "nouveau" des produits créés il y a plus de 7 jours
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tâche exécutée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 details:
 *                   type: string
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (admin requis)
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/cron/retirer-statut-nouveau
 * @desc    Exécute la tâche de retrait du statut "nouveau" manuellement
 * @access  Private (Admin)
 */
router.post('/retirer-statut-nouveau', auth, isAdmin, CronController.executeRetirerStatutNouveau);

/**
 * @swagger
 * /api/v1/cron/stats-produits-nouveau:
 *   get:
 *     summary: Obtient les statistiques des produits avec le statut "nouveau"
 *     description: Récupère le nombre de produits "nouveau", récents et anciens
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistiques récupérées avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total_produits:
 *                       type: integer
 *                     produits_nouveau:
 *                       type: integer
 *                     produits_nouveau_recents:
 *                       type: integer
 *                     produits_nouveau_anciens:
 *                       type: integer
 *                     pourcentage_nouveau:
 *                       type: string
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (admin requis)
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/cron/stats-produits-nouveau
 * @desc    Récupère les statistiques des produits "nouveau"
 * @access  Private (Admin)
 */
router.get('/stats-produits-nouveau', auth, isAdmin, CronController.getStatsProduitNouveau);

/**
 * @swagger
 * /api/v1/cron/jobs:
 *   get:
 *     summary: Liste toutes les tâches cron actives
 *     description: Récupère la liste des tâches planifiées en cours d'exécution
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des tâches récupérée avec succès
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (admin requis)
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/cron/jobs
 * @desc    Liste toutes les tâches cron actives
 * @access  Private (Admin)
 */
router.get('/jobs', auth, isAdmin, CronController.listCronJobs);

/**
 * @swagger
 * /api/v1/cron/jobs/{jobName}/stop:
 *   post:
 *     summary: Arrête une tâche cron spécifique
 *     description: Arrête l'exécution d'une tâche planifiée
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobName
 *         required: true
 *         schema:
 *           type: string
 *         description: Nom de la tâche à arrêter
 *     responses:
 *       200:
 *         description: Tâche arrêtée avec succès
 *       400:
 *         description: Nom de tâche invalide
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (admin requis)
 *       404:
 *         description: Tâche introuvable
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/cron/jobs/:jobName/stop
 * @desc    Arrête une tâche cron spécifique
 * @access  Private (Admin)
 */
router.post('/jobs/:jobName/stop', auth, isAdmin, CronController.stopCronJob);

/**
 * @swagger
 * /api/v1/cron/jobs/{jobName}/start:
 *   post:
 *     summary: Démarre une tâche cron spécifique
 *     description: Démarre l'exécution d'une tâche planifiée
 *     tags: [Cron]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobName
 *         required: true
 *         schema:
 *           type: string
 *         description: Nom de la tâche à démarrer
 *     responses:
 *       200:
 *         description: Tâche démarrée avec succès
 *       400:
 *         description: Nom de tâche invalide
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (admin requis)
 *       404:
 *         description: Tâche introuvable
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/cron/jobs/:jobName/start
 * @desc    Démarre une tâche cron spécifique
 * @access  Private (Admin)
 */
router.post('/jobs/:jobName/start', auth, isAdmin, CronController.startCronJob);

export default router;

