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

/**
 * @swagger
 * /api/v1/cron/tasks:
 *   get:
 *     summary: Exécute toutes les tâches cron planifiées
 *     description: |
 *       Route publique pour exécuter toutes les tâches cron.
 *       À appeler depuis un cron job externe (cPanel, etc.)
 *       
 *       Tâches exécutées:
 *       - Retirer le statut "nouveau" des produits > 7 jours
 *       - Nettoyer les anciennes vues (> 90 jours)
 *     tags: [Cron]
 *     parameters:
 *       - in: query
 *         name: key
 *         schema:
 *           type: string
 *         description: Clé secrète optionnelle (définie dans CRON_SECRET_KEY)
 *     responses:
 *       200:
 *         description: Toutes les tâches exécutées avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Toutes les tâches ont été exécutées avec succès"
 *                 executed_at:
 *                   type: string
 *                   format: date-time
 *                 total_duration_ms:
 *                   type: integer
 *                   example: 1250
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       task:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       result:
 *                         type: object
 *                       duration:
 *                         type: integer
 *       207:
 *         description: Certaines tâches ont échoué
 *       401:
 *         description: Clé d'authentification invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/cron/tasks
 * @desc    Exécute toutes les tâches cron planifiées
 * @access  Public (avec clé optionnelle)
 */
router.get('/tasks', CronController.executeAllTasks);

/**
 * @swagger
 * /api/v1/cron/health:
 *   get:
 *     summary: Vérifie l'état de santé du serveur
 *     description: Route simple pour vérifier que le serveur est en ligne
 *     tags: [Cron]
 *     responses:
 *       200:
 *         description: Serveur en ligne
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Temps de fonctionnement en secondes
 *                 message:
 *                   type: string
 *                   example: "Serveur en ligne"
 * 
 * @route   GET /api/v1/cron/health
 * @desc    Vérifie l'état de santé du serveur
 * @access  Public
 */
router.get('/health', CronController.healthCheck);

/**
 * @swagger
 * /api/v1/cron/expirer-transactions/execute:
 *   get:
 *     summary: Exécute manuellement la tâche d'expiration des transactions
 *     description: Expire les transactions en attente depuis plus d'1 heure et annule les commandes associées
 *     tags: [Cron]
 *     responses:
 *       200:
 *         description: Tâche exécutée avec succès
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/cron/expirer-transactions/execute
 * @desc    Expire les transactions en attente manuellement
 * @access  Public
 */
router.get('/expirer-transactions/execute', CronController.executeExpirerTransactions);

export default router;

