import cron from 'node-cron';
import { supabaseAdmin } from '../config/supabase';

/**
 * Service pour gérer les tâches planifiées (cron jobs)
 */
export class CronService {
  private static jobs: Map<string, cron.ScheduledTask> = new Map();

  /**
   * Initialise tous les cron jobs
   */
  static init(): void {
    console.log('[CronService] Initialisation des tâches planifiées...');
    
    // Tâche pour retirer le statut 'nouveau' des produits
    this.scheduleRetirerStatutNouveauProduits();
    
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
}

