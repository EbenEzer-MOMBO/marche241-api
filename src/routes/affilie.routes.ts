import { Router } from 'express';
import { AffilieController } from '../controllers/affilie.controller';
import { authAffilie } from '../middlewares/auth.affilie.middleware';
import { validate, validateParams } from '../middlewares/validation.middleware';
import { registrationLimiter, affilieCodeLimiter } from '../middlewares/rate-limit.middleware';
import {
  inscriptionAffilieSchema,
  codeAffilieParamSchema,
  demanderCodeAffilieSchema,
  verifierCodeAffilieSchema
} from '../utils/validation.schemas';

const router = Router();

/**
 * @route   POST /api/v1/affilies/inscription
 * @desc    Inscription d'un affilié (nom, email, WhatsApp, pays) — génère le code de tracking
 * @access  Public
 */
router.post(
  '/inscription',
  registrationLimiter,
  validate(inscriptionAffilieSchema),
  AffilieController.inscrireAffilie
);

/**
 * @route   GET /api/v1/affilies/resoudre/:code
 * @desc    Vérifie qu'un code affilié est valide (sans exposer de PII)
 * @access  Public
 */
router.get(
  '/resoudre/:code',
  validateParams(codeAffilieParamSchema),
  AffilieController.resoudreCode
);

/**
 * @route   POST /api/v1/affilies/connexion/demander-code
 * @desc    Demande un code OTP de connexion par email (mini dashboard affilié)
 * @access  Public
 */
router.post(
  '/connexion/demander-code',
  affilieCodeLimiter,
  validate(demanderCodeAffilieSchema),
  AffilieController.demanderCodeConnexion
);

/**
 * @route   POST /api/v1/affilies/connexion/verifier
 * @desc    Vérifie le code OTP et émet un token de session (~30 jours)
 * @access  Public
 */
router.post(
  '/connexion/verifier',
  affilieCodeLimiter,
  validate(verifierCodeAffilieSchema),
  AffilieController.verifierCodeConnexion
);

/**
 * @route   GET /api/v1/affilies/moi
 * @desc    Profil + résumé (solde dû, total versé, commandes livrées) de l'affilié authentifié
 * @access  Private (affilié)
 */
router.get('/moi', authAffilie, AffilieController.getProfilEtSolde);

/**
 * @route   PUT /api/v1/affilies/moi
 * @desc    Met à jour le profil de l'affilié authentifié (WhatsApp/email/pays)
 * @access  Private (affilié)
 */
router.put('/moi', authAffilie, AffilieController.updateProfil);

/**
 * @route   GET /api/v1/affilies/moi/commissions
 * @desc    Historique paginé des commissions de l'affilié authentifié
 * @access  Private (affilié)
 */
router.get('/moi/commissions', authAffilie, AffilieController.getHistoriqueCommissions);

export default router;
