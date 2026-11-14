/**
 * Règle de la livraison automatique des commandes confirmées (cron GET /cron/livraison-auto).
 *
 * Une commande « confirmée » passe en « livrée » `joursLivraison` jours après sa confirmation, après
 * 2 e-mails de rappel au vendeur (J-3 puis J-1 avant l'échéance : J+7 puis J+9 par défaut).
 * Fonction pure : aucune lecture de base ni d'horloge, pour être testable.
 */

export type DecisionLivraisonAuto = 'rappel_1' | 'rappel_2' | 'livrer' | 'rien';

export interface ParametresLivraisonAuto {
  /** Âge (jours depuis la confirmation) auquel la commande passe en livrée. */
  joursLivraison: number;
  /** Âge du premier rappel. */
  joursRappel1: number;
  /** Âge du second rappel. */
  joursRappel2: number;
  /** Délai minimal entre deux étapes (rappel 1 → rappel 2 → livraison) : le vendeur doit avoir le temps de réagir. */
  delaiMinApresRappelHeures: number;
}

export interface EntreeLivraisonAuto {
  rappelsEnvoyes: number;
  dateConfirmation: Date | null | undefined;
  dateDernierRappel: Date | null | undefined;
  maintenant: Date;
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;
const MS_PAR_HEURE = 60 * 60 * 1000;

export const JOURS_LIVRAISON_PAR_DEFAUT = 10;

/** Paramètres lus dans l'environnement (`LIVRAISON_AUTO_JOURS`, 3 jours minimum), défauts J+7 / J+9 / J+10. */
export function lireParametresLivraisonAuto(env: NodeJS.ProcessEnv = process.env): ParametresLivraisonAuto {
  const brut = parseInt(env.LIVRAISON_AUTO_JOURS ?? '', 10);
  const joursLivraison = Number.isFinite(brut) && brut >= 3 ? brut : JOURS_LIVRAISON_PAR_DEFAUT;
  return {
    joursLivraison,
    joursRappel1: joursLivraison - 3,
    joursRappel2: joursLivraison - 1,
    delaiMinApresRappelHeures: 20
  };
}

/** Interrupteur de sécurité : `LIVRAISON_AUTO_ACTIVE=false` coupe tout (rappels et livraisons). */
export function livraisonAutoActive(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LIVRAISON_AUTO_ACTIVE ?? 'true').trim().toLowerCase() !== 'false';
}

/**
 * Date et délai annoncés au vendeur dans un rappel, d'après le calendrier réellement possible :
 * jamais avant J+`joursLivraison`, et jamais avant 1 étape de `delaiMinApresRappelHeures` par étape
 * restante (le rappel 2 puis la livraison pour le rappel 1 ; la livraison seule pour le rappel 2).
 * Une commande déjà ancienne ne reçoit donc pas une date passée.
 */
export function calendrierRappel(
  rappel: 1 | 2,
  dateConfirmation: Date,
  maintenant: Date,
  parametres: ParametresLivraisonAuto = lireParametresLivraisonAuto()
): { dateLivraison: Date; joursRestants: number } {
  const etapesRestantes = rappel === 1 ? 2 : 1;
  const theorique = dateConfirmation.getTime() + parametres.joursLivraison * MS_PAR_JOUR;
  const auPlusTot = maintenant.getTime() + etapesRestantes * parametres.delaiMinApresRappelHeures * MS_PAR_HEURE;
  const dateLivraison = new Date(Math.max(theorique, auPlusTot));
  const joursRestants = Math.max(1, Math.ceil((dateLivraison.getTime() - maintenant.getTime()) / MS_PAR_JOUR));
  return { dateLivraison, joursRestants };
}

/**
 * Prochaine action pour une commande confirmée.
 * - rappel_1 : aucun rappel envoyé et âge >= joursRappel1
 * - rappel_2 : un rappel envoyé et âge >= joursRappel2
 * - livrer   : 2 rappels envoyés, âge >= joursLivraison et dernier rappel assez ancien
 * Les rappels manquants (cron interrompu) partent toujours avant la livraison, qui est alors décalée.
 */
export function decisionLivraisonAuto(
  entree: EntreeLivraisonAuto,
  parametres: ParametresLivraisonAuto = lireParametresLivraisonAuto()
): DecisionLivraisonAuto {
  const { rappelsEnvoyes, dateConfirmation, dateDernierRappel, maintenant } = entree;
  if (!dateConfirmation) return 'rien';

  const ageJours = (maintenant.getTime() - dateConfirmation.getTime()) / MS_PAR_JOUR;

  if (rappelsEnvoyes <= 0) {
    return ageJours >= parametres.joursRappel1 ? 'rappel_1' : 'rien';
  }
  // Les rappels sont toujours espacés d'au moins `delaiMinApresRappelHeures` : une commande déjà
  // ancienne (cron mis en service tardivement) reçoit un rappel par jour, pas deux d'un coup.
  if (!dateDernierRappel) return 'rien';
  const heuresDepuisRappel = (maintenant.getTime() - dateDernierRappel.getTime()) / MS_PAR_HEURE;
  if (heuresDepuisRappel < parametres.delaiMinApresRappelHeures) return 'rien';

  if (rappelsEnvoyes === 1) {
    return ageJours >= parametres.joursRappel2 ? 'rappel_2' : 'rien';
  }
  return ageJours >= parametres.joursLivraison ? 'livrer' : 'rien';
}
