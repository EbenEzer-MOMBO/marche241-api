import Joi from 'joi';

// Schéma pour le paramètre boutiqueId
export const boutiqueIdParamSchema = Joi.object({
  boutiqueId: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la boutique doit être un nombre',
    'any.required': 'L\'ID de la boutique est obligatoire'
  })
});

// Schéma pour la création d'une commune
export const createCommuneSchema = Joi.object({
  boutique_id: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la boutique doit être un nombre',
    'any.required': 'L\'ID de la boutique est obligatoire'
  }),
  nom_commune: Joi.string().required().min(2).max(100).messages({
    'string.min': 'Le nom de la commune doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom de la commune ne doit pas dépasser {#limit} caractères',
    'any.required': 'Le nom de la commune est obligatoire'
  }),
  code_postal: Joi.string().allow(null, '').messages({
    'string.base': 'Le code postal doit être une chaîne de caractères'
  }),
  tarif_livraison: Joi.number().required().min(0).messages({
    'number.base': 'Le tarif de livraison doit être un nombre',
    'number.min': 'Le tarif de livraison doit être supérieur ou égal à {#limit}',
    'any.required': 'Le tarif de livraison est obligatoire'
  }),
  delai_livraison_min: Joi.number().integer().required().min(0).messages({
    'number.base': 'Le délai minimum de livraison doit être un nombre entier',
    'number.min': 'Le délai minimum de livraison doit être supérieur ou égal à {#limit}',
    'any.required': 'Le délai minimum de livraison est obligatoire'
  }),
  delai_livraison_max: Joi.number().integer().required().min(Joi.ref('delai_livraison_min')).messages({
    'number.base': 'Le délai maximum de livraison doit être un nombre entier',
    'number.min': 'Le délai maximum de livraison doit être supérieur ou égal au délai minimum',
    'any.required': 'Le délai maximum de livraison est obligatoire'
  }),
  est_active: Joi.boolean().default(true).messages({
    'boolean.base': 'Le statut d\'activation doit être un booléen'
  })
});

// Schéma pour la mise à jour d'une commune
export const updateCommuneSchema = Joi.object({
  boutique_id: Joi.number().integer().messages({
    'number.base': 'L\'ID de la boutique doit être un nombre'
  }),
  nom_commune: Joi.string().min(2).max(100).messages({
    'string.min': 'Le nom de la commune doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom de la commune ne doit pas dépasser {#limit} caractères'
  }),
  code_postal: Joi.string().allow(null, '').messages({
    'string.base': 'Le code postal doit être une chaîne de caractères'
  }),
  tarif_livraison: Joi.number().min(0).messages({
    'number.base': 'Le tarif de livraison doit être un nombre',
    'number.min': 'Le tarif de livraison doit être supérieur ou égal à {#limit}'
  }),
  delai_livraison_min: Joi.number().integer().min(0).messages({
    'number.base': 'Le délai minimum de livraison doit être un nombre entier',
    'number.min': 'Le délai minimum de livraison doit être supérieur ou égal à {#limit}'
  }),
  delai_livraison_max: Joi.number().integer().min(Joi.ref('delai_livraison_min')).messages({
    'number.base': 'Le délai maximum de livraison doit être un nombre entier',
    'number.min': 'Le délai maximum de livraison doit être supérieur ou égal au délai minimum'
  }),
  est_active: Joi.boolean().messages({
    'boolean.base': 'Le statut d\'activation doit être un booléen'
  })
}).min(1).messages({
  'object.min': 'Au moins un champ doit être fourni pour la mise à jour'
});

// Schéma pour le changement de statut d'une commune
export const toggleCommuneStatusSchema = Joi.object({
  est_active: Joi.boolean().required().messages({
    'boolean.base': 'Le statut d\'activation doit être un booléen',
    'any.required': 'Le statut d\'activation est obligatoire'
  })
});
