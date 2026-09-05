import cron, { ScheduledTask } from 'node-cron';
import { query } from '../config/database';

/**
 * Service pour gérer les tâches planifiées (cron jobs)
 */
export class CronService {
  private static jobs: Map<string, ScheduledTask> = new Map();

  /**
   * Initialise tous les cron jobs
   */
  static init(): void {
    console.log('[CronService] Initialisation des tâches planifiées...');

    // Tâche pour retirer le statut 'nouveau' des produits
    this.scheduleRetirerStatutNouveauProduits();

    // Tâche pour expirer les transactions en attente
    this.scheduleExpirerTransactions();

    // Tâche pour nettoyer les anciennes vues
    this.scheduleNettoyerAnciennesVues();

    // Tâche pour annuler les commandes orphelines
    this.scheduleAnnulerCommandesOrphelines();

    // Tâche pour notifier les affiliés de leurs commissions en attente
    this.scheduleNotifierCommissionsAffiliees();

    console.log('[CronService] Tâches planifiées initialisées avec succès');
  }

  /**
   * Planifie la tâche pour retirer le statut 'nouveau' des produits
   * S'exécute tous les jours à 2h du matin
   */
  static scheduleRetirerStatutNouveauProduits(): void {
    const jobName = 'retirer-statut-nouveau-produits';

    // Planifier l'exécution tous les jours à 2h du matin
    // Format cron: seconde minute heure jour mois jour_semaine
    // '0 2 * * *' = tous les jours à 2h00
    const task = cron.schedule('0 2 * * *', async () => {
      console.log('[CronService] Début de la tâche: retirer le statut nouveau des produits');

      try {
        const result = await this.retirerStatutNouveauProduits();
        console.log(`[CronService] Tâche terminée: ${result.count} produit(s) mis à jour`);
      } catch (error) {
        console.error('[CronService] Erreur lors de la tâche:', error);
      }
    });

    this.jobs.set(jobName, task);
    console.log(`[CronService] Tâche planifiée: ${jobName} - Tous les jours à 2h00`);
  }

  /**
   * Retire le statut 'nouveau' des produits créés il y a plus de 7 jours
   */
  static async retirerStatutNouveauProduits(): Promise<{ count: number }> {
    try {
      // Appeler la fonction SQL dédiée
      const { rows } = await query<{ count: number }>(
        `SELECT retirer_statut_nouveau_produits() AS count`
      );

      return { count: Number(rows[0]?.count) || 0 };
    } catch (error) {
      console.error('[CronService] Exception dans retirerStatutNouveauProduits:', error);
      throw error;
    }
  }

  /**
   * Obtient les statistiques sur les produits avec le statut 'nouveau'
   */
  static async getStatsProduitNouveau(): Promise<{
    total_produits: number;
    produits_nouveau: number;
    produits_nouveau_recents: number;
    produits_nouveau_anciens: number;
  }> {
    try {
      const { rows } = await query<{
        total_produits: number;
        produits_nouveau: number;
        produits_nouveau_recents: number;
        produits_nouveau_anciens: number;
      }>(`SELECT * FROM stats_produits_nouveau()`);

      return rows[0] || {
        total_produits: 0,
        produits_nouveau: 0,
        produits_nouveau_recents: 0,
        produits_nouveau_anciens: 0
      };
    } catch (error) {
      console.error('[CronService] Exception dans getStatsProduitNouveau:', error);
      throw error;
    }
  }

