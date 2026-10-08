import Joi from 'joi';

export const enregistrerVueSchema = Joi.object({
  type_entite: Joi.string().valid('boutique', 'produit').required().messages({
    'any.only': 'Le type d\'entité doit être boutique ou produit',
    'any.required': 'Le type d\'entité est obligatoire'
  }),
  entite_id: Joi.number().integer().positive().required().messages({
    'number.base': 'L\'identifiant de l\'entité doit être un nombre',
    'any.required': 'L\'identifiant de l\'entité est obligatoire'
  }),
  referrer: Joi.string().allow(null, '').max(2000),
  utm_source: Joi.string().allow(null, '').max(100)
});
