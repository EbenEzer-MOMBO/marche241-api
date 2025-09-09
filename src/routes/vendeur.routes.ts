import { Router } from 'express';
import { VendeurController } from '../controllers/vendeur.controller';
import { auth, isAdmin } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { 
  createVendeurSchema, 
  updateVendeurSchema, 
  demandeCodeSchema, 
  verificationCodeSchema,
  idParamSchema,
  paginationQuerySchema 
} from '../utils/validation.schemas';

const router = Router();

/**
 * @route   GET /api/v1/vendeurs
 * @desc    Récupère tous les vendeurs avec pagination
 * @access  Private (admin)
 */
router.get('/', auth, isAdmin, validateQuery(paginationQuerySchema), VendeurController.getAllVendeurs);

/**
 * @route   GET /api/v1/vendeurs/:id
 * @desc    Récupère un vendeur par son ID
 * @access  Private (vendeur authentifié ou admin)
 */
router.get('/:id', auth, validateParams(idParamSchema), VendeurController.getVendeurById);

/**
 * @route   POST /api/v1/vendeurs
 * @desc    Crée un nouveau vendeur
 * @access  Public
 */
router.post('/', validate(createVendeurSchema), VendeurController.createVendeur);

/**
 * @route   PUT /api/v1/vendeurs/:id
 * @desc    Met à jour un vendeur existant
 * @access  Private (vendeur authentifié)
 */
router.put('/:id', auth, validateParams(idParamSchema), validate(updateVendeurSchema), VendeurController.updateVendeur);

/**
 * @route   DELETE /api/v1/vendeurs/:id
 * @desc    Supprime un vendeur
 * @access  Private (admin)
 */
router.delete('/:id', auth, isAdmin, validateParams(idParamSchema), VendeurController.deleteVendeur);

/**
 * @route   POST /api/v1/vendeurs/code
 * @desc    Demande un code de vérification
 * @access  Public
 */
router.post('/code', validate(demandeCodeSchema), VendeurController.demanderCodeVerification);

/**
 * @route   POST /api/v1/vendeurs/verification
 * @desc    Vérifie un code de vérification
 * @access  Public
 */
router.post('/verification', validate(verificationCodeSchema), VendeurController.verifierCode);

export default router;
