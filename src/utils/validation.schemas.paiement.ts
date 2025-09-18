import Joi from 'joi';

// Schéma pour l'initialisation d'un paiement mobile
export const initierPaiementMobileSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'L\'email doit être valide',
    'any.required': 'L\'email est obligatoire'
  }),
  msisdn: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required().messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)',
    'any.required': 'Le numéro de téléphone est obligatoire'
  }),
  amount: Joi.number().positive().required().messages({
    'number.base': 'Le montant doit être un nombre',
    'number.positive': 'Le montant doit être positif',
    'any.required': 'Le montant est obligatoire'
  }),
  reference: Joi.string().required().messages({
    'string.empty': 'La référence ne peut pas être vide',
    'any.required': 'La référence est obligatoire'
  }),
  payment_system: Joi.string().valid('airtelmoney', 'moovmoney').required().messages({
    'any.only': 'Le système de paiement doit être l\'un des suivants: airtelmoney, moovmoney',
    'any.required': 'Le système de paiement est obligatoire'
  }),
  description: Joi.string().required().messages({
    'string.empty': 'La description ne peut pas être vide',
    'any.required': 'La description est obligatoire'
  }),
  lastname: Joi.string().required().messages({
    'string.empty': 'Le nom ne peut pas être vide',
    'any.required': 'Le nom est obligatoire'
  }),
  firstname: Joi.string().allow('', null)
});

// Schéma pour l'initialisation d'un paiement Visa
export const initierPaiementVisaSchema = Joi.object({
  transaction_id: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la transaction doit être un nombre',
    'any.required': 'L\'ID de la transaction est obligatoire'
  }),
  return_url: Joi.string().uri().required().messages({
    'string.uri': 'L\'URL de retour doit être une URL valide',
    'any.required': 'L\'URL de retour est obligatoire'
  }),
  email: Joi.string().email().allow('', null).messages({
    'string.email': 'L\'email doit être valide'
  }),
  msisdn: Joi.string().pattern(/^\+?[0-9]{8,15}$/).allow('', null).messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)'
  }),
  lastname: Joi.string().allow('', null),
  firstname: Joi.string().allow('', null)
});

// Schéma pour la vérification d'un paiement
export const verifierPaiementSchema = Joi.object({
  bill_id: Joi.string().required().messages({
    'string.empty': 'L\'ID de la facture ne peut pas être vide',
    'any.required': 'L\'ID de la facture est obligatoire'
  })
});
