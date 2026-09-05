/**
 * Catalogue des forfaits de boost publicitaire (Phase 1 — boost de boutique, forfaits fixes).
 *
 * Le ciblage géographique n'est PAS lié au forfait : le vendeur choisit librement ses zones
 * (n'importe où dans le monde), sans impact sur le prix.
 *
 * Les montants `budget_meta_reel_fcfa` sont des valeurs indicatives en attendant validation
 * finale avec Eben (voir CONCEPTION_BOOST_PUBLICITAIRE.md §9 et le plan d'implémentation).
 */

export interface ForfaitBoost {
  code: string;
  nom: string;
  prix_vendeur_fcfa: number;
  budget_meta_reel_fcfa: number;
  duree_jours: number;
  reciblage?: boolean;
}

export const FORFAITS_BOOST: Record<string, ForfaitBoost> = {
  decouverte: {
    code: 'decouverte',
    nom: 'Découverte',
    prix_vendeur_fcfa: 3000,
    budget_meta_reel_fcfa: 2000,
    duree_jours: 3
  },
  standard: {
    code: 'standard',
    nom: 'Standard',
    prix_vendeur_fcfa: 7500,
    budget_meta_reel_fcfa: 5500,
    duree_jours: 5
  },
  pro: {
    code: 'pro',
    nom: 'Boost Pro',
    prix_vendeur_fcfa: 15000,
    budget_meta_reel_fcfa: 11500,
    duree_jours: 7
  },
  max: {
    code: 'max',
    nom: 'Boost Max',
    prix_vendeur_fcfa: 30000,
    budget_meta_reel_fcfa: 24000,
    duree_jours: 10,
    reciblage: true
  }
};

export type ForfaitCode = keyof typeof FORFAITS_BOOST;

export const getForfaitByCode = (code: string): ForfaitBoost | null => FORFAITS_BOOST[code] ?? null;

export const listerForfaits = (): ForfaitBoost[] => Object.values(FORFAITS_BOOST);

/**
 * Version filtrée pour un appelant vendeur : masque budget_meta_reel_fcfa (marge interne),
 * réservé aux appels admin-scopés.
 */
export const listerForfaitsPourVendeur = (): Array<Omit<ForfaitBoost, 'budget_meta_reel_fcfa'>> =>
  listerForfaits().map(({ budget_meta_reel_fcfa, ...reste }) => reste);
