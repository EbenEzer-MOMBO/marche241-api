import Joi from 'joi';

// Schéma pour le paramètre commandeId
export const commandeIdParamSchema = Joi.object({
  commandeId: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la commande doit être un nombre',
    'any.required': 'L\'ID de la commande est obligatoire'
  })
});

// Schéma pour le paramètre reference
export const referenceParamSchema = Joi.object({
  reference: Joi.string().required().messages({
    'string.empty': 'La référence ne peut pas être vide',
    'any.required': 'La référence est obligatoire'
  })
});

// Schéma pour la création d'une transaction
export const createTransactionSchema = Joi.object({
  commande_id: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la commande doit être un nombre',
    'any.required': 'L\'ID de la commande est obligatoire'
  }),
  reference_transaction: Joi.string().required().messages({
    'string.empty': 'La référence de transaction ne peut pas être vide',
    'any.required': 'La référence de transaction est obligatoire'
  }),
  montant: Joi.number().integer().min(0).required().messages({
    'number.base': 'Le montant doit être un nombre',
    'number.min': 'Le montant doit être supérieur ou égal à {#limit}',
    'any.required': 'Le montant est obligatoire'
  }),
  methode_paiement: Joi.string().valid('mobile_money', 'airtel_money', 'moov_money', 'especes', 'virement').required().messages({
    'any.only': 'La méthode de paiement doit être l\'une des suivantes: mobile_money, airtel_money, moov_money, especes, virement',
    'any.required': 'La méthode de paiement est obligatoire'
  }),
  statut: Joi.string().valid('en_attente', 'paye', 'echec', 'rembourse').default('en_attente').messages({
    'any.only': 'Le statut doit être l\'un des suivants: en_attente, paye, echec, rembourse'
  }),
  numero_telephone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).allow(null, '').messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)'
  }),
  reference_operateur: Joi.string().allow(null, ''),
  notes: Joi.string().allow(null, '')
});

// Schéma pour la mise à jour d'une transaction
export const updateTransactionSchema = Joi.object({
  commande_id: Joi.number().integer().messages({
    'number.base': 'L\'ID de la commande doit être un nombre'
  }),
  reference_transaction: Joi.string().messages({
    'string.empty': 'La référence de transaction ne peut pas être vide'
  }),
  montant: Joi.number().integer().min(0).messages({
    'number.base': 'Le montant doit être un nombre',
    'number.min': 'Le montant doit être supérieur ou égal à {#limit}'
  }),
  methode_paiement: Joi.string().valid('mobile_money', 'airtel_money', 'moov_money', 'especes', 'virement').messages({
    'any.only': 'La méthode de paiement doit être l\'une des suivantes: mobile_money, airtel_money, moov_money, especes, virement'
  }),
  statut: Joi.string().valid('en_attente', 'paye', 'echec', 'rembourse').messages({
    'any.only': 'Le statut doit être l\'un des suivants: en_attente, paye, echec, rembourse'
  }),
  numero_telephone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).allow(null, '').messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)'
  }),
  reference_operateur: Joi.string().allow(null, ''),
  notes: Joi.string().allow(null, '')
}).min(1).messages({
  'object.min': 'Au moins un champ doit être fourni pour la mise à jour'
});

// Schéma pour la mise à jour du statut d'une transaction
export const updateTransactionStatusSchema = Joi.object({
  statut: Joi.string().valid('en_attente', 'paye', 'echec', 'rembourse').required().messages({
    'any.only': 'Le statut doit être l\'un des suivants: en_attente, paye, echec, rembourse',
    'any.required': 'Le statut est obligatoire'
  }),
  reference_operateur: Joi.string().allow(null, ''),
  notes: Joi.string().allow(null, '')
});

// Schéma pour les paramètres de requête des statistiques
export const transactionStatsQuerySchema = Joi.object({
  start_date: Joi.date().iso().messages({
    'date.base': 'La date de début doit être une date valide',
    'date.format': 'La date de début doit être au format ISO'
  }),
  end_date: Joi.date().iso().min(Joi.ref('start_date')).messages({
    'date.base': 'La date de fin doit être une date valide',
    'date.format': 'La date de fin doit être au format ISO',
    'date.min': 'La date de fin doit être postérieure à la date de début'
  })
});
