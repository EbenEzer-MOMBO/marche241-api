import { StatutPublicite } from '../database-types';

/** Transitions de statut autorisées pour une publicité interne (cf. PLAN_PUB_INTERNE.md §2). */
export const TRANSITIONS_PUBLICITE: Record<StatutPublicite, StatutPublicite[]> = {
  brouillon: ['en_attente_paiement', 'programmee'],
  en_attente_paiement: ['en_attente_validation', 'brouillon'],
  en_attente_validation: ['programmee', 'active', 'refusee'],
  programmee: ['active', 'terminee', 'annulee'],
  active: ['terminee', 'annulee'],
  refusee: [],
  terminee: ['programmee', 'active'], // uniquement par « offrir une semaine » (garantie d'affichages)
  annulee: []
};

/** Statuts qui tiennent des semaines réservées. */
export const STATUTS_AVEC_RESERVATION: StatutPublicite[] = ['en_attente_paiement', 'en_attente_validation', 'programmee', 'active'];
/** Statuts diffusés sur le site (si la date du jour est dans la période). */
export const STATUTS_DIFFUSABLES: StatutPublicite[] = ['programmee', 'active'];
export const STATUTS_FINAUX: StatutPublicite[] = ['refusee', 'terminee', 'annulee'];

export function peutTransitionner(de: StatutPublicite, vers: StatutPublicite): boolean {
  return TRANSITIONS_PUBLICITE[de]?.includes(vers) ?? false;
}

export class TransitionPubliciteInvalideError extends Error {
  constructor(public readonly de: StatutPublicite, public readonly vers: StatutPublicite) {
    super(`Transition de statut impossible : ${de} → ${vers}`);
    this.name = 'TransitionPubliciteInvalideError';
  }
}

export function verifierTransition(de: StatutPublicite, vers: StatutPublicite): void {
  if (!peutTransitionner(de, vers)) throw new TransitionPubliciteInvalideError(de, vers);
}

/** Statut atteint après validation : en diffusion si la période a commencé, programmée sinon. */
export function statutApresValidation(dateDebut: Date, maintenant: Date = new Date()): StatutPublicite {
  return dateDebut.getTime() <= maintenant.getTime() ? 'active' : 'programmee';
}

export const LIBELLES_STATUT_PUBLICITE: Record<StatutPublicite, string> = {
  brouillon: 'Brouillon',
  en_attente_paiement: 'En attente de paiement',
  en_attente_validation: 'En attente de validation',
  refusee: 'Refusée',
  programmee: 'Programmée',
  active: 'En diffusion',
  terminee: 'Terminée',
  annulee: 'Annulée'
};
