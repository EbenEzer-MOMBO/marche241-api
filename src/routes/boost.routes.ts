import { Router } from 'express';
import { BoostController } from '../controllers/boost.controller';
import { auth, isBoutiqueOwner } from '../middlewares/auth.middleware';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { creerBoostSchema, idParamSchema, boutiqueIdParamSchema, paginationQuerySchema } from '../utils/validation.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/boosts/forfaits:
 *   get:
 *     summary: Liste les forfaits de boost publicitaire disponibles
 *     tags: [Boosts]
 *     responses:
 *       200:
 *         description: Liste des forfaits
 */
router.get('/forfaits', authOrServiceKey, BoostController.getForfaits);

/**
 * @swagger
 * /api/v1/boosts:
 *   post:
 *     summary: Crée un boost pour une boutique (statut initial en_attente_paiement)
 *     tags: [Boosts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Boost créé
 */
router.post('/', auth, isBoutiqueOwner, validate(creerBoostSchema), BoostController.creerBoost);

/**
 * @swagger
 * /api/v1/boosts/boutiques/{boutiqueId}:
 *   get:
 *     summary: Liste paginée des boosts d'une boutique (vendeur propriétaire)
 *     tags: [Boosts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste paginée des boosts
 */
router.get(
  '/boutiques/:boutiqueId',
  auth,
  validateParams(boutiqueIdParamSchema),
  validateQuery(paginationQuerySchema),
  isBoutiqueOwner,
  BoostController.listerBoostsBoutique
);

/**
 * @swagger
 * /api/v1/boosts/{id}:
 *   get:
 *     summary: Détail d'un boost (vendeur propriétaire ou admin)
 *     tags: [Boosts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Détail du boost
 */
router.get('/:id', authOrServiceKey, validateParams(idParamSchema), BoostController.getBoostDetail);

/**
 * @swagger
 * /api/v1/boosts/admin/tous:
 *   get:
 *     summary: Liste paginée et filtrée de tous les boosts (admin uniquement)
 *     tags: [Boosts]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Liste paginée des boosts
 */
router.get('/admin/tous', authOrServiceKey, BoostController.listerTousBoosts);

/**
 * @swagger
 * /api/v1/boosts/admin/{id}/pause:
 *   post:
 *     summary: Met un boost en pause (admin uniquement)
 *     tags: [Boosts]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Boost mis en pause
 */
router.post('/admin/:id/pause', authOrServiceKey, validateParams(idParamSchema), BoostController.pauseBoost);

/**
 * @swagger
 * /api/v1/boosts/admin/{id}/reprendre:
 *   post:
 *     summary: Relance un boost mis en pause (admin uniquement)
 *     tags: [Boosts]
 *     security:
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Boost relancé
 */
router.post('/admin/:id/reprendre', authOrServiceKey, validateParams(idParamSchema), BoostController.reprendreBoost);

export default router;
