import Joi from 'joi';
import { MESSAGES_FR_BOOST } from './validation.schemas.boost';

/**
 * Schémas Joi de la publicité interne (bannières sponsorisées).
 * Mêmes conventions que le boost : libellés français et messages français pour toutes les règles.
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

const FORMULES = ['categorie', 'accueil', 'premium'];
const STATUTS = ['brouillon', 'en_attente_paiement', 'en_attente_validation', 'refusee', 'programmee', 'active', 'terminee', 'annulee'];
export const PAGES_PUBLICITE = ['accueil', 'produits', 'categorie', 'evenements', 'boutiques', 'autre'];

const formule = Joi.string().valid(...FORMULES).label('La formule').messages({
  'any.only': 'La formule doit être Catégorie, Accueil ou Premium'
});

const semaine = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).label('La première semaine').messages({
  'string.pattern.base': 'La première semaine doit être une date au format AAAA-MM-JJ'
});

const nbSemaines = Joi.number().integer().min(1).max(52).label('Le nombre de semaines').messages({
  'number.min': 'Choisissez au moins une semaine'
});

const image = (libelle: string) => Joi.string().trim().uri({ scheme: ['https', 'http'] }).max(2000).label(libelle);

export const publiciteIdParamSchema = fr(Joi.object({ id: id("L'ID de la publicité").required() }));
export const boutiqueIdParamSchema = fr(Joi.object({ boutiqueId: id("L'ID de la boutique").required() }));

export const parametresQuerySchema = fr(Joi.object({ boutique_id: id("L'ID de la boutique") }));

export const disponibilitesQuerySchema = fr(
  Joi.object({
    formule: formule.required(),
    categorie_id: id("L'ID de la catégorie").when('formule', { is: 'categorie', then: Joi.required() }),
    semaines: Joi.number().integer().min(1).max(52).label('Le nombre de semaines affichées'),
    exclure_id: id("L'ID de la publicité à exclure"),
    semaine_en_cours: Joi.boolean().default(false).label('La semaine en cours')
  })
);

export const devisPubliciteSchema = fr(
  Joi.object({
    formule: formule.required(),
    nb_semaines: nbSemaines.required()
  })
);

const champsBrouillon = {
  formule,
  categorie_id: id("L'ID de la catégorie").allow(null),
  semaine_debut: semaine.allow(null),
  nb_semaines: nbSemaines,
  image_url: image('Le visuel').allow(null, ''),
  image_mobile_url: image('Le visuel mobile').allow(null, ''),
  texte_alternatif: Joi.string().trim().max(140).allow(null, '').label('Le texte alternatif'),
  cible_type: Joi.string().valid('boutique', 'produit').label('La destination').messages({
    'any.only': 'La destination doit être la boutique ou un produit'
  }),
  produit_id: id("L'ID du produit").allow(null)
};

export const creerPubliciteSchema = fr(
  Joi.object({
    boutique_id: id("L'ID de la boutique").required(),
    ...champsBrouillon
  })
);

export const modifierPubliciteSchema = fr(Joi.object(champsBrouillon).min(1));

export const paiementPubliciteSchema = fr(
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
    return_url: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(2000).when('mode', { is: 'carte', then: Joi.required() }).label("L'URL de retour")
  })
);

// ---------------------------------------------------------------- Public

export const diffusionQuerySchema = fr(
  Joi.object({
    page: Joi.string().valid(...PAGES_PUBLICITE).default('autre').label('La page'),
    categorie_id: id("L'ID de la catégorie")
  })
);

export const interactionSchema = fr(
  Joi.object({ page: Joi.string().valid(...PAGES_PUBLICITE).default('autre').label('La page') })
);

export const clicQuerySchema = interactionSchema;

// ---------------------------------------------------------------- Back-office

const valideur = Joi.string().trim().max(120).default('Équipe Marché 241').label('Le nom du valideur');

export const listeAdminPubliciteQuerySchema = fr(
  Joi.object({
    statut: Joi.string().valid(...STATUTS).label('Le statut'),
    type_annonceur: Joi.string().valid('vendeur', 'externe').label("Le type d'annonceur"),
    formule,
    statut_remboursement: Joi.string().valid('aucun', 'a_rembourser', 'rembourse').label('Le statut de remboursement'),
    recherche: Joi.string().trim().max(100).allow('').label('La recherche'),
    page: Joi.number().integer().min(1).default(1).label('La page'),
    limite: Joi.number().integer().min(1).max(100).default(20).label('La limite')
  })
);

export const planningQuerySchema = fr(
  Joi.object({
    debut: semaine.label('La première semaine'),
    semaines: Joi.number().integer().min(1).max(26).default(8).label('Le nombre de semaines')
  })
);

export const creerExterneSchema = fr(
  Joi.object({
    annonceur_nom: Joi.string().trim().min(2).max(120).required().label("Le nom de l'annonceur"),
    annonceur_contact: Joi.string().trim().max(160).allow(null, '').label('Le contact'),
    formule: formule.required(),
    categorie_id: id("L'ID de la catégorie").when('formule', { is: 'categorie', then: Joi.required(), otherwise: Joi.allow(null) }),
    semaine_debut: semaine.required(),
    nb_semaines: nbSemaines.required(),
    image_url: image('Le visuel').required(),
    image_mobile_url: image('Le visuel mobile').allow(null, ''),
    texte_alternatif: Joi.string().trim().max(140).allow(null, '').label('Le texte alternatif'),
    url_destination: Joi.string().trim().max(2000).required().label('Le lien de destination'),
    mode_paiement: Joi.string().valid('hors_plateforme', 'offert').required().label('Le mode de paiement').messages({
      'any.only': 'Le mode de paiement doit être « payé hors plateforme » ou « offert »'
    }),
    total_fcfa: Joi.number().integer().min(0).max(10_000_000).allow(null).label('Le montant encaissé'),
    reference_paiement_externe: Joi.string().trim().max(120).allow(null, '').label('La référence du paiement'),
    valide_par: valideur
  })
);

export const actionAdminSchema = fr(Joi.object({ valide_par: valideur }));

export const refuserPubliciteSchema = fr(
  Joi.object({
    note: Joi.string().trim().min(3).max(1000).required().label('Le motif').messages({
      'any.required': 'Le motif est obligatoire',
      'string.empty': 'Le motif est obligatoire',
      'string.min': 'Le motif doit contenir au moins 3 caractères'
    }),
    valide_par: valideur
  })
);

export const remboursementPubliciteSchema = fr(
  Joi.object({
    note: Joi.string().trim().max(1000).allow(null, '').label('La note'),
    valide_par: valideur
  })
);

const parFormule = (libelle: string, min: number) =>
  Joi.object({
    categorie: Joi.number().integer().min(min).max(10_000_000).required().label(`${libelle} Catégorie`),
    accueil: Joi.number().integer().min(min).max(10_000_000).required().label(`${libelle} Accueil`),
    premium: Joi.number().integer().min(min).max(10_000_000).required().label(`${libelle} Premium`)
  }).label(libelle);

export const parametresPubliciteSchema = fr(
  Joi.object({
    tarifs: parFormule('Le tarif', 1),
    remise_4_pour_3: Joi.boolean().label('La remise 4 pour 3'),
    semaines_max: Joi.number().integer().min(1).max(52).label('Le nombre maximal de semaines'),
    semaines_avance_max: Joi.number().integer().min(1).max(52).label("L'horizon de réservation"),
    garantie_affichages: parFormule("Le seuil d'affichages", 0),
    eligibilite: Joi.string().valid('verifiees', 'toutes').label("L'éligibilité").messages({
      'any.only': "L'éligibilité doit être « boutiques vérifiées » ou « toutes les boutiques »"
    }),
    frais_encaissement_bps: Joi.number().integer().min(0).max(2000).label("Les frais d'encaissement"),
    delai_paiement_minutes: Joi.number().integer().min(15).max(1440).label('Le délai de paiement'),
    plateforme_active: Joi.boolean().label("L'ouverture aux vendeurs"),
    kill_switch: Joi.boolean().label("L'arrêt d'urgence")
  })
    .min(1)
    .custom((valeur, helpers) => {
      if (valeur.semaines_max && valeur.semaines_avance_max && valeur.semaines_max > valeur.semaines_avance_max) {
        return helpers.message({ custom: 'Le nombre maximal de semaines ne peut pas dépasser l\'horizon de réservation' });
      }
      return valeur;
    })
);
