import cron, { ScheduledTask } from 'node-cron';
import { supabaseAdmin } from '../config/supabase';

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
      // Appeler la fonction SQL via RPC
      const { data, error } = await supabaseAdmin.rpc('retirer_statut_nouveau_produits');

      if (error) {
        console.error('[CronService] Erreur lors de l\'appel RPC:', error);
        throw new Error(`Erreur lors de la mise à jour des produits: ${error.message}`);
      }

      return { count: data || 0 };
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
      const { data, error } = await supabaseAdmin.rpc('stats_produits_nouveau');

      if (error) {
        console.error('[CronService] Erreur lors de l\'appel RPC stats:', error);
        throw new Error(`Erreur lors de la récupération des statistiques: ${error.message}`);
      }

      return data?.[0] || {
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
   * Planifie la tâche pour expirer les transactions en attente
   * S'exécute toutes les 15 minutes
   */
  static scheduleExpirerTransactions(): void {
    const jobName = 'expirer-transactions-en-attente';

    // Planifier l'exécution toutes les 15 minutes
    // Format cron: '*/15 * * * *' = toutes les 15 minutes
    const task = cron.schedule('*/15 * * * *', async () => {
      console.log('[CronService] Début de la tâche: expirer les transactions en attente');

      try {
        const result = await this.expirerTransactions();
        console.log(`[CronService] Tâche terminée: ${result.count} transaction(s) expirée(s)`);
      } catch (error) {
        console.error('[CronService] Erreur lors de la tâche:', error);
      }
    });

    this.jobs.set(jobName, task);
    console.log(`[CronService] Tâche planifiée: ${jobName} - Toutes les 15 minutes`);
  }

  /**
   * Expire les transactions en attente depuis plus d'1 heure
   */
  static async expirerTransactions(): Promise<{ count: number }> {
    try {
      // Importer dynamiquement pour éviter les dépendances circulaires
      const { TransactionModel } = await import('../models/transaction.model');

      const result = await TransactionModel.expirerTransactionsEnAttente();

      return { count: result.count };
    } catch (error) {
      console.error('[CronService] Exception dans expirerTransactions:', error);
      throw error;
    }
  }

  /**
   * Exécute manuellement la tâche d'expiration des transactions
   * Utile pour les tests ou l'exécution à la demande
   */
  static async executeExpirerTransactionsManually(): Promise<{ count: number }> {
    console.log('[CronService] Exécution manuelle: expirer les transactions en attente');
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

      // Appeler la fonction SQL via RPC
      const { data, error } = await supabaseAdmin.rpc('nettoyer_anciennes_vues', {
        p_jours_retention: joursRetention
      });

      if (error) {
        console.error('[CronService] Erreur lors de l\'appel RPC nettoyer_anciennes_vues:', error);
        throw new Error(`Erreur lors du nettoyage des vues: ${error.message}`);
      }

      const count = data || 0;
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
      // Calculer le 1er jour du mois en cours
      const now = new Date();
      const premierJourMois = new Date(now.getFullYear(), now.getMonth(), 1);
      const moisConserve = premierJourMois.toISOString().slice(0, 7); // Format: "2026-03"

      console.log(`[CronService] Nettoyage des vues antérieures au ${premierJourMois.toISOString()}`);
      console.log(`[CronService] Conservation des vues du mois: ${moisConserve}`);

      // Compter d'abord le nombre de vues à supprimer
      const { count: countToDelete, error: countError } = await supabaseAdmin
        .from('vues_tracking')
        .select('*', { count: 'exact', head: true })
        .lt('date_vue', premierJourMois.toISOString());

      if (countError) {
        console.error('[CronService] Erreur lors du comptage des vues:', countError);
        throw new Error(`Erreur lors du comptage des vues: ${countError.message}`);
      }

      const nombreASupprimer = countToDelete || 0;

      // Supprimer toutes les vues antérieures au 1er jour du mois en cours
      const { error } = await supabaseAdmin
        .from('vues_tracking')
        .delete()
        .lt('date_vue', premierJourMois.toISOString());

      if (error) {
        console.error('[CronService] Erreur lors de la suppression des vues:', error);
        throw new Error(`Erreur lors du nettoyage des vues: ${error.message}`);
      }

      const nombreSupprimes = nombreASupprimer;
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
}

