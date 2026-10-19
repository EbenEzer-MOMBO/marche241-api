import Joi from 'joi';
import { MESSAGES_FR_BOOST } from './validation.schemas.boost';
import { CLES_ASSETS } from '../models/asset-marque.model';

/** Schémas Joi des assets de marque et de la galerie de médias (messages en français). */

const fr = <T extends Joi.Schema>(schema: T): T =>
  schema.prefs({ messages: MESSAGES_FR_BOOST, errors: { wrap: { label: false } } }) as T;

const id = (libelle: string) =>
  Joi.number().integer().positive().label(libelle).messages({
    'number.base': `${libelle} doit être un nombre`,
    'number.integer': `${libelle} doit être un entier`,
    'number.positive': `${libelle} doit être positif`,
    'any.required': `${libelle} est obligatoire`,
  });

export const TYPES_MEDIA = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
] as const;

export const listeMediasQuerySchema = fr(
  Joi.object({
    recherche: Joi.string().trim().allow('').max(150).label('La recherche'),
    type: Joi.string().allow('').valid(...TYPES_MEDIA).label('Le type'),
    formats: Joi.string()
      .allow('')
      .pattern(/^image\/[a-z0-9.+-]+(,image\/[a-z0-9.+-]+)*$/)
      .label('Les formats')
      .messages({ 'string.pattern.base': 'Les formats doivent être des types MIME séparés par des virgules' }),
    page: Joi.number().integer().min(1).default(1).label('La page'),
    limite: Joi.number().integer().min(1).max(200).default(24).label('La limite'),
  })
);

export const envoiMediaSchema = fr(
  Joi.object({
    nom: Joi.string().trim().min(1).max(150).required().label('Le nom'),
  })
);

export const mediaIdParamSchema = fr(Joi.object({ id: id("L'ID du média").required() }));

export const cleEmplacementParamSchema = fr(
  Joi.object({
    cle: Joi.string().valid(...CLES_ASSETS).required().label("L'emplacement"),
  })
);

export const affectationSchema = fr(
  Joi.object({
    media_id: id('Le média').allow(null).required(),
  })
);
