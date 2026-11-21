/**
 * Prix d'une ligne de commande recalculé côté serveur.
 * Le prix envoyé par le client n'est jamais fiable : il est remplacé à la création de la commande
 * par le prix du produit (ou du variant choisi) plus les suppléments de personnalisation du produit.
 */

interface ProduitTarifable {
  prix?: number | string | null;
  variants?: unknown;
}

const nombreValide = (valeur: unknown): number | null => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Number(valeur);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Variant du produit correspondant à la sélection (id d'abord, puis nom), ou `null`. */
function trouverVariant(produit: ProduitTarifable, variantsSelectionnes: any): any | null {
  const donnees = produit.variants as any;
  const choisi = variantsSelectionnes?.variant;
  if (!choisi || !donnees || !Array.isArray(donnees.variants)) return null;
  return (
    (choisi.id && donnees.variants.find((v: any) => v.id === choisi.id)) ||
    donnees.variants.find((v: any) => v.nom && v.nom === choisi.nom) ||
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

/** Prix unitaire de référence (FCFA, entier) pour la sélection d'un client. */
export function prixUnitaireServeur(produit: ProduitTarifable, variantsSelectionnes: any): number {
  const variant = trouverVariant(produit, variantsSelectionnes);
  const base = nombreValide(variant?.prix) ?? nombreValide(produit.prix) ?? 0;
  return Math.round(base + supplementPersonnalisations(produit, variantsSelectionnes));
}
