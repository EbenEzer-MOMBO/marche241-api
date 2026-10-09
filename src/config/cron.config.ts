/**
 * Interrupteurs des tâches lancées par le processus de l'API lui-même.
 *
 * Quand les tâches sont pilotées de l'extérieur (cron-job.org), elles doivent
 * être coupées ici, sinon chacune s'exécute deux fois.
 */
const VALEURS_DESACTIVEES = new Set(['false', '0', 'off', 'no', 'non']);

function actifParDefaut(valeur: string | undefined): boolean {
  return !VALEURS_DESACTIVEES.has((valeur ?? '').trim().toLowerCase());
}

/** Les 7 tâches node-cron de CronService.init(). Actif sauf CRON_INTERNE_ACTIVE=false (ou 0, off, no). */
export function cronInterneActif(env: NodeJS.ProcessEnv = process.env): boolean {
  return actifParDefaut(env.CRON_INTERNE_ACTIVE);
}

/** Auto-ping de /health toutes les 14 min (anti-veille). Actif sauf MONITOR_AUTOPING_ACTIVE=false (ou 0, off, no). */
export function autoPingActif(env: NodeJS.ProcessEnv = process.env): boolean {
  return actifParDefaut(env.MONITOR_AUTOPING_ACTIVE);
}
