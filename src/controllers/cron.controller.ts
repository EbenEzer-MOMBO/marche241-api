import { Request, Response } from 'express';
import { CronService } from '../services/cron.service';
import { VueModel } from '../models/vue.model';

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

  /**
   * Route publique pour exécuter toutes les tâches cron planifiées
   * À appeler depuis un cron job externe (cPanel, etc.)
   * 
   * GET /api/v1/cron/tasks
   * 
   * Paramètres query optionnels:
   * - key: Clé secrète pour sécuriser l'accès (optionnel)
   */
  static async executeAllTasks(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    console.log('[CronController] ===== EXÉCUTION DES TÂCHES CRON =====');
    console.log('[CronController] Date:', new Date().toISOString());

    const results: {
      task: string;
      success: boolean;
      result?: any;
      error?: string;
      duration?: number;
    }[] = [];

    // Vérification optionnelle de la clé secrète
    const cronKey = process.env.CRON_SECRET_KEY;
    const providedKey = req.query.key as string;

    if (cronKey && providedKey !== cronKey) {
      console.log('[CronController] Clé invalide ou manquante');
      res.status(401).json({
        success: false,
        message: 'Clé d\'authentification invalide'
      });
      return;
    }

    try {
      // Tâche 1: Retirer le statut "nouveau" des produits anciens
      const task1Start = Date.now();
      try {
        console.log('[CronController] Tâche 1: Retirer statut nouveau des produits');
        const result = await CronService.executeRetirerStatutNouveauManually();
        results.push({
          task: 'retirer_statut_nouveau',
          success: true,
          result: { produits_mis_a_jour: result.count },
          duration: Date.now() - task1Start
        });
        console.log(`[CronController] Tâche 1 terminée: ${result.count} produit(s) mis à jour`);
      } catch (error: any) {
        console.error('[CronController] Erreur tâche 1:', error.message);
        results.push({
          task: 'retirer_statut_nouveau',
          success: false,
          error: error.message,
          duration: Date.now() - task1Start
        });
      }

      // Tâche 2: Nettoyer les anciennes vues (> 90 jours)
      const task2Start = Date.now();
      try {
        console.log('[CronController] Tâche 2: Nettoyer les anciennes vues');
        const vuesSupprimees = await VueModel.nettoyerAnciennesVues(90);
        results.push({
          task: 'nettoyer_anciennes_vues',
          success: true,
          result: { vues_supprimees: vuesSupprimees },
          duration: Date.now() - task2Start
        });
        console.log(`[CronController] Tâche 2 terminée: ${vuesSupprimees} vue(s) supprimée(s)`);
      } catch (error: any) {
        console.error('[CronController] Erreur tâche 2:', error.message);
        results.push({
          task: 'nettoyer_anciennes_vues',
          success: false,
          error: error.message,
          duration: Date.now() - task2Start
        });
      }

      const totalDuration = Date.now() - startTime;
      const allSuccess = results.every(r => r.success);

      console.log('[CronController] ===== FIN DES TÂCHES CRON =====');
      console.log(`[CronController] Durée totale: ${totalDuration}ms`);
      console.log(`[CronController] Succès: ${allSuccess ? 'OUI' : 'PARTIEL'}`);

      res.status(allSuccess ? 200 : 207).json({
        success: allSuccess,
        message: allSuccess ? 'Toutes les tâches ont été exécutées avec succès' : 'Certaines tâches ont échoué',
        executed_at: new Date().toISOString(),
        total_duration_ms: totalDuration,
        tasks: results
      });
    } catch (error: any) {
      console.error('[CronController] Erreur globale:', error);

      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'exécution des tâches',
        error: error.message,
        executed_at: new Date().toISOString(),
        total_duration_ms: Date.now() - startTime,
        tasks: results
      });
    }
  }

  /**
   * Route de santé simple pour vérifier que le serveur est en ligne
   * GET /api/v1/health ou /health
   */
  static async healthCheck(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'Serveur en ligne'
    });
  }

  /**
   * Exécute manuellement la tâche d'expiration des transactions en attente
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async executeExpirerTransactions(req: Request, res: Response): Promise<void> {
    try {
      console.log('[CronController] Exécution manuelle de l\'expiration des transactions');

      const result = await CronService.executeExpirerTransactionsManually();

      res.status(200).json({
        success: true,
        message: `${result.count} transaction(s) expirée(s) avec succès`,
        count: result.count
      });
    } catch (error: any) {
      console.error('[CronController] Erreur lors de l\'exécution manuelle:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'expiration des transactions',
        error: error.message
      });
    }
  }
}

