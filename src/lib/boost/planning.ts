/** Fenêtre de diffusion d'un boost (port de scheduleFromDuration / publishWindow de boost_meta). */

const HEURE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * HEURE_MS;

/** Début dans 1 h (temps de validation), fin = début + durée. */
export function planningDepuisDuree(dureeJours: number, maintenant = new Date()): { date_debut: Date; date_fin: Date } {
  const jours = Math.max(1, Math.round(dureeJours));
  const debut = new Date(maintenant.getTime() + HEURE_MS);
  return { date_debut: debut, date_fin: new Date(debut.getTime() + jours * JOUR_MS) };
}

/**
 * Fenêtre envoyée à Meta au moment de la publication : début ≥ maintenant + 2 min,
 * durée conservée (la validation peut intervenir après la date prévue), fin ≥ début + 1 h.
 */
export function fenetrePublication(dureeJours: number, maintenant = new Date()): { start_time: string; end_time: string } {
  const debut = maintenant.getTime() + 2 * 60 * 1000;
  const fin = Math.max(debut + Math.max(1, dureeJours) * JOUR_MS, debut + HEURE_MS);
  return { start_time: new Date(debut).toISOString(), end_time: new Date(fin).toISOString() };
}

export function dateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
