/**
 * Calcul du remboursement d'un boost (paiement à l'acte).
 * Port de `reconcileCampaign` (boost_meta/src/lib/meta/sync.ts) : la dépense réelle est plafonnée au
 * budget média, la commission (et la TVA) sont conservées au prorata de la dépense ; le reste est
 * dû au vendeur et remboursé manuellement par versement.
 * Les frais d'encaissement (eBilling, figés à la soumission) ne sont jamais remboursés.
 * Le frais vidéo (fixe, figé à la soumission) n'est conservé que si la publicité a réellement diffusé
 * (dépense > 0) : refus Marché 241 ou rejet Meta sans dépense = remboursé.
 */

export interface MontantsBoost {
  total_fcfa: number;
  budget_media_fcfa: number;
  commission_fcfa: number;
  tva_fcfa: number;
  frais_encaissement_fcfa?: number;
  frais_video_fcfa?: number;
}

export interface Cloture {
  depense_fcfa: number;
  commission_conservee_fcfa: number;
  tva_conservee_fcfa: number;
  frais_encaissement_fcfa: number;
  frais_video_conserve_fcfa: number;
  montant_a_rembourser_fcfa: number;
}

/** Frais d'encaissement d'un total payé (arrondi à l'FCFA). */
export function fraisEncaissement(totalFcfa: number, fraisBps: number): number {
  return Math.max(0, Math.round((Math.max(0, totalFcfa) * Math.max(0, fraisBps)) / 10_000));
}

/** Frais d'encaissement retenus (jamais plus que le total payé). */
export function fraisRetenus(montants: MontantsBoost): number {
  return Math.min(Math.max(0, montants.frais_encaissement_fcfa ?? 0), Math.max(0, montants.total_fcfa));
}

/** Frais vidéo conservés : en entier dès qu'il y a eu de la diffusion, sinon rien (jamais plus que le total payé). */
export function fraisVideoConserves(montants: MontantsBoost, depenseFcfa: number): number {
  if (depenseFcfa <= 0) return 0;
  return Math.min(Math.max(0, montants.frais_video_fcfa ?? 0), Math.max(0, montants.total_fcfa));
}

export function calculerCloture(montants: MontantsBoost, depenseFcfa: number): Cloture {
  const media = Math.max(0, montants.budget_media_fcfa);
  const depense = Math.min(Math.max(Math.round(depenseFcfa), 0), media);
  const ratio = media > 0 ? depense / media : 0;
  const commission = Math.round(montants.commission_fcfa * ratio);
  const tva = Math.round(montants.tva_fcfa * ratio);
  const frais = fraisRetenus(montants);
  const fraisVideo = fraisVideoConserves(montants, depense);
  const remboursement = Math.max(0, montants.total_fcfa - depense - commission - tva - frais - fraisVideo);
  return {
    depense_fcfa: depense,
    commission_conservee_fcfa: commission,
    tva_conservee_fcfa: tva,
    frais_encaissement_fcfa: frais,
    frais_video_conserve_fcfa: fraisVideo,
    montant_a_rembourser_fcfa: remboursement
  };
}

/**
 * Bilan d'un boost terminé : Meta remonte la dépense avec plusieurs heures de retard. Pendant
 * `DELAI_BILAN_MS` après la clôture, la dépense est resynchronisée et le remboursement recalculé ;
 * il n'est définitif (et remboursable) qu'ensuite.
 */
export const DELAI_BILAN_MS = 24 * 60 * 60 * 1000;

export function bilanProvisoire(boost: { statut: string; date_cloture: Date | string | null }, maintenant = Date.now()): boolean {
  if (boost.statut !== 'termine' || !boost.date_cloture) return false;
  return maintenant - new Date(boost.date_cloture).getTime() < DELAI_BILAN_MS;
}

/**
 * Montant total à rembourser après recalcul du bilan : la part « clôture » précédente est remplacée
 * par la nouvelle, les autres crédits (paiement en double…) sont conservés.
 */
export function montantApresBilan(montantActuel: number, ancienneCloture: number, nouvelleCloture: number): number {
  return Math.max(0, montantActuel - Math.max(0, ancienneCloture) + Math.max(0, nouvelleCloture));
}

/** Refus Marché 241 ou rejet Meta avant toute diffusion : tout est remboursé sauf les frais d'encaissement. */
export function remboursementIntegral(montants: MontantsBoost): number {
  return Math.max(0, montants.total_fcfa - fraisRetenus(montants));
}
