import Joi from 'joi';
import { CLES_VILLES, CODES_INTERETS, CODES_PAYS, LOCALES } from '../config/ciblage-boost.config';
import { IDS_CONFORMITE } from '../config/conformite-boost.config';

/** Schémas Joi du boost publicitaire Meta (messages en français). */

const id = (libelle: string) =>
  Joi.number().integer().positive().messages({
    'number.base': `${libelle} doit être un nombre`,
    'number.integer': `${libelle} doit être un entier`,
    'number.positive': `${libelle} doit être positif`,
    'any.required': `${libelle} est obligatoire`
  });

export const boostIdParamSchema = Joi.object({ id: id("L'ID du boost").required() });
export const boutiqueIdParamSchema = Joi.object({ boutiqueId: id("L'ID de la boutique").required() });

export const ciblageSchema = Joi.object({
  pays: Joi.array().items(Joi.string().valid(...CODES_PAYS)).max(8).messages({
    'any.only': 'Pays non proposé au ciblage'
  }),
  villes: Joi.array().items(Joi.string().valid(...CLES_VILLES)).max(8).messages({
    'any.only': 'Ville non proposée au ciblage'
  }),
  age_min: Joi.number().integer().min(18).max(65).messages({
    'number.min': "L'âge minimum est 18 ans",
    'number.max': "L'âge maximum est 65 ans"
  }),
  age_max: Joi.number().integer().min(18).max(65).messages({
    'number.min': "L'âge minimum est 18 ans",
    'number.max': "L'âge maximum est 65 ans"
  }),
  sexes: Joi.array().items(Joi.string().valid('homme', 'femme')).max(2),
  langues: Joi.array().items(Joi.string().valid(...LOCALES)).max(2),
  interets: Joi.array().items(Joi.string().valid(...CODES_INTERETS)).max(10).messages({
    'array.max': 'Maximum 10 centres d’intérêt',
    'any.only': 'Centre d’intérêt non proposé'
  }),
  etape_wizard: Joi.number().integer().min(0).max(4)
});

const champsBrouillon = {
  type_cible: Joi.string().valid('boutique', 'produit'),
  produit_id: id("L'ID du produit").allow(null),
  objectif: Joi.string().valid('trafic', 'whatsapp', 'notoriete').messages({
    'any.only': "L'objectif doit être trafic, whatsapp ou notoriete"
  }),
  nom: Joi.string().trim().max(120).allow(''),
  total_fcfa: Joi.number().integer().min(0).max(10_000_000).messages({
    'number.base': 'Le montant doit être un nombre',
    'number.integer': 'Le montant doit être un entier (FCFA)'
  }),
  duree_jours: Joi.number().integer().min(1).max(60).messages({
    'number.base': 'La durée doit être un nombre de jours'
  }),
  ciblage: ciblageSchema,
  url_destination: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).allow(null, '').messages({
    'string.uri': 'Le lien de destination doit être une URL valide'
  }),
  whatsapp_e164: Joi.string().trim().pattern(/^\+[1-9]\d{7,14}$/).allow(null, '').messages({
    'string.pattern.base': 'Le numéro WhatsApp doit être au format international (ex. +24177000000)'
  }),
  titre: Joi.string().trim().max(80).allow(null, '').messages({ 'string.max': 'Le titre ne doit pas dépasser 80 caractères' }),
  texte_principal: Joi.string().trim().max(500).allow(null, '').messages({ 'string.max': 'Le texte ne doit pas dépasser 500 caractères' }),
  description: Joi.string().trim().max(200).allow(null, '').messages({ 'string.max': 'La description ne doit pas dépasser 200 caractères' }),
  image_url: Joi.string().uri({ scheme: ['http', 'https'] }).max(2000).allow(null, '').messages({
    'string.uri': "Le visuel doit être une URL d'image valide"
  })
};

export const creerBoostSchema = Joi.object({
  boutique_id: id("L'ID de la boutique").required(),
  ...champsBrouillon
});

export const modifierBoostSchema = Joi.object(champsBrouillon).min(1).messages({
  'object.min': 'Aucune donnée à modifier'
});

export const prefillQuerySchema = Joi.object({
  boutique_id: id("L'ID de la boutique").required(),
  produit_id: id("L'ID du produit").optional()
});

export const devisSchema = Joi.object({
  total_fcfa: Joi.number().integer().positive().required().messages({
    'any.required': 'Le montant est obligatoire',
    'number.base': 'Le montant doit être un nombre'
  }),
  duree_jours: Joi.number().integer().min(1).max(60).default(7)
});

