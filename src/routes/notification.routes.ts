import { NextFunction, Request, Response, Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import { notificationEvenementSchema, notificationsTelegramSchema } from '../utils/validation.schemas.notification';

const router = Router();

/** Back-office uniquement : clé de service, sans JWT vendeur. */
const exigerCleService = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.isAdmin || req.vendeur) {
    res.status(403).json({ success: false, message: 'Accès réservé au back-office Marché 241' });
    return;
  }
  next();
};
const admin = [authOrServiceKey, exigerCleService];

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: Notifications Telegram de l'équipe Marché 241 (jeton du bot dans TELEGRAM_BOT_TOKEN)
 * /notifications/admin/telegram:
 *   get:
 *     summary: Réglages Telegram, catalogue des événements et vérification du bot et du canal (aucun secret)
 *     tags: [Notifications]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, telegram: { config, verification, groupes, evenements } }" }
 *   put:
 *     summary: Enregistrer le canal, l'activation et les événements (accès au canal vérifié si le jeton est présent)
 *     tags: [Notifications]
 *     security: [{ serviceKey: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actif, evenements]
 *             properties:
 *               chat_id: { type: string, example: "@marche241_equipe" }
 *               actif: { type: boolean }
 *               evenements: { type: array, items: { type: string }, example: [boost_a_valider, commande_payee] }
 *               modifie_par: { type: string }
 *     responses:
 *       200: { description: "{ success, telegram }" }
 *       400: { description: VALIDATION_ERROR (canal invalide ou inaccessible) }
 * /notifications/admin/telegram/test:
 *   post:
 *     summary: Envoyer un message de test sur le canal enregistré
 *     tags: [Notifications]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: Message envoyé }
 *       409: { description: Jeton ou canal manquant }
 *       502: { description: Erreur Telegram (message lisible) }
 * /notifications/admin/evenement:
 *   post:
 *     summary: Notifier un événement émis par le back-office (versements), selon les réglages
 *     tags: [Notifications]
 *     security: [{ serviceKey: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [evenement, titre]
 *             properties:
 *               evenement: { type: string, example: versement_effectue }
 *               titre: { type: string }
 *               lignes: { type: array, items: { type: string } }
 *               lien: { type: string, example: "/paiements" }
 *     responses:
 *       200: { description: "{ success, envoye }" }
 */
router.get('/admin/telegram', ...admin, NotificationController.lire);
router.put('/admin/telegram', ...admin, validate(notificationsTelegramSchema), NotificationController.modifier);
router.post('/admin/telegram/test', ...admin, NotificationController.tester);
router.post('/admin/evenement', ...admin, validate(notificationEvenementSchema), NotificationController.evenement);

export default router;
