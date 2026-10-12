/**
 * Marge plateforme (frais de service) ajoutée au paiement de l'acheteur.
 *
 * Le taux est un pourcentage entier propre à chaque vendeur (`vendeurs.taux_marge`),
 * figé sur la commande à sa création (`commandes.taux_marge`). Les paiements d'une
 * commande se vérifient toujours avec le taux de la commande, jamais avec celui du vendeur.
 *
 * Copies alignées : marche241_v2 `src/lib/constants/frais-service.ts`
 * et marche241_admin `app/Support/PlatformCommission.php`.
 */
export const TAUX_MARGE_DEFAUT = 10;
export const TAUX_MARGE_MIN = 10;
export const TAUX_MARGE_MAX = 50;

/**
 * Taux exploitable : entier dans les bornes, sinon le taux par défaut
 * (valeur absente ou invalide, ex. commande antérieure à la migration 037).
 */
export const normaliserTauxMarge = (taux: unknown): number => {
  const valeur = typeof taux === 'string' ? Number(taux) : taux;
  if (typeof valeur !== 'number' || !Number.isInteger(valeur)) {
    return TAUX_MARGE_DEFAUT;
  }
  if (valeur < TAUX_MARGE_MIN || valeur > TAUX_MARGE_MAX) {
    return TAUX_MARGE_DEFAUT;
  }
  return valeur;
};

/** Montant payé par l'acheteur pour un montant vendeur donné. */
export const avecMarge = (montant: number, taux: number): number =>
  Math.round((montant * (100 + taux)) / 100);

/** Part plateforme contenue dans un montant encaissé (marge incluse). */
export const commissionDepuisBrut = (montantBrut: number, taux: number): number =>
  (montantBrut * taux) / (100 + taux);
