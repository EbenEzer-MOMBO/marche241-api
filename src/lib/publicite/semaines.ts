/**
 * Semaines calendaires des publicités internes : lundi 00:00 → dimanche 23:59:59.999, heure de
 * Libreville (UTC+1, sans heure d'été). Les dates de semaine circulent au format AAAA-MM-JJ (le lundi).
 * Tout calcul de borne se fait ici, côté API : jamais dans le navigateur.
 */

/** Décalage de Libreville par rapport à UTC (UTC+1 toute l'année). */
const DECALAGE_LIBREVILLE_MS = 60 * 60 * 1000;
const JOUR_MS = 24 * 60 * 60 * 1000;
const SEMAINE_MS = 7 * JOUR_MS;

const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date AAAA-MM-JJ → minuit UTC de ce jour (sert uniquement aux calculs de calendrier). */
function minuitUtc(jour: string): Date {
  if (!FORMAT_DATE.test(jour)) throw new Error(`Date invalide : ${jour}`);
  const date = new Date(`${jour}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== jour) throw new Error(`Date invalide : ${jour}`);
  return date;
}

const versJour = (date: Date): string => date.toISOString().slice(0, 10);

export function estLundi(jour: string): boolean {
  try {
    return minuitUtc(jour).getUTCDay() === 1;
  } catch {
    return false;
  }
}

/** Lundi de la semaine en cours à Libreville. */
export function lundiCourant(maintenant: Date = new Date()): string {
  const local = new Date(maintenant.getTime() + DECALAGE_LIBREVILLE_MS);
  const jourSemaine = (local.getUTCDay() + 6) % 7; // 0 = lundi
  const lundi = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - jourSemaine * JOUR_MS);
  return versJour(lundi);
}

export function ajouterSemaines(lundi: string, nombre: number): string {
  return versJour(new Date(minuitUtc(lundi).getTime() + nombre * SEMAINE_MS));
}

/** Les `nombre` lundis consécutifs à partir de `lundi`. */
export function semainesPeriode(lundi: string, nombre: number): string[] {
  return Array.from({ length: Math.max(0, nombre) }, (_, i) => ajouterSemaines(lundi, i));
}

/** Instants de début (lundi 00:00 Libreville) et de fin (dimanche 23:59:59.999 Libreville). */
export function bornesPeriode(lundi: string, nombre: number): { date_debut: Date; date_fin: Date } {
  const debut = new Date(minuitUtc(lundi).getTime() - DECALAGE_LIBREVILLE_MS);
  return { date_debut: debut, date_fin: new Date(debut.getTime() + nombre * SEMAINE_MS - 1) };
}

/** Semaines proposées à la réservation : à partir de la semaine prochaine, sur l'horizon donné. */
export function semainesReservables(horizon: number, maintenant: Date = new Date()): string[] {
  return semainesPeriode(ajouterSemaines(lundiCourant(maintenant), 1), horizon);
}

/**
 * Vérifie qu'une période peut être réservée : commence un lundi, pas avant la semaine prochaine
 * (la semaine en cours est déjà entamée) et se termine dans l'horizon de réservation.
 * Renvoie un message d'erreur, ou null si la période est valide.
 */
export function erreurPeriode(
  lundi: string | null | undefined,
  nombre: number,
  horizon: number,
  maintenant: Date = new Date(),
  semaineEnCoursAutorisee = false
): string | null {
  if (!lundi || !estLundi(lundi)) return 'La première semaine doit commencer un lundi';
  if (!Number.isInteger(nombre) || nombre < 1) return 'Choisissez au moins une semaine';
  const courant = lundiCourant(maintenant);
  const premiere = semaineEnCoursAutorisee ? courant : ajouterSemaines(courant, 1);
  if (lundi < premiere) {
    return semaineEnCoursAutorisee ? 'Cette semaine est déjà passée' : 'La semaine en cours est déjà entamée : choisissez à partir de la semaine prochaine';
  }
  const derniere = ajouterSemaines(lundi, nombre - 1);
  if (derniere > ajouterSemaines(courant, horizon)) return `Réservation possible au plus ${horizon} semaines à l'avance`;
  return null;
}

/** « lun. 12 oct. → dim. 18 oct. 2026 » pour les messages et notifications. */
export function libellePeriode(lundi: string, nombre: number): string {
  const debut = minuitUtc(lundi);
  const fin = new Date(debut.getTime() + nombre * SEMAINE_MS - JOUR_MS);
  const format = (date: Date, annee: boolean) =>
    date.toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', ...(annee ? { year: 'numeric' } : {}) });
  return `${format(debut, false)} → ${format(fin, true)}`;
}
