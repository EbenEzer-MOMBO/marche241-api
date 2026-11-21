/**
 * Prix d'une ligne de commande recalculé côté serveur.
 * Le prix envoyé par le client n'est jamais fiable : il est remplacé à la création de la commande
 * par le prix effectif du variant choisi (promo valide comprise) ou du produit, plus les suppléments
 * de personnalisation définis sur le produit.
 */

import { promoValide } from './prix-promo';

interface ProduitTarifable {
  prix?: number | string | null;
  variants?: unknown;
}

export type PrixSelection =
  | {
      ok: true;
      /** Prix effectif du variant (ou du produit), sans suppléments : à stocker dans `variant.prix`. */
      prixBase: number;
      /** Prix par unité facturé : base + suppléments de personnalisation. */
      prixUnitaire: number;
    }
  | { ok: false; raison: string };

const nombreValide = (valeur: unknown): number | null => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Prix effectif d'un variant ou d'un billet : le promo s'il est valide (0 < promo < prix), sinon le prix normal. */
const prixEffectifVariant = (variant: any): number | null =>
  promoValide(variant?.prix, variant?.prix_promo) ? Number(variant.prix_promo) : nombreValide(variant?.prix);

const variantsDuProduit = (produit: ProduitTarifable): any[] => {
  const donnees = produit.variants as any;
  return donnees && Array.isArray(donnees.variants) ? donnees.variants : [];
};

/** Variant du produit correspondant à la sélection (id d'abord, puis nom), ou `null`. */
function trouverVariant(variants: any[], variantsSelectionnes: any): any | null {
  const choisi = variantsSelectionnes?.variant;
  if (!choisi || typeof choisi !== 'object') return null;
  return (
    (choisi.id && variants.find((v: any) => v.id === choisi.id)) ||
    variants.find((v: any) => v.nom && v.nom === choisi.nom) ||
    null
  );
}

/** Supplément par unité : somme des définitions du produit pour les personnalisations choisies. */
function supplementPersonnalisations(produit: ProduitTarifable, variantsSelectionnes: any): number {
  const choisies = variantsSelectionnes?.personnalisations;
  const definitions = (produit.variants as any)?.personnalisations;
  if (!Array.isArray(choisies) || !Array.isArray(definitions)) return 0;

  const dejaComptees = new Set<string>();
  let somme = 0;
  for (const choix of choisies) {
    if (!choix?.id || dejaComptees.has(choix.id)) continue;
    const definition = definitions.find((d: any) => d.id === choix.id);
    if (!definition) continue;
    dejaComptees.add(choix.id);
    somme += nombreValide(definition.prix_supplementaire) ?? 0;
  }
  return somme;
}

/**
 * Prix de référence pour la sélection d'un client.
 * Un produit qui a des variants exige un variant reconnu : sans cela, le client choisirait le prix de base.
 */
export function prixSelectionServeur(produit: ProduitTarifable, variantsSelectionnes: any): PrixSelection {
  const variants = variantsDuProduit(produit);
  let base: number;

  if (variants.length > 0) {
    const variant = trouverVariant(variants, variantsSelectionnes);
    if (!variant) return { ok: false, raison: 'Variant invalide ou manquant' };
    // Variant reconnu mais sans prix propre (attribut générique) : prix du produit
    base = prixEffectifVariant(variant) ?? nombreValide(produit.prix) ?? 0;
  } else {
    base = nombreValide(produit.prix) ?? 0;
  }

  return {
    ok: true,
    prixBase: Math.round(base),
    prixUnitaire: Math.round(base + supplementPersonnalisations(produit, variantsSelectionnes))
  };
}
