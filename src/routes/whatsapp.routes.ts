import { Router } from 'express';
import { WhatsAppController } from '../controllers/whatsapp.controller';

const router = Router();

/**
 * @swagger
 * /api/v1/whatsapp/status:
 *   get:
 *     summary: Vérifie le statut de la configuration WhatsApp GREEN-API
 *     tags: [WhatsApp]
 *     responses:
 *       200:
 *         description: Statut de la configuration
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
 *                     configured:
 *                       type: boolean
 *                     provider:
 *                       type: string
 *                       example: "GREEN-API"
 */
router.get('/status', WhatsAppController.getStatus);

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
 *                 enum: [confirmee, en_preparation, expedie, livree, annulee, remboursee]
 *                 description: Nouveau statut de la commande
 *                 example: "confirmee"
 *               nomClient:
 *                 type: string
 *                 description: Nom du client
 *                 example: "Jean Dupont"
 *               boutiqueName:
 *                 type: string
 *                 description: Nom de la boutique
 *                 example: "Ma Boutique"
 *               total:
 *                 type: number
 *                 description: Montant total de la commande
 *                 example: 15000
 *               fraisLivraison:
 *                 type: number
 *                 description: Frais de livraison
 *                 example: 2000
 *               clientAdresse:
 *                 type: string
 *                 description: Adresse du client
 *               clientVille:
 *                 type: string
 *                 description: Ville du client
 *               clientCommune:
 *                 type: string
 *                 description: Commune du client
 *               motifAnnulation:
 *                 type: string
 *                 description: Motif d'annulation (si statut = annulee)
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
 * /api/v1/whatsapp/notifier-vendeur:
 *   post:
 *     summary: Notifie un vendeur d'une nouvelle commande
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - telephoneVendeur
 *               - numeroCommande
 *               - nomClient
 *               - total
 *               - nombreArticles
 *             properties:
 *               telephoneVendeur:
 *                 type: string
 *                 description: Numéro WhatsApp du vendeur
 *                 example: "+24177123456"
 *               numeroCommande:
 *                 type: string
 *                 description: Numéro de la commande
 *                 example: "CMD-2024-001"
 *               nomClient:
 *                 type: string
 *                 description: Nom du client
 *                 example: "Jean Dupont"
 *               total:
 *                 type: number
 *                 description: Montant total de la commande
 *                 example: 15000
 *               nombreArticles:
 *                 type: number
 *                 description: Nombre d'articles dans la commande
 *                 example: 3
 *     responses:
 *       200:
 *         description: Notification envoyée avec succès
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 */
router.post('/notifier-vendeur', WhatsAppController.notifierVendeurNouvelleCommande);

/**
 * @swagger
 * /api/v1/whatsapp/test:
 *   post:
 *     summary: Test la configuration WhatsApp GREEN-API avec un message de démonstration
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

export default router;
