import { Router } from 'express';
import { CommandeController } from '../controllers/commande.controller';
import { auth, isBoutiqueOwner } from '../middlewares/auth.middleware';
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
router.post('/', validate(createCommandeSchema), CommandeController.createCommande);

/**
 * @swagger
 * /api/v1/commandes/{id}:
 *   get:
 *     summary: Récupère une commande par son ID
 *     description: Récupère les détails d'une commande spécifique
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
 *         description: Commande récupérée avec succès
 *       400:
 *         description: ID de commande invalide
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Commande non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/commandes/:id
 * @desc    Récupère une commande par son ID
 * @access  Private
 */
router.get('/:id', auth, validateParams(idParamSchema), CommandeController.getCommandeById);

/**
 * @swagger
 * /api/v1/commandes/numero/{numero}:
 *   get:
 *     summary: Récupère une commande par son numéro
 *     description: Récupère les détails d'une commande par son numéro unique
 *     tags: [Commandes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: numero
 *         required: true
 *         schema:
 *           type: string
 *         description: Numéro de la commande
 *     responses:
 *       200:
 *         description: Commande récupérée avec succès
 *       400:
 *         description: Numéro de commande invalide
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Commande non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/commandes/numero/:numero
 * @desc    Récupère une commande par son numéro
 * @access  Private
 */
router.get('/numero/:numero', auth, validateParams(numeroParamSchema), CommandeController.getCommandeByNumero);

/**
 * @swagger
 * /api/v1/commandes/boutique/{boutiqueId}:
 *   get:
 *     summary: Récupère les commandes d'une boutique
 *     description: Récupère la liste paginée des commandes d'une boutique spécifique
 *     tags: [Commandes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: boutiqueId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la boutique
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de la page
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *     responses:
 *       200:
 *         description: Commandes récupérées avec succès
 *       400:
 *         description: ID de boutique invalide
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/commandes/boutique/:boutiqueId
 * @desc    Récupère les commandes d'une boutique
 * @access  Private (propriétaire de la boutique)
 */
router.get('/boutique/:boutiqueId', auth, validateParams(boutiqueIdParamSchema), validateQuery(paginationQuerySchema), isBoutiqueOwner, CommandeController.getCommandesByBoutique);

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
router.patch('/:id/status', auth, validateParams(idParamSchema), validate(updateCommandeStatusSchema), isBoutiqueOwner, CommandeController.updateCommandeStatus);

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
router.patch('/:id/payment-status', auth, validateParams(idParamSchema), validate(updatePaymentStatusSchema), isBoutiqueOwner, CommandeController.updatePaymentStatus);

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

export default router;