export const estimationAudienceSchema = Joi.object({ ciblage: ciblageSchema.required() });

export const estimationImpressionsSchema = Joi.object({
  totaux_fcfa: Joi.array().items(Joi.number().integer().positive()).min(1).max(10).required().messages({
    'any.required': 'Au moins un montant est requis'
  }),
  duree_jours: Joi.number().integer().min(1).max(60).required()
});

export const paiementBoostSchema = Joi.object({
  mode: Joi.string().valid('mobile', 'carte').required().messages({
    'any.only': 'Le mode de paiement doit être mobile ou carte',
    'any.required': 'Le mode de paiement est obligatoire'
  }),
  operateur: Joi.string().valid('airtelmoney', 'moovmoney').when('mode', { is: 'mobile', then: Joi.required() }).messages({
    'any.only': "L'opérateur doit être airtelmoney ou moovmoney",
    'any.required': "L'opérateur mobile money est obligatoire"
  }),
  msisdn: Joi.string().trim().pattern(/^\d{8,15}$/).when('mode', { is: 'mobile', then: Joi.required() }).messages({
    'string.pattern.base': 'Le numéro de téléphone doit contenir 8 à 15 chiffres',
    'any.required': 'Le numéro de téléphone est obligatoire'
  }),
  return_url: Joi.string().uri({ scheme: ['http', 'https'] }).when('mode', { is: 'carte', then: Joi.required() }).messages({
    'any.required': "L'URL de retour est obligatoire pour le paiement par carte"
  }),
  email: Joi.string().email().allow(null, ''),
  nom: Joi.string().trim().max(100).allow(null, '')
});

// --- Admin ---------------------------------------------------------------

export const listeAdminQuerySchema = Joi.object({
  statut: Joi.string().valid(
    'brouillon', 'en_attente_paiement', 'en_attente_validation', 'refuse', 'actif', 'en_pause', 'termine', 'rejete_meta', 'erreur'
  ),
  statut_remboursement: Joi.string().valid('aucun', 'a_rembourser', 'rembourse'),
  boutique_id: Joi.number().integer().positive(),
  recherche: Joi.string().trim().max(100).allow(''),
  page: Joi.number().integer().min(1).default(1),
  limite: Joi.number().integer().min(1).max(100).default(20)
});

const valideur = Joi.string().trim().max(120).default('Équipe Marché 241');

export const approuverBoostSchema = Joi.object({
  conformite: Joi.array().items(Joi.string().valid(...IDS_CONFORMITE)).required().messages({
    'any.required': 'La checklist de conformité est obligatoire',
    'any.only': 'Élément de conformité inconnu'
  }),
  valide_par: valideur
});

export const refuserBoostSchema = Joi.object({
  note: Joi.string().trim().min(3).max(1000).required().messages({
    'any.required': 'Le motif du refus est obligatoire',
    'string.empty': 'Le motif du refus est obligatoire',
    'string.min': 'Le motif du refus doit contenir au moins 3 caractères'
  }),
  valide_par: valideur
});

export const remboursementBoostSchema = Joi.object({
  note: Joi.string().trim().max(1000).allow(null, ''),
  valide_par: valideur
});

const pack = Joi.object({
  code: Joi.string().trim().pattern(/^[a-z0-9_-]{2,30}$/).required(),
  nom: Joi.string().trim().min(2).max(40).required(),
  total_fcfa: Joi.number().integer().positive().required(),
  duree_jours: Joi.number().integer().min(1).max(60).required()
});

export const parametresBoostSchema = Joi.object({
  commission_bps: Joi.number().integer().min(0).max(10_000),
  commission_min_fcfa: Joi.number().integer().min(0),
  tva_bps: Joi.number().integer().min(0).max(5000),
  total_min_fcfa: Joi.number().integer().min(500),
  total_max_fcfa: Joi.number().integer().min(500),
  duree_min_jours: Joi.number().integer().min(1).max(60),
  duree_max_jours: Joi.number().integer().min(1).max(60),
  packs: Joi.array().items(pack).max(6).unique('code'),
  fx_xaf_par_usd: Joi.number().positive(),
  cpm_min_fcfa: Joi.number().positive(),
  cpm_max_fcfa: Joi.number().positive(),
  budget_jour_min_fcfa: Joi.number().integer().min(0),
  kill_switch: Joi.boolean()
}).min(1).messages({ 'object.min': 'Aucun paramètre à modifier' });
