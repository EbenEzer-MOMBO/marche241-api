import Joi from 'joi';
import { CLES_VILLES, CODES_INTERETS, CODES_PAYS, LOCALES } from '../config/ciblage-boost.config';
import { IDS_CONFORMITE } from '../config/conformite-boost.config';

/**
 * Schémas Joi du boost publicitaire Meta.
 * Chaque champ porte un libellé français (`label`) et chaque schéma exporté passe par `fr()`, qui
 * fournit un message français pour toutes les règles Joi : aucun message anglais par défaut
 * (« must be a valid uri… ») ne doit atteindre le vendeur ou le back-office.
 */

const LIEN_EXEMPLE = 'ex. https://marche241.ga/ma-boutique';

export const MESSAGES_FR_BOOST: Record<string, string> = {
  'any.required': '{#label} est obligatoire',
  'any.only': '{#label} n’est pas une valeur autorisée',
  'any.invalid': '{#label} n’est pas une valeur autorisée',
  'string.base': '{#label} doit être un texte',
  'string.empty': '{#label} ne peut pas être vide',
  'string.min': '{#label} doit contenir au moins {#limit} caractères',
  'string.max': '{#label} ne doit pas dépasser {#limit} caractères',
  'string.uri': `{#label} doit être une adresse web complète (${LIEN_EXEMPLE})`,
  'string.uriCustomScheme': `{#label} doit être une adresse web commençant par http:// ou https:// (${LIEN_EXEMPLE})`,
  'string.pattern.base': '{#label} n’a pas le bon format',
  'string.email': '{#label} doit être une adresse e-mail valide',
  'number.base': '{#label} doit être un nombre',
  'number.integer': '{#label} doit être un nombre entier',
  'number.positive': '{#label} doit être supérieur à 0',
  'number.min': '{#label} doit être au moins {#limit}',
  'number.max': '{#label} ne doit pas dépasser {#limit}',
  'number.unsafe': '{#label} est trop grand',
  'array.base': '{#label} doit être une liste',
  'array.min': '{#label} : au moins {#limit} choix requis',
  'array.max': '{#label} : {#limit} choix maximum',
  'array.unique': '{#label} contient un doublon',
  'array.sparse': '{#label} contient une valeur vide',
  'boolean.base': '{#label} doit être vrai ou faux',
  'object.base': '{#label} est invalide',
  'object.min': 'Aucune donnée à modifier',
  'object.unknown': '{#label} n’est pas un champ autorisé'
};

/** Messages français + libellés non entourés de guillemets. */
const fr = <T extends Joi.Schema>(schema: T): T =>
  schema.prefs({ messages: MESSAGES_FR_BOOST, errors: { wrap: { label: false } } }) as T;

const id = (libelle: string) =>
  Joi.number().integer().positive().label(libelle).messages({
    'number.base': `${libelle} doit être un nombre`,
    'number.integer': `${libelle} doit être un entier`,
    'number.positive': `${libelle} doit être positif`,
    'any.required': `${libelle} est obligatoire`
  });

const lienWeb = (libelle: string) =>
  Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(2000).label(libelle);

export const boostIdParamSchema = fr(Joi.object({ id: id("L'ID du boost").required() }));
export const boutiqueIdParamSchema = fr(Joi.object({ boutiqueId: id("L'ID de la boutique").required() }));

const ciblageObjet = Joi.object({
  pays: Joi.array().items(Joi.string().valid(...CODES_PAYS).label('Le pays')).max(8).label('Les pays').messages({
    'any.only': 'Pays non proposé au ciblage'
  }),
  villes: Joi.array().items(Joi.string().valid(...CLES_VILLES).label('La ville')).max(8).label('Les villes').messages({
    'any.only': 'Ville non proposée au ciblage'
  }),
  age_min: Joi.number().integer().min(18).max(65).label("L'âge minimum").messages({
    'number.min': "L'âge minimum est 18 ans",
    'number.max': "L'âge maximum est 65 ans"
  }),
  age_max: Joi.number().integer().min(18).max(65).label("L'âge maximum").messages({
    'number.min': "L'âge minimum est 18 ans",
    'number.max': "L'âge maximum est 65 ans"
  }),
  sexes: Joi.array().items(Joi.string().valid('homme', 'femme').label('Le sexe')).max(2).label('Les sexes'),
  langues: Joi.array().items(Joi.string().valid(...LOCALES).label('La langue')).max(2).label('Les langues'),
  interets: Joi.array().items(Joi.string().valid(...CODES_INTERETS).label("Le centre d'intérêt")).max(10).label("Les centres d'intérêt").messages({
    'array.max': 'Maximum 10 centres d’intérêt',
    'any.only': 'Centre d’intérêt non proposé'
  }),
  etape_wizard: Joi.number().integer().min(0).max(4).label("L'étape du formulaire")
}).label('Le ciblage');

