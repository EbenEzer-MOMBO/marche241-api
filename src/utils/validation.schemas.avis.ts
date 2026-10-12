import Joi from 'joi';
import { MESSAGES_FR_BOOST } from './validation.schemas.boost';

/**
 * Schémas Joi des avis produits vérifiés.
 * Mêmes conventions que le boost : libellés français et messages français pour toutes les règles.
 * La longueur effective du commentaire (paramètre `longueur_max_commentaire`) est contrôlée dans le contrôleur ;
 * le plafond ci-dessous (2 000) correspond à la contrainte de la base.
 */

const fr = <T extends Joi.Schema>(schema: T): T =>
  schema.prefs({ messages: MESSAGES_FR_BOOST, errors: { wrap: { label: false } } }) as T;

const id = (libelle: string) =>
  Joi.number().integer().positive().label(libelle).messages({
    'number.base': `${libelle} doit être un nombre`,
    'number.integer': `${libelle} doit être un entier`,
    'number.positive': `${libelle} doit être positif`,
    'any.required': `${libelle} est obligatoire`
  });

const STATUTS = ['en_attente', 'approuve', 'rejete'];

export const jetonAvisParamSchema = fr(
  Joi.object({
    jeton: Joi.string().trim().max(64).required().label('Le lien')
  })
);

export const avisIdParamSchema = fr(Joi.object({ id: id("L'ID de l'avis").required() }));
export const produitIdParamSchema = fr(Joi.object({ produitId: id("L'ID du produit").required() }));

export const soumettreAvisSchema = fr(
  Joi.object({
    avis: Joi.array()
      .items(
        Joi.object({
          produit_id: id("L'ID du produit").required(),
          note: Joi.number().integer().min(1).max(5).required().label('La note').messages({
            'number.min': 'La note doit être comprise entre 1 et 5',
            'number.max': 'La note doit être comprise entre 1 et 5'
          }),
          commentaire: Joi.string().allow('', null).max(2000).label('Le commentaire')
        })
      )
      .min(1)
      .max(20)
      .unique('produit_id')
      .required()
      .label('Les avis'),
    // Anti-robots : champ invisible (doit rester vide) et durée de remplissage
    site_web: Joi.string().allow('', null).max(500).label('Le champ site_web'),
    rempli_en_ms: Joi.number().integer().min(0).max(86_400_000).label('La durée de remplissage'),
    turnstileToken: Joi.string().allow('', null).max(4096).label('Le jeton de sécurité')
  })
);

export const listePublicsQuerySchema = fr(
  Joi.object({
    page: Joi.number().integer().min(1).max(1000).default(1).label('La page'),
    limite: Joi.number().integer().min(1).max(50).default(10).label('La limite')
  })
);

export const listeAvisQuerySchema = fr(
  Joi.object({
    statut: Joi.string().valid(...STATUTS).label('Le statut'),
    signales: Joi.boolean().label('Le filtre signalés'),
    boutique_id: id("L'ID de la boutique"),
    produit_id: id("L'ID du produit"),
    note: Joi.number().integer().min(1).max(5).label('La note'),
    sans_reponse: Joi.boolean().label('Le filtre sans réponse'),
    recherche: Joi.string().trim().max(100).allow('').label('La recherche'),
    page: Joi.number().integer().min(1).max(10000).default(1).label('La page'),
    limite: Joi.number().integer().min(1).max(100).default(20).label('La limite')
  })
);

export const repondreAvisSchema = fr(
  Joi.object({
    reponse: Joi.string().trim().min(2).max(1000).required().label('La réponse')
  })
);

export const signalerAvisSchema = fr(
  Joi.object({
    motif: Joi.string().trim().min(5).max(500).required().label('Le motif')
  })
);

export const approuverAvisSchema = fr(
  Joi.object({
    modere_par: Joi.string().trim().max(255).allow('', null).label('Le modérateur')
  })
);

export const rejeterAvisSchema = fr(
  Joi.object({
    motif: Joi.string().trim().min(3).max(500).required().label('Le motif du rejet'),
    modere_par: Joi.string().trim().max(255).allow('', null).label('Le modérateur')
  })
);

export const approuverEnMasseSchema = fr(
  Joi.object({
    ids: Joi.array().items(id("L'ID de l'avis")).min(1).max(100).unique().required().label('Les avis'),
    modere_par: Joi.string().trim().max(255).allow('', null).label('Le modérateur')
  })
);

export const parametresAvisSchema = fr(
  Joi.object({
    actif: Joi.boolean().label('Le module avis'),
    delai_invitation_jours: Joi.number().integer().min(0).max(60).label("Le délai d'invitation"),
    relance_jours: Joi.number().integer().min(0).max(60).label('Le délai de relance'),
    validite_jeton_jours: Joi.number().integer().min(1).max(180).label('La validité du lien'),
    auto_approbation: Joi.string().valid('aucune', 'positifs_sans_texte_suspect').label("L'auto-approbation"),
    seuil_affichage_note: Joi.number().integer().min(1).max(50).label("Le seuil d'affichage de la note"),
    mots_interdits: Joi.array().items(Joi.string().trim().min(2).max(50)).max(500).unique().label('Les mots interdits'),
    longueur_max_commentaire: Joi.number().integer().min(100).max(2000).label('La longueur maximale du commentaire')
  }).min(1)
);
