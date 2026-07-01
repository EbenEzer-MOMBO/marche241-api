import Joi from 'joi';

// Pays supportés par le sélecteur téléphone (voir marche241_v2/src/components/ui/PhoneNumberInput.tsx)
// Chaque entrée : indicatif international + nombre exact de chiffres locaux attendus
const SUPPORTED_PHONE_COUNTRIES: { dialCode: string; length: number }[] = [
  { dialCode: '241', length: 8 }, // Gabon
  { dialCode: '33', length: 9 },  // France
  { dialCode: '237', length: 8 }, // Cameroun
  { dialCode: '225', length: 8 }, // Côte d'Ivoire
  { dialCode: '221', length: 8 }, // Sénégal
  { dialCode: '212', length: 9 }, // Maroc
];

// Numéro international +<indicatif><n chiffres locaux exacts>, ou format local gabonais 0XXXXXXXX
export const PHONE_PATTERN = new RegExp(
  '^(' +
    SUPPORTED_PHONE_COUNTRIES.map((c) => `\\+${c.dialCode}[0-9]{${c.length}}`).join('|') +
    '|0[0-9]{8}' +
  ')$'
);
const PHONE_MESSAGE = 'Le numéro de téléphone doit être valide pour un des pays supportés (Gabon +241, France +33, Cameroun +237, Côte d\'Ivoire +225, Sénégal +221, Maroc +212)';

// Schémas de validation pour les vendeurs
export const createVendeurSchema = Joi.object({
  telephone: Joi.string().required().pattern(PHONE_PATTERN).messages({
    'string.pattern.base': PHONE_MESSAGE,
    'any.required': 'Le numéro de téléphone est obligatoire'
  }),
  nom: Joi.string().required().min(2).max(100).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères',
    'any.required': 'Le nom est obligatoire'
  }),
  email: Joi.string().email().allow(null, '').messages({
    'string.email': 'L\'adresse email doit être valide'
  }),
  ville: Joi.string().allow(null, '').max(100).messages({
    'string.max': 'La ville ne doit pas dépasser {#limit} caractères'
  })
});

export const updateVendeurSchema = Joi.object({
  nom: Joi.string().min(2).max(100).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères'
  }),
  email: Joi.string().email().allow(null, '').messages({
    'string.email': 'L\'adresse email doit être valide'
  }),
  ville: Joi.string().allow(null, '').max(100).messages({
    'string.max': 'La ville ne doit pas dépasser {#limit} caractères'
  }),
  photo_profil: Joi.string().allow(null, '').max(255).messages({
    'string.max': 'L\'URL de la photo de profil ne doit pas dépasser {#limit} caractères'
  }),
  numero_paiement: Joi.string().allow(null, '').max(255).messages({
    'string.max': 'Le numéro de paiement ne doit pas dépasser {#limit} caractères'
  })
});

export const demandeCodeSchema = Joi.object({
  email: Joi.string().email().messages({
    'string.email': 'L\'adresse email n\'est pas valide'
  }),
  phone: Joi.string().pattern(PHONE_PATTERN).messages({
    'string.pattern.base': PHONE_MESSAGE
  })
}).or('email', 'phone').messages({
  'object.missing': 'L\'adresse email ou le numéro de téléphone est obligatoire'
});

export const verificationCodeSchema = Joi.object({
  email: Joi.string().email().messages({
    'string.email': 'L\'adresse email n\'est pas valide'
  }),
  phone: Joi.string().pattern(PHONE_PATTERN).messages({
    'string.pattern.base': PHONE_MESSAGE
  }),
  code: Joi.string().required().pattern(/^[0-9]{4,6}$/).messages({
    'string.pattern.base': 'Le code doit être composé de 4 à 6 chiffres',
    'any.required': 'Le code est obligatoire'
  })
}).or('email', 'phone').messages({
  'object.missing': 'L\'adresse email ou le numéro de téléphone est obligatoire'
});

// Schémas de validation pour les boutiques
export const createBoutiqueSchema = Joi.object({
  nom: Joi.string().required().min(2).max(100).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères',
    'any.required': 'Le nom est obligatoire'
  }),
  slug: Joi.string().min(2).max(100).pattern(/^[a-z0-9_-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres, des tirets et des underscores'
  }),
  description: Joi.string().allow(null, '').messages({
    'string.base': 'La description doit être une chaîne de caractères'
  }),
  vendeur_id: Joi.number().integer().messages({
    'number.base': 'L\'ID du vendeur doit être un nombre',
    'any.required': 'L\'ID du vendeur est obligatoire'
  }),
  logo: Joi.string().allow(null, '').max(255).messages({
    'string.max': 'L\'URL du logo ne doit pas dépasser {#limit} caractères'
  }),
  banniere: Joi.string().allow(null, '').messages({
    'string.base': 'L\'URL de la bannière doit être une chaîne de caractères'
  }),
  couleur_primaire: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null, '').messages({
    'string.pattern.base': 'La couleur primaire doit être au format hexadécimal (#RRGGBB)'
  }),
  couleur_secondaire: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null, '').messages({
    'string.pattern.base': 'La couleur secondaire doit être au format hexadécimal (#RRGGBB)'
  }),
  adresse: Joi.string().allow(null, '').messages({
    'string.base': 'L\'adresse doit être une chaîne de caractères'
  }),
  telephone: Joi.string().allow(null, '').pattern(PHONE_PATTERN).messages({
    'string.pattern.base': PHONE_MESSAGE
  }),
  payment_restriction_mode: Joi.string().valid('complet_uniquement', 'livraison_uniquement', 'les_deux').default('les_deux').messages({
    'any.only': 'Le mode de restriction de paiement doit être complet_uniquement, livraison_uniquement ou les_deux'
  })
});