export const ciblageSchema = fr(ciblageObjet);

const champsBrouillon = {
  type_cible: Joi.string().valid('boutique', 'produit').label('La cible').messages({
    'any.only': 'La cible doit être la boutique ou un produit'
  }),
  produit_id: id("L'ID du produit").allow(null),
  objectif: Joi.string().valid('trafic', 'whatsapp', 'notoriete').label("L'objectif").messages({
    'any.only': "L'objectif doit être Visites, Messages WhatsApp ou Visibilité"
  }),
  nom: Joi.string().trim().max(120).allow('').label('Le nom'),
  total_fcfa: Joi.number().integer().min(0).max(10_000_000).label('Le montant').messages({
    'number.base': 'Le montant doit être un nombre',
    'number.integer': 'Le montant doit être un nombre entier de FCFA',
    'number.max': 'Le montant ne doit pas dépasser 10 000 000 FCFA'
  }),
  duree_jours: Joi.number().integer().min(1).max(60).label('La durée').messages({
    'number.base': 'La durée doit être un nombre de jours',
    'number.min': 'La durée doit être d’au moins 1 jour',
    'number.max': 'La durée ne doit pas dépasser 60 jours'
  }),
  ciblage: ciblageObjet,
  url_destination: lienWeb('Le lien de destination').allow(null, ''),
  whatsapp_e164: Joi.string().trim().pattern(/^\+[1-9]\d{7,14}$/).allow(null, '').label('Le numéro WhatsApp').messages({
    'string.pattern.base': 'Le numéro WhatsApp doit être au format international (ex. +24177000000)'
  }),
  titre: Joi.string().trim().max(80).allow(null, '').label('Le titre'),
  texte_principal: Joi.string().trim().max(500).allow(null, '').label('Le texte de la publicité'),
  description: Joi.string().trim().max(200).allow(null, '').label('La description'),
  image_url: lienWeb('Le visuel').allow(null, '').messages({
    'string.uri': "Le visuel doit être une adresse d'image valide",
    'string.uriCustomScheme': "Le visuel doit être une adresse d'image commençant par http:// ou https://"
  })
};

export const creerBoostSchema = fr(
  Joi.object({
    boutique_id: id("L'ID de la boutique").required(),
    ...champsBrouillon
  })
);

export const modifierBoostSchema = fr(
  Joi.object(champsBrouillon).min(1).messages({
    'object.min': 'Aucune donnée à modifier'
  })
);

export const prefillQuerySchema = fr(
  Joi.object({
    boutique_id: id("L'ID de la boutique").required(),
    produit_id: id("L'ID du produit").optional()
  })
);

export const devisSchema = fr(
  Joi.object({
    total_fcfa: Joi.number().integer().positive().required().label('Le montant').messages({
      'any.required': 'Le montant est obligatoire',
      'number.base': 'Le montant doit être un nombre'
    }),
    duree_jours: Joi.number().integer().min(1).max(60).default(7).label('La durée')
  })
);

export const estimationAudienceSchema = fr(Joi.object({ ciblage: ciblageObjet.required() }));

export const estimationImpressionsSchema = fr(
  Joi.object({
    totaux_fcfa: Joi.array().items(Joi.number().integer().positive().label('Le montant')).min(1).max(10).required().label('Les montants').messages({
      'any.required': 'Au moins un montant est requis'
    }),
    duree_jours: Joi.number().integer().min(1).max(60).required().label('La durée')
  })
);

export const paiementBoostSchema = fr(
  Joi.object({
    mode: Joi.string().valid('mobile', 'carte').required().label('Le mode de paiement').messages({
      'any.only': 'Le mode de paiement doit être mobile money ou carte bancaire',
      'any.required': 'Le mode de paiement est obligatoire'
    }),
    operateur: Joi.string().valid('airtelmoney', 'moovmoney').when('mode', { is: 'mobile', then: Joi.required() }).label("L'opérateur").messages({
      'any.only': "L'opérateur doit être Airtel Money ou Moov Money",
      'any.required': "L'opérateur mobile money est obligatoire"
    }),
    msisdn: Joi.string().trim().pattern(/^\d{8,15}$/).when('mode', { is: 'mobile', then: Joi.required() }).label('Le numéro de téléphone').messages({
      'string.pattern.base': 'Le numéro de téléphone doit contenir 8 à 15 chiffres',
      'any.required': 'Le numéro de téléphone est obligatoire'
    }),
    return_url: lienWeb("L'URL de retour").when('mode', { is: 'carte', then: Joi.required() }).messages({
      'any.required': "L'URL de retour est obligatoire pour le paiement par carte"
    }),
    email: Joi.string().email().allow(null, '').label("L'adresse e-mail").messages({ 'string.email': "L'adresse e-mail est invalide" }),
    nom: Joi.string().trim().max(100).allow(null, '').label('Le nom')
  })
);

