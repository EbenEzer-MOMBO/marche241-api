import { calculerCloture, fraisRetenus, remboursementIntegral, MontantsBoost } from './reliquat';

/**
 * Explication d'un remboursement de boost pour le vendeur : pourquoi il est remboursé et comment le
 * montant est calculé (même règles que `reliquat.ts`). Fonction pure, utilisée par l'e-mail envoyé
 * quand l'équipe marque le boost remboursé. Les lignes renvoyées totalisent toujours `montant`.
 */

export interface BoostARembourser extends MontantsBoost {
  statut: string;
  depense_fcfa: number;
  montant_a_rembourser_fcfa: number;
  note_revue: string | null;
}

export interface LigneRemboursement {
  libelle: string;
  montant: number;
}

export interface ExplicationRemboursement {
  motif: string;
  lignes: LigneRemboursement[];
  montant: number;
}

const FRAIS = "Frais d'encaissement (non remboursables)";

/**
 * @param paiementsEnTrop paiements en double / hors file crédités depuis le dernier remboursement
 */
export function expliquerRemboursement(boost: BoostARembourser, paiementsEnTrop = 0): ExplicationRemboursement {
  const montant = Math.max(0, boost.montant_a_rembourser_fcfa);
  const enTrop = Math.min(Math.max(0, paiementsEnTrop), montant);
  const reliquat = montant - enTrop;
  const motifRevue = boost.note_revue?.trim();
  let motif = '';
  let detail: LigneRemboursement[] = [];
  let attendu = 0;

  if (boost.statut === 'refuse') {
    attendu = remboursementIntegral(boost);
    motif = `Votre publicité n'a pas été validée par l'équipe Marché 241${motifRevue ? ` (motif : ${motifRevue})` : ''}. Elle n'a jamais été diffusée : le montant payé vous est remboursé, hors frais d'encaissement.`;
    detail = [
      { libelle: 'Montant payé', montant: boost.total_fcfa },
      { libelle: FRAIS, montant: -fraisRetenus(boost) }
    ];
  } else if (boost.statut === 'termine' || boost.statut === 'rejete_meta') {
    const cloture = calculerCloture(boost, boost.depense_fcfa);
    attendu = cloture.montant_a_rembourser_fcfa;
    motif =
      boost.statut === 'rejete_meta'
        ? `Meta a refusé ou arrêté la diffusion de votre publicité${motifRevue ? ` (motif : ${motifRevue})` : ''}. Le budget non dépensé vous est remboursé.`
        : "La diffusion de votre publicité est terminée sans avoir dépensé tout le budget. La part non dépensée vous est remboursée ; la commission Marché 241 n'est conservée que sur ce qui a été réellement dépensé.";
    detail = [
      { libelle: 'Montant payé', montant: boost.total_fcfa },
      { libelle: 'Dépensé sur Facebook & Instagram', montant: -cloture.depense_fcfa },
      { libelle: 'Commission Marché 241 sur la dépense', montant: -cloture.commission_conservee_fcfa },
      { libelle: 'TVA sur la commission', montant: -cloture.tva_conservee_fcfa },
      { libelle: 'Frais vidéo Marché 241 (publicité diffusée)', montant: -cloture.frais_video_conserve_fcfa },
      { libelle: FRAIS, montant: -cloture.frais_encaissement_fcfa }
    ];
  }

  const lignes: LigneRemboursement[] = [];
  if (reliquat > 0) {
    // Détail seulement s'il explique exactement le montant (sinon : ajustement manuel, montant seul).
    lignes.push(...(reliquat === attendu ? detail : [{ libelle: 'Remboursement', montant: reliquat }]));
    if (!motif) motif = 'Une partie du montant payé pour votre publicité vous est remboursée.';
  }
  if (enTrop > 0) {
    lignes.push({ libelle: reliquat > 0 ? 'Paiement en double remboursé' : 'Paiement en trop', montant: enTrop });
    motif =
      reliquat > 0
        ? `${motif} Un paiement reçu en double est aussi inclus.`
        : 'Un paiement en trop a été reçu pour votre publicité (paiement en double ou après sa clôture) : il vous est remboursé.';
  }

  return { motif, lignes: lignes.filter((l) => l.montant !== 0), montant };
}
