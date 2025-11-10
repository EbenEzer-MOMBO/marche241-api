import { Request, Response } from 'express';
import { CommuneModel } from '../models/commune.model';
import { CommuneLivraison } from '../lib/database-types';

export class CommuneController {
  /**
   * Récupère toutes les communes de livraison
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getAllCommunes(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      // Récupérer le paramètre boutique_id s'il existe
      const boutiqueId = query.boutique_id ? parseInt(query.boutique_id as string) : undefined;
      
      // Vérifier si boutiqueId est un nombre valide
      if (query.boutique_id && isNaN(boutiqueId as number)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      // Récupérer les communes
      const communes = await CommuneModel.getAllCommunes(boutiqueId);
      
      res.status(200).json({
        success: true,
        communes
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des communes',
        error: error.message
      });
    }
  }

  /**
   * Récupère les communes d'une boutique spécifique
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getCommunesByBoutiqueId(req: Request, res: Response): Promise<void> {
    try {
      const boutiqueId = parseInt(req.params.boutiqueId);
      
      if (isNaN(boutiqueId)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      const communes = await CommuneModel.getCommunesByBoutiqueId(boutiqueId);
      
      res.status(200).json({
        success: true,
        communes
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des communes de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Récupère les communes actives d'une boutique spécifique
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getActiveCommunesByBoutiqueId(req: Request, res: Response): Promise<void> {
    try {
      const boutiqueId = parseInt(req.params.boutiqueId);
      
      if (isNaN(boutiqueId)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      const communes = await CommuneModel.getActiveCommunesByBoutiqueId(boutiqueId);
      
      res.status(200).json({
        success: true,
        communes
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des communes actives de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Récupère les communes de livraison actives
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getActiveCommunes(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      // Récupérer le paramètre boutique_id s'il existe
      const boutiqueId = query.boutique_id ? parseInt(query.boutique_id as string) : undefined;
      
      // Vérifier si boutiqueId est un nombre valide
      if (query.boutique_id && isNaN(boutiqueId as number)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      // Récupérer les communes actives
      const communes = await CommuneModel.getActiveCommunes(boutiqueId);
      
      res.status(200).json({
        success: true,
        communes
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des communes actives',
        error: error.message
      });
    }
  }

  /**
   * Récupère une commune par son ID
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getCommuneById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commune invalide'
        });
        return;
      }
      
      const commune = await CommuneModel.getCommuneById(id);
      
      if (!commune) {
        res.status(404).json({
          success: false,
          message: 'Commune non trouvée'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        commune
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la commune',
        error: error.message
      });
    }
  }

  /**
   * Crée une nouvelle commune de livraison
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async createCommune(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      console.log('[createCommune] Données reçues:', body);
      console.log('[createCommune] Utilisateur authentifié:', req.user ? { id: req.user.id, email: req.user.email } : 'non authentifié');
      
      const commune = await CommuneModel.createCommune(body);
      
      console.log('[createCommune] Commune créée:', commune);
      
      res.status(201).json({
        success: true,
        message: 'Commune créée avec succès',
        commune
      });
    } catch (error: any) {
      console.error('[createCommune] Erreur:', error);
      console.error('[createCommune] Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la commune',
        error: error.message
      });
    }
  }

  /**
   * Met à jour une commune existante
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async updateCommune(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commune invalide'
        });
        return;
      }
      
      // Vérifier si la commune existe
      const existingCommune = await CommuneModel.getCommuneById(id);
      
      if (!existingCommune) {
        res.status(404).json({
          success: false,
          message: 'Commune non trouvée'
        });
        return;
      }
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      const updatedCommune = await CommuneModel.updateCommune(id, body);
      
      res.status(200).json({
        success: true,
        message: 'Commune mise à jour avec succès',
        commune: updatedCommune
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la commune',
        error: error.message
      });
    }
  }

  /**
   * Active ou désactive une commune
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async toggleCommuneStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commune invalide'
        });
        return;
      }
      
      // Vérifier si la commune existe
      const existingCommune = await CommuneModel.getCommuneById(id);
      
      if (!existingCommune) {
        res.status(404).json({
          success: false,
          message: 'Commune non trouvée'
        });
        return;
      }
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      const isActive = body.est_active !== undefined ? body.est_active : !existingCommune.est_active;
      
      const updatedCommune = await CommuneModel.toggleCommuneStatus(id, isActive);
      
      res.status(200).json({
        success: true,
        message: `Commune ${isActive ? 'activée' : 'désactivée'} avec succès`,
        commune: updatedCommune
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du changement de statut de la commune',
        error: error.message
      });
    }
  }

  /**
   * Supprime une commune
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async deleteCommune(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commune invalide'
        });
        return;
      }
      
      // Vérifier si la commune existe
      const existingCommune = await CommuneModel.getCommuneById(id);
      
      if (!existingCommune) {
        res.status(404).json({
          success: false,
          message: 'Commune non trouvée'
        });
        return;
      }
      
      await CommuneModel.deleteCommune(id);
      
      res.status(200).json({
        success: true,
        message: 'Commune supprimée avec succès'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la commune',
        error: error.message
      });
    }
  }
}
