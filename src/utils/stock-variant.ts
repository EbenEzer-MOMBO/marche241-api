/**
 * Stock disponible pour la sélection d'un client (produit + variant choisi).
 * Doit rester cohérent avec la décrémentation de `ProduitModel.updateStockWithVariants` :
 * ce qui est accepté à la commande doit pouvoir être décrémenté au paiement.
 */

interface ProduitStockable {
  quantite_stock?: number | null;
  variants?: unknown;
}

/**
 * Extrait la taille ou pointure du nom du variant ("Marron - Taille XL" => "XL").
 * Partagée avec ProduitModel : contrôle à la commande et décrémentation doivent lire le même nom.
 */
export function extraireTaille(nomVariant: string | undefined | null): string | null {
  if (!nomVariant) return null;
  for (const separateur of [' - Taille ', ' - Pointure ']) {
    if (nomVariant.includes(separateur)) {
      return nomVariant.split(separateur)[1]?.trim() || null;
    }
  }
  return null;
}

/** Stock propre au variant sélectionné, ou `null` s'il n'est pas déterminable. */
function stockDuVariant(variantsData: any, selection: any): number | null {
  const variants: any[] = variantsData.variants;
  const choisi = selection.variant;
  const variant =
    (choisi?.id && variants.find((v) => v.id === choisi.id)) ||
    variants.find((v) => v.nom === choisi?.nom);
  if (!variant) return null;

  // Vêtements / chaussures : stock par taille ou pointure
  if (variant.tailles && Array.isArray(variant.tailles)) {
    // Taille introuvable : la décrémentation au paiement lèverait une erreur, on refuse dès la commande
    const taille = extraireTaille(choisi?.nom);
    const ligne = taille ? variant.tailles.find((t: any) => t.taille === taille) : undefined;
    return ligne ? ligne.stock || 0 : 0;
  }
  // Billets d'événement, attributs génériques : stock direct
  if (typeof variant.stock === 'number') return variant.stock;
  // Ancien format
  if (typeof variant.quantite === 'number') return variant.quantite;
  return null;
}

export function stockDisponibleSelection(produit: ProduitStockable, variantsSelectionnes: any): number {
  let stockDisponible = produit.quantite_stock || 0;
  const variantsData = produit.variants as any;
  if (!variantsSelectionnes || !variantsData) return stockDisponible;

  // Format moderne : { variants: [...] } avec un variant sélectionné
  if (variantsSelectionnes.variant && Array.isArray(variantsData.variants)) {
    const stockVariant = stockDuVariant(variantsData, variantsSelectionnes);
    if (stockVariant !== null) stockDisponible = Math.min(stockDisponible, stockVariant);
    return stockDisponible;
  }

  // Ancien format : variants = [{ nom, options, quantites }]
  for (const [nomVariant, optionSelectionnee] of Object.entries(variantsSelectionnes)) {
    if (nomVariant === 'variant' || nomVariant === 'options' || nomVariant === 'participants') continue;
    const variant = Array.isArray(variantsData) ? variantsData.find((v: any) => v.nom === nomVariant) : undefined;
    if (variant?.options && variant.quantites) {
      const index = variant.options.indexOf(optionSelectionnee);
      if (index !== -1 && variant.quantites[index] !== undefined) {
        stockDisponible = Math.min(stockDisponible, variant.quantites[index]);
      }
    }
  }
  return stockDisponible;
}
