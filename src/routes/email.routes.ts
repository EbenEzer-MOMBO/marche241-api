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

export default router;
