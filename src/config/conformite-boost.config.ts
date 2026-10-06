/**
 * Checklist de conformité cochée par l'équipe Marché 241 avant publication d'un boost.
 * Port de boost_meta/src/lib/compliance.ts, adapté à une marketplace.
 */

export const CONFORMITE_BOOST = [
  { id: 'interdit', libelle: 'Aucun produit interdit par Meta (armes, tabac, médicaments, contrefaçons, etc.)' },
  { id: 'allegations', libelle: 'Aucune allégation trompeuse (prix, promotions, résultats garantis)' },
  { id: 'ciblage', libelle: 'Ciblage non sensible (santé, politique, religion, mineurs)' },
  { id: 'visuel', libelle: 'Visuel net, peu de texte, cohérent avec la boutique ou le produit' }
] as const;

export type ConformiteId = (typeof CONFORMITE_BOOST)[number]['id'];

export const IDS_CONFORMITE = CONFORMITE_BOOST.map((c) => c.id) as string[];

export function estConformiteComplete(cochees: string[]): boolean {
  return CONFORMITE_BOOST.every((item) => cochees.includes(item.id));
}
