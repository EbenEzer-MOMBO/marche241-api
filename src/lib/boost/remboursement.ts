import { calculerCloture, remboursementIntegral, MontantsBoost } from './reliquat';

/**
 * Explication d'un remboursement de boost pour le vendeur : pourquoi il est remboursé et comment le
 * montant est calculé (même règles que `reliquat.ts`). Fonction pure, utilisée par l'e-mail envoyé
 * quand l'équipe marque le boost remboursé.
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

export function expliquerRemboursement(boost: BoostARembourser): ExplicationRemboursement {
  const montant = Math.max(0, boost.montant_a_rembourser_fcfa);
  const frais = Math.min(Math.max(0, boost.frais_encaissement_fcfa ?? 0), Math.max(0, boost.total_fcfa));
  const motifRevue = boost.note_revue?.trim();
  const lignes: LigneRemboursement[] = [];
  let motif: string;
  let base = 0;

  if (boost.statut === 'refuse') {
    base = remboursementIntegral(boost);
    motif = `Votre publicité n'a pas été validée par l'équipe Marché 241${motifRevue ? ` (motif : ${motifRevue})` : ''}. Elle n'a jamais été diffusée : le montant payé vous est remboursé, hors frais d'encaissement.`;
    lignes.push({ libelle: 'Montant payé', montant: boost.total_fcfa }, { libelle: "Frais d'encaissement (non remboursables)", montant: -frais });
  } else if (boost.statut === 'termine' || boost.statut === 'rejete_meta') {
    const cloture = calculerCloture(boost, boost.depense_fcfa);
    base = cloture.montant_a_rembourser_fcfa;
    motif =
      boost.statut === 'rejete_meta'
        ? `Meta a refusé ou arrêté la diffusion de votre publicité${motifRevue ? ` (motif : ${motifRevue})` : ''}. Le budget non dépensé vous est remboursé.`
        : "La diffusion de votre publicité est terminée sans avoir dépensé tout le budget. La part non dépensée vous est remboursée ; la commission Marché 241 n'est conservée que sur ce qui a été réellement dépensé.";
    lignes.push(
      { libelle: 'Montant payé', montant: boost.total_fcfa },
      { libelle: 'Dépensé sur Facebook & Instagram', montant: -cloture.depense_fcfa },
      { libelle: 'Commission Marché 241 sur la dépense', montant: -(cloture.commission_conservee_fcfa + cloture.tva_conservee_fcfa) },
      { libelle: "Frais d'encaissement (non remboursables)", montant: -cloture.frais_encaissement_fcfa }
    );
  } else {
    motif = "Un paiement en trop a été reçu pour votre publicité (paiement en double ou après sa clôture) : il vous est remboursé.";
  }

  base = Math.min(base, montant);
  const enTrop = montant - base;
  if (lignes.length === 0) {
    lignes.push({ libelle: 'Paiement en trop', montant: enTrop });
  } else if (enTrop > 0) {
    lignes.push({ libelle: 'Paiement en double remboursé', montant: enTrop });
    motif += ' Un paiement reçu en double est aussi inclus.';
  }

  return { motif, lignes: lignes.filter((l) => l.montant !== 0), montant };
}
