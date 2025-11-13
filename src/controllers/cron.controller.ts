import { Request, Response } from 'express';
import { CronService } from '../services/cron.service';

/**
 * Contrôleur pour gérer les tâches cron
 */
export class CronController {
  /**
   * Exécute manuellement la tâche de retrait du statut "nouveau" des produits
   */
  static async executeRetirerStatutNouveau(req: Request, res: Response): Promise<void> {
    try {
      console.log('[CronController] Exécution manuelle de la tâche: retirer statut nouveau');
      
      const result = await CronService.executeRetirerStatutNouveauManually();
      
      res.status(200).json({
        success: true,
        message: 'Tâche exécutée avec succès',
        count: result.count,
        details: `${result.count} produit(s) mis à jour`
      });
    } catch (error: any) {
      console.error('[CronController] Erreur lors de l\'exécution de la tâche:', error);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'exécution de la tâche',
        error: error.message
      });
    }
  }

  /**
   * Obtient les statistiques sur les produits avec le statut "nouveau"
   */
  static async getStatsProduitNouveau(req: Request, res: Response): Promise<void> {
    try {
      console.log('[CronController] Récupération des statistiques des produits "nouveau"');
      
      const stats = await CronService.getStatsProduitNouveau();
      
      res.status(200).json({
        success: true,
        stats: {
          total_produits: stats.total_produits,
          produits_nouveau: stats.produits_nouveau,
          produits_nouveau_recents: stats.produits_nouveau_recents,
          produits_nouveau_anciens: stats.produits_nouveau_anciens,
          pourcentage_nouveau: stats.total_produits > 0 
            ? ((stats.produits_nouveau / stats.total_produits) * 100).toFixed(2) + '%'
            : '0%'
        }
      });
    } catch (error: any) {
      console.error('[CronController] Erreur lors de la récupération des statistiques:', error);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message
      });
    }
  }

  /**
   * Liste toutes les tâches cron actives
   */
  static async listCronJobs(req: Request, res: Response): Promise<void> {
    try {
      const jobs = CronService.listJobs();
      
      res.status(200).json({
        success: true,
        jobs,
        count: jobs.length
      });
    } catch (error: any) {
      console.error('[CronController] Erreur lors de la liste des tâches:', error);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la liste des tâches',
        error: error.message
      });
    }
  }

  /**
   * Arrête une tâche cron spécifique
   */
  static async stopCronJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobName } = req.params;
      
      if (!jobName) {
        res.status(400).json({
          success: false,
          message: 'Nom de la tâche requis'
        });
        return;
      }
      
      const stopped = CronService.stopJob(jobName);
      
      if (stopped) {
        res.status(200).json({
          success: true,
          message: `Tâche "${jobName}" arrêtée avec succès`
        });
      } else {
        res.status(404).json({
          success: false,
          message: `Tâche "${jobName}" introuvable`
        });
      }
    } catch (error: any) {
      console.error('[CronController] Erreur lors de l\'arrêt de la tâche:', error);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'arrêt de la tâche',
        error: error.message
      });
    }
  }

  /**
   * Démarre une tâche cron spécifique
   */
  static async startCronJob(req: Request, res: Response): Promise<void> {
    try {
      const { jobName } = req.params;
      
      if (!jobName) {
        res.status(400).json({
          success: false,
          message: 'Nom de la tâche requis'
        });
        return;
      }
      
      const started = CronService.startJob(jobName);
      
      if (started) {
        res.status(200).json({
          success: true,
          message: `Tâche "${jobName}" démarrée avec succès`
        });
      } else {
        res.status(404).json({
          success: false,
          message: `Tâche "${jobName}" introuvable`
        });
      }
    } catch (error: any) {
      console.error('[CronController] Erreur lors du démarrage de la tâche:', error);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors du démarrage de la tâche',
        error: error.message
      });
    }
  }
}

