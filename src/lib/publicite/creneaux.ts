import { CreneauPublicite, FormulePublicite, PagePublicite } from '../database-types';

/**
 * Créneaux physiques occupés par chaque formule (cf. PLAN_PUB_INTERNE.md §1) :
 * - Catégorie → `categorie` (en-tête de /produits?categorie=…)
 * - Accueil   → `accueil`   (sous le hero de l'accueil)
 * - Premium   → `accueil` + `pages` (bandeau sur les autres pages publiques)
 * Premium et Accueil se bloquent donc mutuellement sur une même semaine.
 */
export const CRENEAUX_FORMULE: Record<FormulePublicite, CreneauPublicite[]> = {
  categorie: ['categorie'],
  accueil: ['accueil'],
  premium: ['accueil', 'pages']
};

export const FORMULES: FormulePublicite[] = ['categorie', 'accueil', 'premium'];

export const LIBELLES_FORMULE: Record<FormulePublicite, string> = {
  categorie: 'Catégorie',
  accueil: 'Accueil',
  premium: 'Premium'
};

export interface LigneReservation {
  creneau: CreneauPublicite;
  categorie_id: number | null;
  semaine: string;
}

/** Lignes de `publicite_reservations` à insérer pour une formule sur des semaines données. */
export function lignesReservation(formule: FormulePublicite, categorieId: number | null, semaines: string[]): LigneReservation[] {
  if (formule === 'categorie' && !categorieId) throw new Error('Catégorie obligatoire pour la formule Catégorie');
  return semaines.flatMap((semaine) =>
    CRENEAUX_FORMULE[formule].map((creneau) => ({
      creneau,
      categorie_id: creneau === 'categorie' ? categorieId : null,
      semaine
    }))
  );
}

/**
 * Créneaux à afficher sur une page publique. L'accueil montre son créneau ; une page catégorie montre
 * la bannière de la catégorie et le bandeau Premium ; les autres pages montrent le bandeau Premium.
 * Jamais plus de deux bannières par page.
 */
export function creneauxPage(page: PagePublicite, categorieId: number | null): Array<{ creneau: CreneauPublicite; categorie_id: number | null }> {
  if (page === 'accueil') return [{ creneau: 'accueil', categorie_id: null }];
  if (page === 'categorie' && categorieId) {
    return [
      { creneau: 'categorie', categorie_id: categorieId },
      { creneau: 'pages', categorie_id: null }
    ];
  }
  return [{ creneau: 'pages', categorie_id: null }];
}
