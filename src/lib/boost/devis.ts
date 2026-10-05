/**
 * Devis d'un boost (montants FCFA entiers, commission et TVA en points de base).
 * Port de boost_meta/src/lib/money.ts (campaignQuote / campaignInvoiceQuote), complété par le
 * calcul inverse : chez Marché 241, le vendeur choisit le TOTAL payé (packs 3 000 / 7 500 / …)
 * et le budget média transmis à Meta s'en déduit.
 */

export interface DevisBoost {
  budget_media_fcfa: number;
  commission_bps: number;
  commission_fcfa: number;
  tva_bps: number;
  tva_fcfa: number;
  total_fcfa: number;
}

/** Devis à partir du budget média (commission = max(minimum, média × bps), TVA sur média + commission). */
export function devisDepuisMedia(
  mediaFcfa: number,
  commissionBps: number,
  commissionMinFcfa: number,
  tvaBps = 0
): DevisBoost {
  const media = Math.max(0, Math.round(mediaFcfa));
  const pourcentage = Math.round((media * commissionBps) / 10_000);
  const commission = Math.max(commissionMinFcfa, pourcentage);
  const tva = Math.max(0, Math.round(((media + commission) * tvaBps) / 10_000));
  return {
    budget_media_fcfa: media,
    commission_bps: commissionBps,
    commission_fcfa: commission,
    tva_bps: tvaBps,
    tva_fcfa: tva,
    total_fcfa: media + commission + tva
  };
}

/**
 * Devis à partir du total payé par le vendeur. La somme média + commission + TVA vaut toujours
 * exactement `totalFcfa`. Lève une erreur si le total ne couvre pas la commission minimum.
 */
export function devisDepuisTotal(
  totalFcfa: number,
  commissionBps: number,
  commissionMinFcfa: number,
  tvaBps = 0
): DevisBoost {
  const total = Math.round(totalFcfa);
  const baseHt = Math.round((total * 10_000) / (10_000 + tvaBps));
  const tva = total - baseHt;
  const commission = Math.max(commissionMinFcfa, Math.round((baseHt * commissionBps) / (10_000 + commissionBps)));
  const media = baseHt - commission;
  if (media <= 0) {
    throw new Error(`Le montant de ${total} FCFA ne couvre pas la commission minimum de ${commissionMinFcfa} FCFA`);
  }
  return {
    budget_media_fcfa: media,
    commission_bps: commissionBps,
    commission_fcfa: commission,
    tva_bps: tvaBps,
    tva_fcfa: tva,
    total_fcfa: total
  };
}

export function estTotalDansBornes(totalFcfa: number, min: number, max: number): boolean {
  return Number.isInteger(totalFcfa) && totalFcfa >= min && totalFcfa <= max;
}

export function budgetParJour(mediaFcfa: number, dureeJours: number): number {
  return Math.floor(mediaFcfa / Math.max(1, dureeJours));
}

export function formaterFcfa(montant: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(montant)).replace(/ | /g, ' ')} FCFA`;
}
