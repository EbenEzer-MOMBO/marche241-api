import { Router } from 'express';
import { WhatsAppController } from '../controllers/whatsapp.controller';

const router = Router();

/**
 * @swagger
 * /api/v1/whatsapp/confirmation-commande:
 *   post:
 *     summary: Envoie une confirmation de commande via WhatsApp
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - numeroCommande
 *               - nomClient
 *               - montantTotal
 *               - telephoneClient
 *               - produits
 *             properties:
 *               numeroCommande:
 *                 type: string
 *                 description: Numéro unique de la commande
 *                 example: "CMD-2024-001"
 *               nomClient:
 *                 type: string
 *                 description: Nom complet du client
 *                 example: "Jean Dupont"
 *               montantTotal:
 *                 type: number
 *                 description: Montant total de la commande en FCFA
 *                 example: 15000
 *               dateCommande:
 *                 type: string
 *                 description: Date de la commande (optionnel, date actuelle par défaut)
 *                 example: "20/09/2024"
 *               telephoneClient:
 *                 type: string
 *                 description: Numéro WhatsApp du client
 *                 example: "+24177123456"
 *               adresseLivraison:
 *                 type: string
 *                 description: Adresse de livraison (optionnel)
 *                 example: "123 Rue de la Paix, Libreville"
 *               produits:
 *                 type: array
 *                 description: Liste des produits commandés
 *                 items:
 *                   type: object
 *                   properties:
 *                     nom:
 *                       type: string
 *                       example: "Bananes plantains"
 *                     quantite:
 *                       type: number
 *                       example: 2
 *                     prix:
 *                       type: number
 *                       example: 1500
 *     responses:
 *       200:
 *         description: Confirmation envoyée avec succès
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
router.post('/confirmation-commande', WhatsAppController.envoyerConfirmationCommande);

/**
 * @swagger
 * /api/v1/whatsapp/notification-statut:
 *   post:
 *     summary: Envoie une notification de changement de statut de commande
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telephone
 *               - numeroCommande
 *               - nouveauStatut
 *               - nomClient
 *             properties:
 *               telephone:
 *                 type: string
 *                 description: Numéro WhatsApp du client
 *                 example: "+24177123456"
 *               numeroCommande:
 *                 type: string
 *                 description: Numéro de la commande
 *                 example: "CMD-2024-001"
 *               nouveauStatut:
 *                 type: string
 *                 enum: [en_preparation, prete, en_livraison, livree, annulee]
 *                 description: Nouveau statut de la commande
 *                 example: "en_preparation"
 *               nomClient:
 *                 type: string
 *                 description: Nom du client
 *                 example: "Jean Dupont"
 *     responses:
 *       200:
 *         description: Notification envoyée avec succès
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
router.post('/notification-statut', WhatsAppController.envoyerNotificationStatut);

/**
 * @swagger
 * /api/v1/whatsapp/envoyer-message:
 *   post:
 *     summary: Envoie un message WhatsApp personnalisé
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telephone
 *               - message
 *             properties:
 *               telephone:
 *                 type: string
 *                 description: Numéro WhatsApp du destinataire
 *                 example: "+24177123456"
 *               message:
 *                 type: string
 *                 description: Contenu du message à envoyer
 *                 example: "Bonjour, votre commande est prête !"
 *     responses:
 *       200:
 *         description: Message envoyé avec succès
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
router.post('/envoyer-message', WhatsAppController.envoyerMessage);

/**
 * @swagger
 * /api/v1/whatsapp/valider-numero:
 *   post:
 *     summary: Valide un numéro de téléphone WhatsApp
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telephone
 *             properties:
 *               telephone:
 *                 type: string
 *                 description: Numéro de téléphone à valider
 *                 example: "+24177123456"
 *     responses:
 *       200:
 *         description: Validation effectuée
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     numeroOriginal:
 *                       type: string
 *                     numeroFormate:
 *                       type: string
 *                     estValide:
 *                       type: boolean
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
router.post('/valider-numero', WhatsAppController.validerNumero);

/**
 * @swagger
 * /api/v1/whatsapp/test:
 *   post:
 *     summary: Test la configuration WhatsApp avec un message de démonstration
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telephone
 *             properties:
 *               telephone:
 *                 type: string
 *                 description: Numéro WhatsApp pour le test
 *                 example: "+24177123456"
 *     responses:
 *       200:
 *         description: Test réussi, message envoyé
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur de configuration ou d'envoi
 */
router.post('/test', WhatsAppController.testConfiguration);

/**
 * @swagger
 * /api/v1/whatsapp/webhook:
 *   get:
 *     summary: Endpoint de vérification du webhook WhatsApp
 *     tags: [WhatsApp]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         schema:
 *           type: string
 *         description: Mode de vérification
 *       - in: query
 *         name: hub.verify_token
 *         schema:
 *           type: string
 *         description: Token de vérification
 *       - in: query
 *         name: hub.challenge
 *         schema:
 *           type: string
 *         description: Challenge à retourner
 *     responses:
 *       200:
 *         description: Webhook vérifié avec succès
 *   post:
 *     summary: Reçoit les notifications WhatsApp
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Payload de notification WhatsApp
 *     responses:
 *       200:
 *         description: Notification traitée avec succès
 *       500:
 *         description: Erreur serveur
 */
router.get('/webhook', WhatsAppController.webhook);
router.post('/webhook', WhatsAppController.webhook);

export default router;
