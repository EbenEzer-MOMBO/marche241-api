/**
 * Calcul du remboursement d'un boost (paiement à l'acte).
 * Port de `reconcileCampaign` (boost_meta/src/lib/meta/sync.ts) : la dépense réelle est plafonnée au
 * budget média, la commission (et la TVA) sont conservées au prorata de la dépense ; le reste est
 * dû au vendeur et remboursé manuellement par versement.
 * Les frais d'encaissement (eBilling, figés à la soumission) ne sont jamais remboursés.
 */

export interface MontantsBoost {
  total_fcfa: number;
  budget_media_fcfa: number;
  commission_fcfa: number;
  tva_fcfa: number;
  frais_encaissement_fcfa?: number;
}

export interface Cloture {
  depense_fcfa: number;
  commission_conservee_fcfa: number;
  tva_conservee_fcfa: number;
  frais_encaissement_fcfa: number;
  montant_a_rembourser_fcfa: number;
}

/** Frais d'encaissement d'un total payé (arrondi à l'FCFA). */
export function fraisEncaissement(totalFcfa: number, fraisBps: number): number {
  return Math.max(0, Math.round((Math.max(0, totalFcfa) * Math.max(0, fraisBps)) / 10_000));
}

function fraisRetenus(montants: MontantsBoost): number {
  return Math.min(Math.max(0, montants.frais_encaissement_fcfa ?? 0), Math.max(0, montants.total_fcfa));
}

export function calculerCloture(montants: MontantsBoost, depenseFcfa: number): Cloture {
  const media = Math.max(0, montants.budget_media_fcfa);
  const depense = Math.min(Math.max(Math.round(depenseFcfa), 0), media);
  const ratio = media > 0 ? depense / media : 0;
  const commission = Math.round(montants.commission_fcfa * ratio);
  const tva = Math.round(montants.tva_fcfa * ratio);
  const frais = fraisRetenus(montants);
  const remboursement = Math.max(0, montants.total_fcfa - depense - commission - tva - frais);
  return {
    depense_fcfa: depense,
    commission_conservee_fcfa: commission,
    tva_conservee_fcfa: tva,
    frais_encaissement_fcfa: frais,
    montant_a_rembourser_fcfa: remboursement
  };
}

/** Refus Marché 241 ou rejet Meta avant toute diffusion : tout est remboursé sauf les frais d'encaissement. */
export function remboursementIntegral(montants: MontantsBoost): number {
  return Math.max(0, montants.total_fcfa - fraisRetenus(montants));
}
