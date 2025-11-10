import Joi from 'joi';

// Schémas de validation pour les vendeurs
export const createVendeurSchema = Joi.object({
  telephone: Joi.string().required().pattern(/^\+?[0-9]{8,15}$/).messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)',
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
  })
});

export const demandeCodeSchema = Joi.object({
  email: Joi.string().email().messages({
    'string.email': 'L\'adresse email n\'est pas valide'
  }),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).messages({
    'string.pattern.base': 'Le numéro de téléphone n\'est pas valide'
  })
}).or('email', 'phone').messages({
  'object.missing': 'L\'adresse email ou le numéro de téléphone est obligatoire'
});

export const verificationCodeSchema = Joi.object({
  email: Joi.string().email().messages({
    'string.email': 'L\'adresse email n\'est pas valide'
  }),
  phone: Joi.string().pattern(/^\+?[0-9]{10,15}$/).messages({
    'string.pattern.base': 'Le numéro de téléphone n\'est pas valide'
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
  slug: Joi.string().min(2).max(100).pattern(/^[a-z0-9-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets'
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
  couleur_primaire: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null, '').messages({
    'string.pattern.base': 'La couleur primaire doit être au format hexadécimal (#RRGGBB)'
  }),
  couleur_secondaire: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).allow(null, '').messages({
    'string.pattern.base': 'La couleur secondaire doit être au format hexadécimal (#RRGGBB)'
  }),
  adresse: Joi.string().allow(null, '').messages({
    'string.base': 'L\'adresse doit être une chaîne de caractères'
  }),
  telephone: Joi.string().allow(null, '').pattern(/^\+?[0-9]{8,15}$/).messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)'
  })
});

export const updateBoutiqueSchema = Joi.object({
  nom: Joi.string().min(2).max(100).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères'
  }),
  slug: Joi.string().min(2).max(100).pattern(/^[a-z0-9-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets'
  }),
  description: Joi.string().allow(null, '').messages({
    'string.base': 'La description doit être une chaîne de caractères'
  }),
  logo: Joi.string().allow(null, '').max(255).messages({
    'string.max': 'L\'URL du logo ne doit pas dépasser {#limit} caractères'
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
  telephone: Joi.string().allow(null, '').pattern(/^\+?[0-9]{8,15}$/).messages({
    'string.pattern.base': 'Le numéro de téléphone doit être au format international (8-15 chiffres)'
  })
});

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
