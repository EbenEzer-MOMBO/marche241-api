import { Router } from 'express';
import { CommandeController } from '../controllers/commande.controller';
import { auth, isBoutiqueOwner, isCommandeOwner } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { idParamSchema, paginationQuerySchema } from '../utils/validation.schemas';
import { 
  boutiqueIdParamSchema, 
  createCommandeSchema, 
  initierPaiementSchema, 
  numeroParamSchema, 
  updateCommandeStatusSchema, 
  updatePaymentStatusSchema 
} from '../utils/validation.schemas.commande';
import { orderLimiter } from '../middlewares/rate-limit.middleware';
import { validateTurnstile } from '../middlewares/captcha.middleware';

const router = Router();

/**
 * @swagger
 * /api/v1/commandes:
 *   post:
 *     summary: Crée une nouvelle commande
 *     description: Crée une nouvelle commande avec les articles spécifiés
 *     tags: [Commandes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCommande'
 *     responses:
 *       201:
 *         description: Commande créée avec succès
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/commandes
 * @desc    Crée une nouvelle commande
 * @access  Public
 */
router.post('/', orderLimiter, validateTurnstile, validate(createCommandeSchema), CommandeController.createCommande);

/**
 * @route   GET /api/v1/commandes/numero/:numero
 * @desc    Récupère une commande par son numéro
 * @access  Private (propriétaire)
 */
router.get('/numero/:numero', auth, validateParams(numeroParamSchema), isCommandeOwner, CommandeController.getCommandeByNumero);

/**
 * @route   GET /api/v1/commandes/boutique/:boutiqueId
 * @desc    Récupère les commandes d'une boutique
 * @access  Private (propriétaire de la boutique)
 */
router.get('/boutique/:boutiqueId', auth, validateParams(boutiqueIdParamSchema), validateQuery(paginationQuerySchema), isBoutiqueOwner, CommandeController.getCommandesByBoutique);

/**
 * @route   GET /api/v1/commandes/:id
 * @desc    Récupère une commande par son ID
 * @access  Private (propriétaire)
 */
router.get('/:id', auth, validateParams(idParamSchema), isCommandeOwner, CommandeController.getCommandeById);

/**
 * @swagger
 * /api/v1/commandes/{id}/status:
 *   patch:
 *     summary: Met à jour le statut d'une commande
 *     description: Met à jour le statut d'une commande existante
 *     tags: [Commandes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commande
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCommandeStatus'
 *     responses:
 *       200:
 *         description: Statut de la commande mis à jour avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Commande non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PATCH /api/v1/commandes/:id/status
 * @desc    Met à jour le statut d'une commande
 * @access  Private (propriétaire de la boutique)
 */
router.patch('/:id/status', auth, validateParams(idParamSchema), validate(updateCommandeStatusSchema), isCommandeOwner, CommandeController.updateCommandeStatus);

/**
 * @swagger
 * /api/v1/commandes/{id}/payment-status:
 *   patch:
 *     summary: Met à jour le statut de paiement d'une commande
 *     description: Met à jour le statut de paiement d'une commande existante
 *     tags: [Commandes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commande
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePaymentStatus'
 *     responses:
 *       200:
 *         description: Statut de paiement mis à jour avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Commande non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PATCH /api/v1/commandes/:id/payment-status
 * @desc    Met à jour le statut de paiement d'une commande
 * @access  Private (propriétaire de la boutique)
 */
router.patch('/:id/payment-status', auth, validateParams(idParamSchema), validate(updatePaymentStatusSchema), isCommandeOwner, CommandeController.updatePaymentStatus);

/**
 * @swagger
 * /api/v1/commandes/{id}/paiement:
 *   post:
 *     summary: Initialise le paiement d'une commande
 *     description: Initialise le paiement d'une commande existante
 *     tags: [Commandes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commande
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InitierPaiement'
 *     responses:
 *       200:
 *         description: Paiement initialisé avec succès
 *       400:
 *         description: Données invalides
 *       404:
 *         description: Commande non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/commandes/:id/paiement
 * @desc    Initialise le paiement d'une commande
 * @access  Public
 */
router.post('/:id/paiement', validateParams(idParamSchema), validate(initierPaiementSchema), CommandeController.initierPaiement);

/**
 * @swagger
 * /api/v1/commandes/{id}/articles:
 *   get:
 *     summary: Récupère les détails des produits d'une commande
 *     description: Récupère la liste détaillée des produits/articles d'une commande avec leurs informations complètes
 *     tags: [Commandes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commande
 *     responses:
 *       200:
 *         description: Détails des produits récupérés avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 commande:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     numero_commande:
 *                       type: string
 *                     statut:
 *                       type: string
 *                     statut_paiement:
 *                       type: string
 *                     sous_total:
 *                       type: number
 *                     frais_livraison:
 *                       type: number
 *                     taxes:
 *                       type: number
 *                     remise:
 *                       type: number
 *                     total:
 *                       type: number
 *                     date_commande:
 *                       type: string
 *                       format: date-time
 *                 articles:
 *                   type: array
 *                   items:
 *                     type: object
 *                 nombre_articles:
 *                   type: integer
 *       400:
 *         description: ID de commande invalide
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Commande non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/commandes/:id/articles
 * @desc    Récupère les détails des produits d'une commande
 * @access  Private
 */
router.get('/:id/articles', auth, validateParams(idParamSchema), isCommandeOwner, CommandeController.getCommandeArticlesDetails);

export default router;
