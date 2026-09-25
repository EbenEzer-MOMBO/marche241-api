export const MESSAGE_MIX_PANIER =
  'Les billets événement ne peuvent pas être mélangés avec d’autres articles. Videz le panier ou retirez les articles incompatibles.';

export function isProduitEvenement(produit: { variants?: unknown } | null | undefined): boolean {
  const variants = produit?.variants;
  if (!variants || typeof variants !== 'object') {
    return false;
  }
  return (variants as { type?: string }).type === 'evenement';
}