  /**
   * Arrête une tâche planifiée spécifique
   */
  static stopJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      this.jobs.delete(jobName);
      console.log(`[CronService] Tâche arrêtée: ${jobName}`);
      return true;
    }
    console.warn(`[CronService] Tâche introuvable: ${jobName}`);
    return false;
  }

  /**
   * Arrête toutes les tâches planifiées
   */
  static stopAll(): void {
    console.log('[CronService] Arrêt de toutes les tâches planifiées...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`[CronService] Tâche arrêtée: ${name}`);
    });
    this.jobs.clear();
    console.log('[CronService] Toutes les tâches ont été arrêtées');
  }

  /**
   * Démarre une tâche planifiée spécifique
   */
  static startJob(jobName: string): boolean {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      console.log(`[CronService] Tâche démarrée: ${jobName}`);
      return true;
    }
    console.warn(`[CronService] Tâche introuvable: ${jobName}`);
    return false;
  }

  /**
   * Liste toutes les tâches planifiées
   */
  static listJobs(): string[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * Exécute manuellement la tâche de retrait du statut 'nouveau'
   * Utile pour les tests ou l'exécution à la demande
   */
  static async executeRetirerStatutNouveauManually(): Promise<{ count: number }> {
    console.log('[CronService] Exécution manuelle: retirer le statut nouveau des produits');
    return await this.retirerStatutNouveauProduits();
  }

  /**
   * Planifie la tâche de réconciliation des paiements en attente
   * S'exécute toutes les 15 minutes (fallback si cron externe indisponible)
   */
  static scheduleExpirerTransactions(): void {
    const jobName = 'expirer-transactions-en-attente';

    const task = cron.schedule('*/15 * * * *', async () => {
      console.log('[CronService] Début de la tâche: réconciliation paiements stale');

      try {
        const result = await this.expirerTransactions();
        console.log(
          `[CronService] Réconciliation terminée: ${result.confirmations} confirmation(s), ${result.echecs_notifies} échec(s) notifié(s), ${result.erreurs} erreur(s)`
        );
      } catch (error) {
        console.error('[CronService] Erreur lors de la tâche:', error);
      }
    });

    this.jobs.set(jobName, task);
    console.log(`[CronService] Tâche planifiée: ${jobName} - Toutes les 15 minutes (préférer cron externe)`);
  }

  /**
   * Réconcilie les transactions en_attente via Ebilling (seuil PAYMENT_RECONCILE_AFTER_MINUTES)
   */
  static async expirerTransactions(): Promise<{
    confirmations: number;
    echecs_notifies: number;
    erreurs: number;
    timeout_minutes: number;
    examined: number;
    count: number;
  }> {
    try {
      const { PaiementController } = await import('../controllers/paiement.controller');
      const result = await PaiementController.reconcileStalePayments();
      return {
        ...result,
        count: result.confirmations + result.echecs_notifies,
      };
    } catch (error) {
      console.error('[CronService] Exception dans expirerTransactions/reconcile:', error);
      throw error;
    }
  }

  /**
   * Exécute manuellement la réconciliation des paiements
   */
  static async executeExpirerTransactionsManually(): Promise<{
    confirmations: number;
    echecs_notifies: number;
    erreurs: number;
    timeout_minutes: number;
    examined: number;
    count: number;
  }> {
    console.log('[CronService] Exécution manuelle: réconciliation paiements stale');
    return await this.expirerTransactions();
  }

  /**
   * Planifie la tâche pour nettoyer les anciennes vues
   * S'exécute tous les premiers du mois à 3h du matin
   */
  static scheduleNettoyerAnciennesVues(): void {
    const jobName = 'nettoyer-anciennes-vues';

    // Planifier l'exécution le 1er de chaque mois à 3h00
    // Format cron: '0 3 1 * *' = le 1er de chaque mois à 3h00
    const task = cron.schedule('0 3 1 * *', async () => {
      console.log('[CronService] Début de la tâche: nettoyer les anciennes vues');

      try {
        const result = await this.nettoyerAnciennesVues();
        console.log(`[CronService] Tâche terminée: ${result.count} vue(s) supprimée(s)`);
      } catch (error) {
        console.error('[CronService] Erreur lors de la tâche:', error);
      }
    });

    this.jobs.set(jobName, task);
    console.log(`[CronService] Tâche planifiée: ${jobName} - Le 1er de chaque mois à 3h00`);
  }

  /**
   * Nettoie les vues plus anciennes que X jours
   * @param joursRetention Nombre de jours à conserver (défaut: 30)
   */
  static async nettoyerAnciennesVues(joursRetention: number = 30): Promise<{ count: number }> {
    try {
      console.log(`[CronService] Nettoyage des vues de plus de ${joursRetention} jours`);

      // Appeler la fonction SQL dédiée
      const { rows } = await query<{ count: number }>(
        `SELECT nettoyer_anciennes_vues($1) AS count`,
        [joursRetention]
      );

      const count = Number(rows[0]?.count) || 0;
      console.log(`[CronService] ${count} vue(s) supprimée(s) (plus de ${joursRetention} jours)`);

      return { count };
    } catch (error) {
      console.error('[CronService] Exception dans nettoyerAnciennesVues:', error);
      throw error;
    }
  }

  /**
   * Nettoie toutes les vues sauf celles du mois en cours
   * Supprime les vues dont la date est antérieure au 1er jour du mois actuel
   */
  static async nettoyerVuesHorsMoisEnCours(): Promise<{ count: number; mois_conserve: string }> {
    try {
      // Le 1er jour du mois est calculé par la base : le faire côté
      // application décalerait la borne du fuseau horaire du serveur
      const { rows: bornes } = await query<{ mois_conserve: string }>(
        `SELECT to_char(date_trunc('month', NOW()), 'YYYY-MM') AS mois_conserve`
      );
      const moisConserve = bornes[0].mois_conserve;

      console.log(`[CronService] Conservation des vues du mois: ${moisConserve}`);

      // Supprimer toutes les vues antérieures au 1er jour du mois en cours.
      // Le comptage porte sur les lignes réellement supprimées, plutôt que
      // sur un dénombrement préalable qui pourrait diverger.
      const { rows } = await query<{ id: number }>(
        `DELETE FROM vues_tracking WHERE date_vue < date_trunc('month', NOW()) RETURNING id`
      );

      const nombreSupprimes = rows.length;
      console.log(`[CronService] ${nombreSupprimes} vue(s) supprimée(s) (antérieures à ${moisConserve})`);

      return { 
        count: nombreSupprimes,
        mois_conserve: moisConserve
      };
    } catch (error) {
      console.error('[CronService] Exception dans nettoyerVuesHorsMoisEnCours:', error);
      throw error;
    }
  }

  /**
   * Exécute manuellement la tâche de nettoyage des anciennes vues
   * @param joursRetention Nombre de jours à conserver (défaut: 30)
   */
  static async executeNettoyerAnciennesVuesManually(joursRetention: number = 30): Promise<{ count: number }> {
    console.log(`[CronService] Exécution manuelle: nettoyer les vues de plus de ${joursRetention} jours`);
    return await this.nettoyerAnciennesVues(joursRetention);
  }

  /**
   * Exécute manuellement le nettoyage des vues hors mois en cours
   * Supprime toutes les vues sauf celles du mois actuel
   */
  static async executeNettoyerVuesMoisEnCoursManually(): Promise<{ count: number; mois_conserve: string }> {
    console.log('[CronService] Exécution manuelle: nettoyer toutes les vues sauf le mois en cours');
    return await this.nettoyerVuesHorsMoisEnCours();
  }

  /**
   * Planifie la tâche pour annuler les commandes orphelines
   * S'exécute toutes les 30 minutes
   */
  static scheduleAnnulerCommandesOrphelines(): void {
    const jobName = 'annuler-commandes-orphelines';

    const task = cron.schedule('*/30 * * * *', async () => {
      console.log('[CronService] Début de la tâche: annuler les commandes orphelines');

      try {
        const result = await this.annulerCommandesOrphelines();
        console.log(`[CronService] Tâche terminée: ${result.nbAnnulees} commande(s) orpheline(s) annulée(s)`);
      } catch (error) {
        console.error('[CronService] Erreur lors de la tâche:', error);
      }
    });

    this.jobs.set(jobName, task);
    console.log(`[CronService] Tâche planifiée: ${jobName} - Toutes les 30 minutes`);
  }

  /**
   * Annule les commandes orphelines
   */
  static async annulerCommandesOrphelines(
    delaiHeures: number = 1
  ): Promise<{ nbAnnulees: number; notificationsEnvoyees: number }> {
    try {
      const { CommandeModel } = await import('../models/commande.model');
      return await CommandeModel.annulerCommandesOrphelines(delaiHeures);
    } catch (error) {
      console.error('[CronService] Exception dans annulerCommandesOrphelines:', error);
      throw error;
    }
  }

  /**
   * Exécute manuellement la tâche d'annulation des commandes orphelines
   */
  static async executeAnnulerCommandesOrphelinesManually(
    delaiHeures: number = 1
  ): Promise<{ nbAnnulees: number; notificationsEnvoyees: number }> {
    console.log(`[CronService] Exécution manuelle: annuler les commandes orphelines de plus de ${delaiHeures}h`);
    return await this.annulerCommandesOrphelines(delaiHeures);
  }

  /**
   * Planifie la notification des affiliés pour leurs commissions en attente
   * S'exécute toutes les 5 minutes
   */
  static scheduleNotifierCommissionsAffiliees(): void {
    const jobName = 'notifier-commissions-affiliees';

    const task = cron.schedule('*/5 * * * *', async () => {
      console.log('[CronService] Début de la tâche: notifier les commissions affiliées en attente');

      try {
        const result = await this.notifierCommissionsAffiliees();
        console.log(
          `[CronService] Tâche terminée: ${result.notifiees} commission(s) notifiée(s), ${result.erreurs} erreur(s)`
        );
      } catch (error) {
        console.error('[CronService] Erreur lors de la tâche:', error);
      }
    });

    this.jobs.set(jobName, task);
    console.log(`[CronService] Tâche planifiée: ${jobName} - Toutes les 5 minutes`);
  }

  /**
   * Notifie (email + WhatsApp) les affiliés dont une commission vient d'être créée
   */
  static async notifierCommissionsAffiliees(): Promise<{ notifiees: number; erreurs: number }> {
    try {
      const { AffiliateNotificationService } = await import('../services/affiliate-notification.service');
      return await AffiliateNotificationService.notifierCommissionsEnAttente();
    } catch (error) {
      console.error('[CronService] Exception dans notifierCommissionsAffiliees:', error);
      throw error;
    }
  }

  /**
   * Exécute manuellement la notification des commissions affiliées
   */
  static async executeNotifierCommissionsAffilieesManually(): Promise<{ notifiees: number; erreurs: number }> {
    console.log('[CronService] Exécution manuelle: notifier les commissions affiliées en attente');
    return await this.notifierCommissionsAffiliees();
  }
}