export const updateBoutiqueSchema = Joi.object({
  nom: Joi.string().min(2).max(100).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères'
  }),
  slug: Joi.string().min(2).max(100).pattern(/^[a-z0-9_-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres, des tirets et des underscores'
  }),
  description: Joi.string().allow(null, '').messages({
    'string.base': 'La description doit être une chaîne de caractères'
  }),
  logo: Joi.string().allow(null, '').max(255).messages({
    'string.max': 'L\'URL du logo ne doit pas dépasser {#limit} caractères'
  }),
  banniere: Joi.string().allow(null, '').messages({
    'string.base': 'L\'URL de la bannière doit être une chaîne de caractères'
  }),
  couleur_primaire: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null, '').messages({
    'string.pattern.base': 'La couleur primaire doit être au format hexadécimal (#RRGGBB)'
  }),
  couleur_secondaire: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null, '').messages({
    'string.pattern.base': 'La couleur secondaire doit être au format hexadécimal (#RRGGBB)'
  }),
  adresse: Joi.string().allow(null, '').messages({
    'string.base': 'L\'adresse doit être une chaîne de caractères'
  }),
  telephone: Joi.string().allow(null, '').pattern(PHONE_PATTERN).messages({
    'string.pattern.base': PHONE_MESSAGE
  }),
  payment_restriction_mode: Joi.string().valid('complet_uniquement', 'livraison_uniquement', 'les_deux').messages({
    'any.only': 'Le mode de restriction de paiement doit être complet_uniquement, livraison_uniquement ou les_deux'
  })
}).unknown(true); // Permettre les champs supplémentaires qui ne sont pas dans le schéma

export const updateBoutiqueStatusSchema = Joi.object({
  statut: Joi.string().required().valid('active', 'inactive', 'en_attente', 'suspendue').messages({
    'any.required': 'Le statut est obligatoire',
    'any.only': 'Le statut doit être l\'un des suivants: active, inactive, en_attente, suspendue'
  })
});

// Schémas pour les paramètres
export const idParamSchema = Joi.object({
  id: Joi.alternatives().try(
    Joi.number().integer(),
    Joi.string().min(2).max(100).pattern(/^[a-z0-9-_]+$/)
  ).required().messages({
    'alternatives.match': 'L\'ID doit être un nombre ou un slug valide',
    'any.required': 'L\'ID est obligatoire'
  })
});

export const slugParamSchema = Joi.object({
  slug: Joi.string().required().messages({
    'any.required': 'Le slug est obligatoire'
  })
});

export const vendeurIdParamSchema = Joi.object({
  vendeurId: Joi.number().integer().required().messages({
    'number.base': 'L\'ID du vendeur doit être un nombre',
    'any.required': 'L\'ID du vendeur est obligatoire'
  })
});

export const boutiqueIdParamSchema = Joi.object({
  boutiqueId: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la boutique doit être un nombre',
    'any.required': 'L\'ID de la boutique est obligatoire'
  })
});

// Schémas pour les paramètres de requête (pagination)
export const paginationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    'number.base': 'La page doit être un nombre',
    'number.min': 'La page doit être supérieure ou égale à {#limit}'
  }),
  limite: Joi.number().integer().min(1).max(100).default(10).messages({
    'number.base': 'La limite doit être un nombre',
    'number.min': 'La limite doit être supérieure ou égale à {#limit}',
    'number.max': 'La limite doit être inférieure ou égale à {#limit}'
  }),
  tri_par: Joi.string().messages({
    'string.base': 'Le champ de tri doit être une chaîne de caractères'
  }),
  ordre: Joi.string().valid('ASC', 'DESC').default('DESC').messages({
    'any.only': 'L\'ordre doit être ASC ou DESC'
  })
});

// Schémas de validation pour le panier
export const sessionIdParamSchema = Joi.object({
  sessionId: Joi.string().required().messages({
    'any.required': 'L\'ID de session est obligatoire'
  })
});

export const addToCartSchema = Joi.object({
  session_id: Joi.string().required().messages({
    'any.required': 'L\'ID de session est obligatoire'
  }),
  boutique_id: Joi.number().integer().required().messages({
    'number.base': 'L\'ID de la boutique doit être un nombre',
    'any.required': 'L\'ID de la boutique est obligatoire'
  }),
  produit_id: Joi.number().integer().required().messages({
    'number.base': 'L\'ID du produit doit être un nombre',
    'any.required': 'L\'ID du produit est obligatoire'
  }),
  quantite: Joi.number().integer().min(1).required().messages({
    'number.base': 'La quantité doit être un nombre',
    'number.min': 'La quantité doit être supérieure ou égale à {#limit}',
    'any.required': 'La quantité est obligatoire'
  }),
  variants_selectionnes: Joi.object().allow(null)
});

export const updateCartQuantitySchema = Joi.object({
  quantite: Joi.number().integer().min(1).required().messages({
    'number.base': 'La quantité doit être un nombre',
    'number.min': 'La quantité doit être supérieure ou égale à {#limit}',
    'any.required': 'La quantité est obligatoire'
  })
});

export const updateCartVariantsSchema = Joi.object({
  variants_selectionnes: Joi.object().required().messages({
    'any.required': 'Les variants sélectionnés sont obligatoires'
  })
});
