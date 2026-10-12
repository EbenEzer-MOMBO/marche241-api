import { avecMarge } from './marge';

export interface MontantsCommande {
  /** Somme des articles au prix vendeur (hors frais de service) */
  totalArticles: number;
  /** Frais de livraison au prix vendeur (hors frais de service) */
  fraisLivraison: number;
}

export interface MontantAttendu {
  montant: number;
  description: string;
  /** Type de paiement absent de la liste connue : repli sur le total de la commande */
  typeInconnu: boolean;
}

export const ACOMPTE_POURCENTAGE = 0.5;

/**
 * Montant que l'acheteur doit payer pour un type de paiement, frais de service inclus,
 * au taux de marge figé sur la commande. Renvoie `null` pour `complement`, qui n'est pas
 * contrôlé. Utilisé par verifierMontantTransaction (paiement.controller.ts) ; la formule
 * doit rester identique à celle du checkout (marche241_v2, OrderSummary.tsx).
 */
export const montantAttenduPourPaiement = (
  typePaiement: string | null | undefined,
  { totalArticles, fraisLivraison }: MontantsCommande,
  taux: number
): MontantAttendu | null => {
  const totalCommandeHT = totalArticles + fraisLivraison;

  switch (typePaiement) {
    case 'frais_livraison': {
      const montant = fraisLivraison > 0 ? avecMarge(fraisLivraison, taux) : 0;
      return { montant, typeInconnu: false, description: `frais de livraison (${fraisLivraison} + ${taux}% = ${montant})` };
    }

    case 'paiement_complet': {
      const montant = avecMarge(totalCommandeHT, taux);
      return { montant, typeInconnu: false, description: `paiement complet ((${totalArticles} + ${fraisLivraison}) + ${taux}% = ${montant})` };
    }

    case 'solde_apres_livraison': {
      const montant = avecMarge(totalArticles, taux);
      return { montant, typeInconnu: false, description: `solde après livraison (${totalArticles} + ${taux}% = ${montant})` };
    }

    case 'acompte': {
      const montant = avecMarge(Math.round(totalCommandeHT * ACOMPTE_POURCENTAGE), taux);
      return { montant, typeInconnu: false, description: `acompte 50% (50% de (${totalArticles} + ${fraisLivraison}) + ${taux}% = ${montant})` };
    }

    case 'complement':
      return null;

    default: {
      const montant = avecMarge(totalCommandeHT, taux);
      return { montant, typeInconnu: true, description: `total de la commande ((${totalArticles} + ${fraisLivraison}) + ${taux}% = ${montant})` };
    }
  }
};