// --- Admin ---------------------------------------------------------------

export const listeAdminQuerySchema = fr(
  Joi.object({
    statut: Joi.string()
      .valid('brouillon', 'en_attente_paiement', 'en_attente_validation', 'refuse', 'actif', 'en_pause', 'termine', 'rejete_meta', 'erreur')
      .label('Le statut'),
    statut_remboursement: Joi.string().valid('aucun', 'a_rembourser', 'rembourse').label('Le statut de remboursement'),
    boutique_id: Joi.number().integer().positive().label("L'ID de la boutique"),
    recherche: Joi.string().trim().max(100).allow('').label('La recherche'),
    page: Joi.number().integer().min(1).default(1).label('La page'),
    limite: Joi.number().integer().min(1).max(100).default(20).label('La limite')
  })
);

const valideur = Joi.string().trim().max(120).default('Équipe Marché 241').label('Le nom du valideur');

export const approuverBoostSchema = fr(
  Joi.object({
    conformite: Joi.array().items(Joi.string().valid(...IDS_CONFORMITE).label('Le point de conformité')).required().label('La checklist de conformité').messages({
      'any.required': 'La checklist de conformité est obligatoire',
      'any.only': 'Élément de conformité inconnu'
    }),
    valide_par: valideur
  })
);

export const refuserBoostSchema = fr(
  Joi.object({
    note: Joi.string().trim().min(3).max(1000).required().label('Le motif du refus').messages({
      'any.required': 'Le motif du refus est obligatoire',
      'string.empty': 'Le motif du refus est obligatoire',
      'string.min': 'Le motif du refus doit contenir au moins 3 caractères'
    }),
    valide_par: valideur
  })
);

export const remboursementBoostSchema = fr(
  Joi.object({
    note: Joi.string().trim().max(1000).allow(null, '').label('La note'),
    valide_par: valideur
  })
);

const pack = Joi.object({
  code: Joi.string().trim().pattern(/^[a-z0-9_-]{2,30}$/).required().label('Le code du pack').messages({
    'string.pattern.base': 'Le code du pack doit contenir 2 à 30 caractères (minuscules, chiffres, - ou _)'
  }),
  nom: Joi.string().trim().min(2).max(40).required().label('Le nom du pack'),
  total_fcfa: Joi.number().integer().positive().required().label('Le prix du pack'),
  duree_jours: Joi.number().integer().min(1).max(60).required().label('La durée du pack').messages({
    'number.min': 'La durée du pack doit être d’au moins 1 jour',
    'number.max': 'La durée du pack ne doit pas dépasser 60 jours'
  })
}).label('Le pack');

export const parametresBoostSchema = fr(
  Joi.object({
    commission_bps: Joi.number().integer().min(0).max(10_000).label('La commission'),
    commission_min_fcfa: Joi.number().integer().min(0).label('La commission minimum'),
    tva_bps: Joi.number().integer().min(0).max(5000).label('La TVA'),
    frais_encaissement_bps: Joi.number().integer().min(0).max(1000).label("Les frais d'encaissement"),
    total_min_fcfa: Joi.number().integer().min(500).label('Le montant minimum'),
    total_max_fcfa: Joi.number().integer().min(500).label('Le montant maximum'),
    duree_min_jours: Joi.number().integer().min(1).max(60).label('La durée minimum'),
    duree_max_jours: Joi.number().integer().min(1).max(60).label('La durée maximum'),
    packs: Joi.array().items(pack).max(6).unique('code').label('Les packs').messages({
      'array.unique': 'Deux packs ont le même code'
    }),
    fx_xaf_par_usd: Joi.number().positive().label('Le taux FCFA / USD'),
    cpm_min_fcfa: Joi.number().positive().label('Le CPM minimum'),
    cpm_max_fcfa: Joi.number().positive().label('Le CPM maximum'),
    budget_jour_min_fcfa: Joi.number().integer().min(0).label('Le budget minimum par jour'),
    kill_switch: Joi.boolean().label('Le kill switch')
  })
    .min(1)
    .messages({ 'object.min': 'Aucun paramètre à modifier' })
);

const idMeta = (libelle: string) =>
  Joi.string().trim().pattern(/^(act_)?\d{3,30}$/).required().label(libelle).messages({
    'any.required': `${libelle} est obligatoire`,
    'string.empty': `${libelle} est obligatoire`,
    'string.pattern.base': `${libelle} est invalide`
  });

export const connexionMetaSchema = fr(
  Joi.object({
    ad_account_id: idMeta('Le compte publicitaire'),
    page_id: idMeta('La Page Facebook'),
    modifie_par: valideur
  })
);
