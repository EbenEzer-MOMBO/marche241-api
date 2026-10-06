import Joi from 'joi';
import { GUIDES_VENDEUR } from '../models/vendeur-guide.model';

/** Schémas Joi des visites guidées vendeur (messages en français). */

export const guideParamSchema = Joi.object({
  guide: Joi.string()
    .valid(...GUIDES_VENDEUR)
    .required()
    .messages({
      'any.only': 'Visite guidée inconnue',
      'any.required': 'La visite guidée est obligatoire',
      'string.base': 'La visite guidée est invalide'
    })
});

export const guideStatutSchema = Joi.object({
  statut: Joi.string().valid('termine', 'ignore').required().messages({
    'any.only': 'Le statut doit être « termine » ou « ignore »',
    'any.required': 'Le statut est obligatoire',
    'string.base': 'Le statut est invalide'
  })
});
