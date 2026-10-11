import Joi from 'joi';

/**
 * Prix et promotion d'un produit.
 *
 * Contrat d'entrée de l'API : `prix` = prix normal, `prix_promo` = prix promotionnel (optionnel).
 * Stockage en base : `produits.prix` = prix actif (le promo s'il y en a un), `produits.prix_original` = prix normal
 * (renseigné uniquement pendant une promotion, toujours strictement supérieur à `prix`).
 */

export interface PrixStockes {
  prix: number;
  prix_original: number | null;
}

/** Une promotion n'est valide que si 0 < prix_promo < prix normal. */
export const promoValide = (prixNormal: unknown, prixPromo: unknown): boolean => {
  const normal = Number(prixNormal);
  const promo = Number(prixPromo);
  return Number.isFinite(normal) && Number.isFinite(promo) && promo > 0 && promo < normal;
};

/**
 * Convertit (prix normal, prix promo) du contrat d'entrée en colonnes stockées.
 * Une promo absente, nulle ou >= au prix normal est neutralisée (aucune promotion).
 */
export const prixPourStockage = (prixNormal: number, prixPromo?: number | null): PrixStockes =>
  promoValide(prixNormal, prixPromo)
    ? { prix: Number(prixPromo), prix_original: Number(prixNormal) }
    : { prix: Number(prixNormal), prix_original: null };

/** Un prix_original n'a de sens que s'il est strictement supérieur au prix actif. */
export const prixOriginalCoherent = (
  prixActif: unknown,
  prixOriginal: unknown
): number | null => {
  if (prixOriginal === null || prixOriginal === undefined || prixOriginal === '') return null;
  return Number(prixOriginal) > Number(prixActif) ? Number(prixOriginal) : null;
};

/**
 * Champ Joi `prix_promo` : 0 ou null = pas de promotion ; si `prix` est fourni dans la même requête,
 * la promo doit lui être strictement inférieure (sinon erreur 400 par champ).
 * Sans `prix` (mise à jour partielle), le modèle compare au prix normal en base et neutralise une promo invalide.
 */
export const prixPromoJoi = Joi.number()
  .min(0)
  .optional()
  .allow(null)
  .when('prix', {
    is: Joi.number().exist(),
    then: Joi.number()
      .min(0)
      .allow(null)
      .custom((value, helpers) => {
        const prix = helpers.state.ancestors[0].prix;
        return value > 0 && value >= prix ? helpers.error('number.promoTropElevee') : value;
      })
  })
  .messages({
    'number.min': 'Le prix promotionnel doit être positif',
    'number.promoTropElevee': 'Le prix promotionnel doit être inférieur au prix normal'
  });
