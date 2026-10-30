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
  /** Frais fixe de la créa vidéo (stockage, traitement), déduit avant la commission. 0 pour une image. */
  frais_video_fcfa: number;
  tva_bps: number;
  tva_fcfa: number;
  total_fcfa: number;
}

/**
 * Devis à partir du budget média (commission = max(minimum, média × bps), TVA sur média + commission + frais vidéo).
 * Le frais vidéo est fixe : il n'entre pas dans la base de la commission.
 */
export function devisDepuisMedia(
  mediaFcfa: number,
  commissionBps: number,
  commissionMinFcfa: number,
  tvaBps = 0,
  fraisVideoFcfa = 0
): DevisBoost {
  const media = Math.max(0, Math.round(mediaFcfa));
  const fraisVideo = Math.max(0, Math.round(fraisVideoFcfa));
  const pourcentage = Math.round((media * commissionBps) / 10_000);
  const commission = Math.max(commissionMinFcfa, pourcentage);
  const tva = Math.max(0, Math.round(((media + commission + fraisVideo) * tvaBps) / 10_000));
  return {
    budget_media_fcfa: media,
    commission_bps: commissionBps,
    commission_fcfa: commission,
    frais_video_fcfa: fraisVideo,
    tva_bps: tvaBps,
    tva_fcfa: tva,
    total_fcfa: media + commission + fraisVideo + tva
  };
}

/**
 * Devis à partir du total payé par le vendeur. La somme média + commission + frais vidéo + TVA vaut
 * toujours exactement `totalFcfa`. Le frais vidéo (fixe) est déduit avant la commission, qui ne porte
 * que sur le média. Lève une erreur si le total ne couvre pas la commission minimum et le frais vidéo.
 */
export function devisDepuisTotal(
  totalFcfa: number,
  commissionBps: number,
  commissionMinFcfa: number,
  tvaBps = 0,
  fraisVideoFcfa = 0
): DevisBoost {
  const total = Math.round(totalFcfa);
  const fraisVideo = Math.max(0, Math.round(fraisVideoFcfa));
  const baseHt = Math.round((total * 10_000) / (10_000 + tvaBps));
  const tva = total - baseHt;
  const net = baseHt - fraisVideo;
  const commission = Math.max(commissionMinFcfa, Math.round((net * commissionBps) / (10_000 + commissionBps)));
  const media = net - commission;
  if (media <= 0) {
    const frais = fraisVideo > 0 ? ` et les frais vidéo de ${fraisVideo} FCFA` : '';
    throw new Error(`Le montant de ${total} FCFA ne couvre pas la commission minimum de ${commissionMinFcfa} FCFA${frais}`);
  }
  return {
    budget_media_fcfa: media,
    commission_bps: commissionBps,
    commission_fcfa: commission,
    frais_video_fcfa: fraisVideo,
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

/**
 * Budget média minimum par jour (FCFA), identique pour tous les objectifs. Meta refuse un ensemble de
 * publicités sous 2 $US par jour (« doit être supérieur à 6,00 $US » sur 3 jours, constaté en Visites
 * comme en WhatsApp) : ce plancher est exprimé en $US et converti avec le taux du back-office, pour
 * suivre ses changements. Jamais inférieur au minimum général.
 */
export function budgetJourMinimum(
  parametres: { budget_jour_min_fcfa: number; budget_jour_min_whatsapp_usd: number; fx_xaf_par_usd: number }
): number {
  const fx = parametres.fx_xaf_par_usd > 0 ? parametres.fx_xaf_par_usd : 600;
  return Math.max(parametres.budget_jour_min_fcfa, Math.ceil(Number((parametres.budget_jour_min_whatsapp_usd * fx).toFixed(6))));
}

/**
 * Plus petit total payé (arrondi à la centaine supérieure) dont le budget média atteint `mediaMinFcfa`.
 * Inverse de `devisDepuisTotal` : la commission vaut max(minimum, (base − frais vidéo) × bps / (10 000 + bps)).
 */
export function totalMinimumPourMedia(
  mediaMinFcfa: number,
  commissionBps: number,
  commissionMinFcfa: number,
  tvaBps = 0,
  fraisVideoFcfa = 0
): number {
  const media = Math.max(0, Math.ceil(mediaMinFcfa));
  const fraisVideo = Math.max(0, Math.round(fraisVideoFcfa));
  let total = Math.max(media + commissionMinFcfa, Math.ceil((media * (10_000 + commissionBps)) / 10_000)) + fraisVideo;
  total = Math.ceil((total * (10_000 + tvaBps)) / 10_000);
  total = Math.ceil(total / 100) * 100;
  // Garde-fou contre les arrondis : on avance par centaine jusqu'à couvrir le média
  while (devisDepuisTotal(total, commissionBps, commissionMinFcfa, tvaBps, fraisVideo).budget_media_fcfa < media) total += 100;
  return total;
}

export function formaterFcfa(montant: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(montant)).replace(/ | /g, ' ')} FCFA`;
}
