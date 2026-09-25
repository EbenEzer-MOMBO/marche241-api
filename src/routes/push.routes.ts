import { Router } from 'express';
import { PushController } from '../controllers/push.controller';
import { auth } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/push/vapid-public-key:
 *   get:
 *     summary: Retourne la clé publique VAPID pour l'abonnement push
 *     tags: [Push]
 *     responses:
 *       200:
 *         description: Clé publique VAPID
 *       500:
 *         description: Service push non configuré
 */
router.get('/vapid-public-key', PushController.getVapidPublicKey);

/**
 * @swagger
 * /api/v1/push/subscribe:
 *   post:
 *     summary: Enregistre un abonnement push pour le vendeur authentifié
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - keys
 *             properties:
 *               endpoint:
 *                 type: string
 *               keys:
 *                 type: object
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *     responses:
 *       200:
 *         description: Abonnement enregistré
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.post('/subscribe', auth, PushController.subscribe);

/**
 * @swagger
 * /api/v1/push/unsubscribe:
 *   delete:
 *     summary: Supprime un abonnement push
 *     tags: [Push]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *             properties:
 *               endpoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Désabonnement réussi
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 */
router.delete('/unsubscribe', auth, PushController.unsubscribe);

export default router;
