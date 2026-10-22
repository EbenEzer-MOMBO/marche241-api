import crypto from 'crypto';
import { dateEvenementEnMs } from '../../utils/produit-evenement';

/**
 * Règles du scanner de billets (PWA marche241_scan), sans accès base :
 * lecture du QR, fenêtre de scan, validité de la commande, horodatage des scans hors-ligne.
 */

/** Ouverture du scan avant le début de l'événement. */
export const OUVERTURE_AVANT_DEBUT_MS = 60 * 60 * 1000;
/** Fin par défaut d'un événement sans `date_fin` : début + 12 h. */
export const DUREE_PAR_DEFAUT_MS = 12 * 60 * 60 * 1000;
/** Tolérance sur l'horloge d'un appareil pour les scans hors-ligne. */
export const TOLERANCE_HORLOGE_MS = 10 * 60 * 1000;

export type CodeScan =
  | 'SCAN_REUSSI'
  | 'BILLET_DEJA_SCANNE'
  | 'BILLET_INTROUVABLE'
  | 'MAUVAIS_EVENEMENT'
  | 'COMMANDE_NON_VALIDE'
  | 'HORS_FENETRE'
  | 'QR_INVALIDE';

export interface QrBillet {
  jeton: string;
  numero: number;
}

const QR_REGEX = /^M241\|([a-f0-9]{16,64})\|(\d{1,9})$/i;

/** Lit un QR `M241|<jeton>|<numero>` ; null si le format ne correspond pas. */
export function lireQrBillet(brut: unknown): QrBillet | null {
  if (typeof brut !== 'string') return null;
  const m = QR_REGEX.exec(brut.trim());
  if (!m) return null;
  const numero = Number.parseInt(m[2], 10);
  if (!Number.isSafeInteger(numero) || numero < 1) return null;
  return { jeton: m[1].toLowerCase(), numero };
}

/**
 * Empreinte d'un billet pour le cache semi-offline de la PWA : le jeton brut
 * (qui ouvre la page publique des billets) ne quitte jamais l'API.
 */
export function empreinteBillet(jeton: string, numero: number): string {
  return crypto.createHash('sha256').update(`${jeton.toLowerCase()}|${numero}`, 'utf8').digest('hex');
}

/** Date d'événement : une saisie sans fuseau est une heure locale du Gabon. */
export function lireDateEvenement(valeur: unknown): Date | null {
  const ms = dateEvenementEnMs(valeur);
  return ms === null ? null : new Date(ms);
}

export interface FenetreScan {
  debut: Date;
  fin: Date;
  ouverture: Date;
  fermeture: Date;
  fin_par_defaut: boolean;
}

/** Fenêtre de scan d'un événement : de 1 h avant le début jusqu'à la fin (début + 12 h si absente). */
export function fenetreScan(meta: Record<string, unknown> | null | undefined): FenetreScan | null {
  const debut = lireDateEvenement(meta?.date_debut);
  if (!debut) return null;
  const finSaisie = lireDateEvenement(meta?.date_fin);
  const finValide = finSaisie && finSaisie.getTime() > debut.getTime() ? finSaisie : null;
  const fin = finValide ?? new Date(debut.getTime() + DUREE_PAR_DEFAUT_MS);
  return {
    debut,
    fin,
    ouverture: new Date(debut.getTime() - OUVERTURE_AVANT_DEBUT_MS),
    fermeture: fin,
    fin_par_defaut: !finValide
  };
}

export function estDansFenetre(fenetre: FenetreScan | null, instant: Date, toleranceMs = 0): boolean {
  if (!fenetre) return false;
  const t = instant.getTime();
  return t >= fenetre.ouverture.getTime() - toleranceMs && t <= fenetre.fermeture.getTime() + toleranceMs;
}

/** Un billet n'ouvre l'entrée que si sa commande est payée et n'est ni annulée ni remboursée. */
export function estCommandeValide(commande: { statut?: string | null; statut_paiement?: string | null }): boolean {
  return (
    commande.statut_paiement === 'paye' &&
    commande.statut !== 'annulee' &&
    commande.statut !== 'remboursee'
  );
}

/**
 * Horodatage d'un scan hors-ligne : refusé s'il est dans le futur au-delà de la tolérance
 * (horloge déréglée) ; ramené à la réception s'il la dépasse légèrement.
 */
export function horodatageScan(scanneA: Date, recuLe: Date): Date | null {
  if (Number.isNaN(scanneA.getTime())) return null;
  if (scanneA.getTime() > recuLe.getTime() + TOLERANCE_HORLOGE_MS) return null;
  return scanneA.getTime() > recuLe.getTime() ? recuLe : scanneA;
}
