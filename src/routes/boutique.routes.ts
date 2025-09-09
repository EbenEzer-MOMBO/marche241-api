import { Router } from 'express';
import { BoutiqueController } from '../controllers/boutique.controller';
import { auth, isAdmin, isBoutiqueOwner } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { 
  createBoutiqueSchema, 
  updateBoutiqueSchema, 
  updateBoutiqueStatusSchema,
  idParamSchema,
  slugParamSchema,
  paginationQuerySchema 
} from '../utils/validation.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/boutiques:
 *   get:
 *     summary: Récupère toutes les boutiques
 *     description: Récupère une liste paginée de toutes les boutiques disponibles
 *     tags: [Boutiques]
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
 *       - in: query
 *         name: tri_par
 *         schema:
 *           type: string
 *           default: date_creation
 *         description: Champ de tri
 *       - in: query
 *         name: ordre
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Ordre de tri
 *     responses:
 *       200:
 *         description: Liste des boutiques récupérée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 donnees:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Boutique'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limite:
 *                   type: integer
 *                 total_pages:
 *                   type: integer
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/boutiques
 * @desc    Récupère toutes les boutiques avec pagination
 * @access  Public
 */
router.get('/', validateQuery(paginationQuerySchema), BoutiqueController.getAllBoutiques);

/**
 * @route   GET /api/v1/boutiques/:id
 * @desc    Récupère une boutique par son ID
 * @access  Public
 */
router.get('/:id', validateParams(idParamSchema), BoutiqueController.getBoutiqueById);

/**
 * @route   GET /api/v1/boutiques/slug/:slug
 * @desc    Récupère une boutique par son slug
 * @access  Public
 */
router.get('/slug/:slug', validateParams(slugParamSchema), BoutiqueController.getBoutiqueBySlug);

/**
 * @route   GET /api/v1/boutiques/vendeur/:vendeurId
 * @desc    Récupère toutes les boutiques d'un vendeur
 * @access  Public
 */
router.get('/vendeur/:vendeurId', validateParams(idParamSchema), BoutiqueController.getBoutiquesByVendeurId);

/**
 * @route   POST /api/v1/boutiques
 * @desc    Crée une nouvelle boutique
 * @access  Private (vendeur authentifié)
 */
router.post('/', auth, validate(createBoutiqueSchema), BoutiqueController.createBoutique);

/**
 * @route   PUT /api/v1/boutiques/:id
 * @desc    Met à jour une boutique existante
 * @access  Private (propriétaire de la boutique)
 */
router.put('/:id', auth, validateParams(idParamSchema), isBoutiqueOwner, validate(updateBoutiqueSchema), BoutiqueController.updateBoutique);

/**
 * @route   DELETE /api/v1/boutiques/:id
 * @desc    Supprime une boutique
 * @access  Private (propriétaire de la boutique ou admin)
 */
router.delete('/:id', auth, validateParams(idParamSchema), isBoutiqueOwner, BoutiqueController.deleteBoutique);

/**
 * @route   PATCH /api/v1/boutiques/:id/statut
 * @desc    Met à jour le statut d'une boutique
 * @access  Private (admin)
 */
router.patch('/:id/statut', auth, validateParams(idParamSchema), isAdmin, validate(updateBoutiqueStatusSchema), BoutiqueController.updateBoutiqueStatus);

export default router;
