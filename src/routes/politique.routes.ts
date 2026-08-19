import { Router } from 'express';
import { PolitiqueController } from '../controllers/politique.controller';

const router = Router();

/**
 * @route   GET /api/v1/politique-confidentialite
 * @desc    Récupère la politique de confidentialité publique
 * @access  Public
 */
router.get('/', PolitiqueController.getPolitique);

export default router;
