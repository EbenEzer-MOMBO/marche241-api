import { Router } from 'express';
import { TransactionController } from '../controllers/transaction.controller';
import { auth, isAdmin } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { idParamSchema, paginationQuerySchema } from '../utils/validation.schemas';
import { 
  commandeIdParamSchema,
  boutiqueIdParamSchema,
  createTransactionSchema, 
  referenceParamSchema, 
  transactionStatsQuerySchema, 
  updateTransactionSchema, 
  updateTransactionStatusSchema 
} from '../utils/validation.schemas.transaction';

const router = Router();

/**
 * @swagger
 * /api/v1/transactions:
 *   get:
 *     summary: Récupère toutes les transactions
 *     description: Récupère la liste paginée de toutes les transactions
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Liste des transactions récupérée avec succès
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/transactions
 * @desc    Récupère toutes les transactions
 * @access  Private (admin)
 */
router.get('/', validateQuery(paginationQuerySchema), TransactionController.getAllTransactions);

/**
 * @swagger
 * /api/v1/transactions/stats:
 *   get:
 *     summary: Récupère les statistiques des transactions
 *     description: Récupère les statistiques des transactions avec filtrage par date
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Date de début (format ISO)
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Date de fin (format ISO)
 *     responses:
 *       200:
 *         description: Statistiques récupérées avec succès
 *       400:
 *         description: Paramètres invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/transactions/stats
 * @desc    Récupère les statistiques des transactions
 * @access  Private (admin)
 */
router.get('/stats', validateQuery(transactionStatsQuerySchema), TransactionController.getTransactionStats);

/**
 * @swagger
 * /api/v1/transactions/boutique/{boutiqueId}:
 *   get:
 *     summary: Récupère les transactions d'une boutique
 *     description: Récupère toutes les transactions associées aux commandes d'une boutique spécifique avec pagination
 *     tags: [Transactions]
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
 *         description: Transactions récupérées avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transactions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Transaction'
 *                 total:
 *                   type: integer
 *                   example: 50
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 limite:
 *                   type: integer
 *                   example: 10
 *                 total_pages:
 *                   type: integer
 *                   example: 5
 *       400:
 *         description: ID de boutique invalide
 *       401:
 *         description: Non authentifié
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/transactions/boutique/:boutiqueId
 * @desc    Récupère les transactions d'une boutique
 * @access  Private
 */
router.get('/boutique/:boutiqueId', validateParams(boutiqueIdParamSchema), validateQuery(paginationQuerySchema), TransactionController.getTransactionsByBoutiqueId);

/**
 * @swagger
 * /api/v1/transactions/commande/{commandeId}:
 *   get:
 *     summary: Récupère les transactions d'une commande
 *     description: Récupère toutes les transactions associées à une commande spécifique
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commandeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commande
 *     responses:
 *       200:
 *         description: Transactions récupérées avec succès
 *       400:
 *         description: ID de commande invalide
 *       401:
 *         description: Non authentifié
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/transactions/commande/:commandeId
 * @desc    Récupère les transactions d'une commande
 * @access  Private
 */
router.get('/commande/:commandeId', validateParams(commandeIdParamSchema), TransactionController.getTransactionsByCommandeId);

/**
 * @swagger
 * /api/v1/transactions/reference/{reference}:
 *   get:
 *     summary: Récupère une transaction par sa référence
 *     description: Récupère les détails d'une transaction spécifique en utilisant sa référence unique
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reference
 *         required: true
 *         schema:
 *           type: string
 *         description: Référence unique de la transaction
 *     responses:
 *       200:
 *         description: Transaction récupérée avec succès
 *       400:
 *         description: Référence invalide
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Transaction non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/transactions/reference/:reference
 * @desc    Récupère une transaction par sa référence
 * @access  Private
 */
router.get('/reference/:reference', validateParams(referenceParamSchema), TransactionController.getTransactionByReference);

/**
 * @swagger
 * /api/v1/transactions/{id}:
 *   get:
 *     summary: Récupère une transaction par son ID
 *     description: Récupère les détails d'une transaction spécifique
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la transaction
 *     responses:
 *       200:
 *         description: Transaction récupérée avec succès
 *       400:
 *         description: ID de transaction invalide
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Transaction non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/transactions/:id
 * @desc    Récupère une transaction par son ID
 * @access  Private
 */
router.get('/:id', validateParams(idParamSchema), TransactionController.getTransactionById);

/**
 * @swagger
 * /api/v1/transactions:
 *   post:
 *     summary: Crée une nouvelle transaction
 *     description: Crée une nouvelle transaction de paiement
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTransaction'
 *     responses:
 *       201:
 *         description: Transaction créée avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/transactions
 * @desc    Crée une nouvelle transaction
 * @access  Private
 */
router.post('/', validate(createTransactionSchema), TransactionController.createTransaction);

/**
 * @swagger
 * /api/v1/transactions/{id}/status:
 *   patch:
 *     summary: Met à jour le statut d'une transaction
 *     description: Met à jour le statut d'une transaction existante
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTransactionStatus'
 *     responses:
 *       200:
 *         description: Statut de la transaction mis à jour avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Transaction non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PATCH /api/v1/transactions/:id/status
 * @desc    Met à jour le statut d'une transaction
 * @access  Private (admin)
 */
router.patch('/:id/status', validateParams(idParamSchema), validate(updateTransactionStatusSchema), TransactionController.updateTransactionStatus);

/**
 * @swagger
 * /api/v1/transactions/{id}:
 *   put:
 *     summary: Met à jour une transaction
 *     description: Met à jour les détails d'une transaction existante
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la transaction
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTransaction'
 *     responses:
 *       200:
 *         description: Transaction mise à jour avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Transaction non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PUT /api/v1/transactions/:id
 * @desc    Met à jour une transaction
 * @access  Private (admin)
 */
router.put('/:id', validateParams(idParamSchema), validate(updateTransactionSchema), TransactionController.updateTransaction);

export default router;
