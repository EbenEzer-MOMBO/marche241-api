import { Router } from 'express';
import Joi from 'joi';
import { EmailController } from '../controllers/email.controller';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';
import { validate } from '../middlewares/validation.middleware';

const router = Router();

const boutiqueBadgeVerifieSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'L\'adresse email doit être valide',
    'any.required': 'L\'adresse email est obligatoire',
  }),
  boutiqueNom: Joi.string().required().max(255).messages({
    'any.required': 'Le nom de la boutique est obligatoire',
  }),
  boutiqueSlug: Joi.string().required().max(255).messages({
    'any.required': 'Le slug de la boutique est obligatoire',
  }),
});

router.post(
  '/boutique-badge-verifie',
  authOrServiceKey,
  validate(boutiqueBadgeVerifieSchema),
  EmailController.envoyerBoutiqueBadgeVerifie
);

const avisVersementSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'L\'adresse email doit être valide',
    'any.required': 'L\'adresse email est obligatoire',
  }),
  montant: Joi.number().integer().min(1).required().messages({
    'number.base': 'Le montant doit être un nombre',
    'number.integer': 'Le montant doit être un entier (FCFA)',
    'number.min': 'Le montant doit être supérieur à zéro',
    'any.required': 'Le montant est obligatoire',
  }),
  moyen: Joi.string().valid('moov_money', 'airtel_money').required().messages({
    'any.only': 'Le moyen de versement doit être moov_money ou airtel_money',
    'any.required': 'Le moyen de versement est obligatoire',
  }),
  telephone: Joi.string().required().max(20).messages({
    'any.required': 'Le numéro de réception est obligatoire',
  }),
  periodeLabel: Joi.string().required().max(100).messages({
    'any.required': 'La période est obligatoire',
  }),
  reference: Joi.string().required().max(100).messages({
    'any.required': 'La référence de la transaction est obligatoire',
  }),
  nombreCommandes: Joi.number().integer().min(0).optional().messages({
    'number.base': 'Le nombre de commandes doit être un nombre',
  }),
  boutiques: Joi.string().max(255).optional(),
  boutiqueSlug: Joi.string().max(255).optional(),
});

/**
 * @swagger
 * /emails/avis-versement:
 *   post:
 *     summary: Envoyer l'avis de versement au vendeur (admin, x-service-key)
 *     tags: [Emails]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, montant, moyen, telephone, periodeLabel, reference]
 *             properties:
 *               email: { type: string, example: vendeur@example.com }
 *               montant: { type: integer, example: 125000, description: Montant versé en FCFA }
 *               moyen: { type: string, enum: [moov_money, airtel_money] }
 *               telephone: { type: string, example: '074000000' }
 *               periodeLabel: { type: string, example: septembre 2026 }
 *               reference: { type: string, example: TX-8F2K91 }
 *               nombreCommandes: { type: integer, example: 12 }
 *               boutiques: { type: string, example: Boutique Akanda }
 *               boutiqueSlug: { type: string, example: boutique-akanda }
 *     responses:
 *       200:
 *         description: Email envoyé
 *       400:
 *         description: Paramètres invalides (VALIDATION_ERROR)
 *       401:
 *         description: Clé de service ou JWT manquant
 *       403:
 *         description: Appel avec un JWT vendeur (clé de service admin requise)
 *       500:
 *         description: Échec de l'envoi via Resend
 */
router.post(
  '/avis-versement',
  authOrServiceKey,
  validate(avisVersementSchema),
  EmailController.envoyerAvisVersement
);

export default router;
