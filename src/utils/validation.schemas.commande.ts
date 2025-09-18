import Joi from 'joi';

// Schéma pour le paramètre boutiqueId
export const boutiqueIdParamSchema = Joi.object({
  boutiqueId: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la boutique doit être un nombre',
    'any.required': 'L\'ID de la boutique est obligatoire'
  })
});

// Schéma pour le paramètre numero
export const numeroParamSchema = Joi.object({
  numero: Joi.string().required().messages({
    'string.empty': 'Le numéro de commande ne peut pas être vide',
    'any.required': 'Le numéro de commande est obligatoire'
  })
});

// Schéma pour la création d'un article de commande
const commandeArticleSchema = Joi.object({
  produit_id: Joi.number().integer().required().messages({
    'number.base': 'L\'ID du produit doit être un nombre',
    'any.required': 'L\'ID du produit est obligatoire'
  }),
  quantite: Joi.number().integer().min(1).required().messages({
    'number.base': 'La quantité doit être un nombre',
    'number.min': 'La quantité doit être supérieure ou égale à {#limit}',
    'any.required': 'La quantité est obligatoire'
  }),
  prix_unitaire: Joi.number().min(0).required().messages({
    'number.base': 'Le prix unitaire doit être un nombre',
    'number.min': 'Le prix unitaire doit être supérieur ou égal à {#limit}',
    'any.required': 'Le prix unitaire est obligatoire'
  }),
  nom_produit: Joi.string().required().messages({
    'string.empty': 'Le nom du produit ne peut pas être vide',
    'any.required': 'Le nom du produit est obligatoire'
  }),
  description: Joi.string().allow(null, ''),
  variants_selectionnes: Joi.object().allow(null)
});

// Schéma pour la création d'une commande
export const createCommandeSchema = Joi.object({
  boutique_id: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la boutique doit être un nombre',
    'any.required': 'L\'ID de la boutique est obligatoire'
  }),
  client_nom: Joi.string().required().messages({
    'string.empty': 'Le nom du client ne peut pas être vide',
    'any.required': 'Le nom du client est obligatoire'
  }),
  client_telephone: Joi.string().required().pattern(/^\+?[0-9]{8,15}$/).messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)',
    'any.required': 'Le numéro de téléphone est obligatoire'
  }),
  client_adresse: Joi.string().required().messages({
    'string.empty': 'L\'adresse du client ne peut pas être vide',
    'any.required': 'L\'adresse du client est obligatoire'
  }),
  client_ville: Joi.string().required().messages({
    'string.empty': 'La ville du client ne peut pas être vide',
    'any.required': 'La ville du client est obligatoire'
  }),
  client_commune: Joi.string().required().messages({
    'string.empty': 'La commune du client ne peut pas être vide',
    'any.required': 'La commune du client est obligatoire'
  }),
  client_instructions: Joi.string().allow(null, ''),
  frais_livraison: Joi.number().min(0).default(0).messages({
    'number.base': 'Les frais de livraison doivent être un nombre',
    'number.min': 'Les frais de livraison doivent être supérieurs ou égaux à {#limit}'
  }),
  taxes: Joi.number().min(0).default(0).messages({
    'number.base': 'Les taxes doivent être un nombre',
    'number.min': 'Les taxes doivent être supérieures ou égales à {#limit}'
  }),
  remise: Joi.number().min(0).default(0).messages({
    'number.base': 'La remise doit être un nombre',
    'number.min': 'La remise doit être supérieure ou égale à {#limit}'
  }),
  articles: Joi.array().items(commandeArticleSchema).min(1).required().messages({
    'array.min': 'La commande doit contenir au moins un article',
    'any.required': 'Les articles sont obligatoires'
  })
});

// Schéma pour la mise à jour du statut d'une commande
export const updateCommandeStatusSchema = Joi.object({
  statut: Joi.string().valid('en_attente', 'confirmee', 'en_preparation', 'expedie', 'livree', 'annulee', 'remboursee').required().messages({
    'any.only': 'Le statut doit être l\'un des suivants: en_attente, confirmee, en_preparation, expedie, livree, annulee, remboursee',
    'any.required': 'Le statut est obligatoire'
  })
});

// Schéma pour la mise à jour du statut de paiement d'une commande
export const updatePaymentStatusSchema = Joi.object({
  statut_paiement: Joi.string().valid('en_attente', 'paye', 'echec', 'rembourse').required().messages({
    'any.only': 'Le statut de paiement doit être l\'un des suivants: en_attente, paye, echec, rembourse',
    'any.required': 'Le statut de paiement est obligatoire'
  }),
  methode_paiement: Joi.string().valid('mobile_money', 'airtel_money', 'moov_money', 'especes', 'virement').messages({
    'any.only': 'La méthode de paiement doit être l\'une des suivantes: mobile_money, airtel_money, moov_money, especes, virement'
  })
});

// Schéma pour l'initialisation du paiement d'une commande
export const initierPaiementSchema = Joi.object({
  methode_paiement: Joi.string().valid('mobile_money', 'airtel_money', 'moov_money', 'especes', 'virement').required().messages({
    'any.only': 'La méthode de paiement doit être l\'une des suivantes: mobile_money, airtel_money, moov_money, especes, virement',
    'any.required': 'La méthode de paiement est obligatoire'
  }),
  numero_telephone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)'
  })
});
