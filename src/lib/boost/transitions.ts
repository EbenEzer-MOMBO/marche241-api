import { StatutBoost } from '../database-types';

/** Transitions de statut autorisées pour un boost (cf. PLAN_BOOST_META.md §2). */
export const TRANSITIONS_BOOST: Record<StatutBoost, StatutBoost[]> = {
  brouillon: ['en_attente_paiement'],
  en_attente_paiement: ['en_attente_validation', 'brouillon'],
  en_attente_validation: ['actif', 'refuse', 'erreur'],
  erreur: ['actif', 'refuse', 'erreur'],
  actif: ['en_pause', 'termine', 'rejete_meta'],
  en_pause: ['actif', 'termine', 'rejete_meta'],
  refuse: [],
  termine: [],
  rejete_meta: []
};

export const STATUTS_DIFFUSION: StatutBoost[] = ['actif', 'en_pause'];
export const STATUTS_FINAUX: StatutBoost[] = ['refuse', 'termine', 'rejete_meta'];

export function peutTransitionner(de: StatutBoost, vers: StatutBoost): boolean {
  return TRANSITIONS_BOOST[de]?.includes(vers) ?? false;
}

export class TransitionBoostInvalideError extends Error {
  constructor(public readonly de: StatutBoost, public readonly vers: StatutBoost) {
    super(`Transition de statut impossible : ${de} → ${vers}`);
    this.name = 'TransitionBoostInvalideError';
  }
}

export function verifierTransition(de: StatutBoost, vers: StatutBoost): void {
  if (!peutTransitionner(de, vers)) throw new TransitionBoostInvalideError(de, vers);
}

export const LIBELLES_STATUT_BOOST: Record<StatutBoost, string> = {
  brouillon: 'Brouillon',
  en_attente_paiement: 'En attente de paiement',
  en_attente_validation: 'En attente de validation',
  refuse: 'Refusé',
  actif: 'En diffusion',
  en_pause: 'En pause',
  termine: 'Terminé',
  rejete_meta: 'Refusé par Meta',
  erreur: 'Erreur de publication'
};
