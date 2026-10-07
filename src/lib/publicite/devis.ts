import { FormulePublicite } from '../database-types';

/**
 * Devis d'une publicité interne : prix d'une semaine × nombre de semaines, avec la remise
 * « 4 semaines = prix de 3 » appliquée par tranche complète de 4 semaines. Montants FCFA entiers.
 */

export interface DevisPublicite {
  formule: FormulePublicite;
  nb_semaines: number;
  prix_semaine_fcfa: number;
  semaines_offertes_remise: number; // semaines gratuites au titre de la remise 4 pour 3
  sous_total_fcfa: number;
  remise_fcfa: number;
  frais_encaissement_fcfa: number; // inclus dans le total, non remboursables
  total_fcfa: number;
}

export function devisPublicite(
  formule: FormulePublicite,
  nbSemaines: number,
  tarifs: Record<FormulePublicite, number>,
  remise4Pour3: boolean,
  fraisEncaissementBps: number
): DevisPublicite {
  if (!Number.isInteger(nbSemaines) || nbSemaines < 1) throw new Error('Nombre de semaines invalide');
  const prix = Math.max(0, Math.round(tarifs[formule] ?? 0));
  if (!prix) throw new Error(`Aucun tarif défini pour la formule ${formule}`);
  const offertes = remise4Pour3 ? Math.floor(nbSemaines / 4) : 0;
  const sousTotal = prix * nbSemaines;
  const remise = prix * offertes;
  const total = sousTotal - remise;
  return {
    formule,
    nb_semaines: nbSemaines,
    prix_semaine_fcfa: prix,
    semaines_offertes_remise: offertes,
    sous_total_fcfa: sousTotal,
    remise_fcfa: remise,
    frais_encaissement_fcfa: Math.round((total * Math.max(0, fraisEncaissementBps)) / 10_000),
    total_fcfa: total
  };
}

/**
 * Remboursement au prorata des semaines non diffusées (annulation). Les frais d'encaissement restent
 * acquis ; le résultat n'est jamais négatif.
 */
export function remboursementProrata(
  totalFcfa: number,
  fraisEncaissementFcfa: number,
  nbSemainesPayees: number,
  nbSemainesNonDiffusees: number
): number {
  if (nbSemainesPayees <= 0 || totalFcfa <= 0) return 0;
  const restantes = Math.min(Math.max(0, nbSemainesNonDiffusees), nbSemainesPayees);
  const montant = Math.floor((totalFcfa * restantes) / nbSemainesPayees) - (restantes === nbSemainesPayees ? fraisEncaissementFcfa : 0);
  return Math.max(0, montant);
}
