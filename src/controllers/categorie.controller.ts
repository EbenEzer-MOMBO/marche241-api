import { Request, Response } from 'express';
import { CategorieModel } from '../models/categorie.model';

export class CategorieController {
  /**
   * Récupère toutes les catégories
   * @param req Requête HTTP avec paramètre boutique_id optionnel
   * @param res Réponse HTTP
   */
  static async getAllCategories(req: Request, res: Response): Promise<void> {
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
      
      const categories = await CategorieModel.getAllCategories(boutiqueId);
      
      res.status(200).json({
        success: true,
        categories
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des catégories',
        error: error.message
      });
    }
  }

  /**
   * Récupère une catégorie par son ID
   */
  static async getCategorieById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de catégorie invalide'
        });
        return;
      }
      
      const categorie = await CategorieModel.getCategorieById(id);
      
      if (!categorie) {
        res.status(404).json({
          success: false,
          message: 'Catégorie non trouvée'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        categorie
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la catégorie',
        error: error.message
      });
    }
  }

  /**
   * Récupère une catégorie par son slug
   */
  static async getCategorieBySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      
      const categorie = await CategorieModel.getCategorieBySlug(slug);
      
      if (!categorie) {
        res.status(404).json({
          success: false,
          message: 'Catégorie non trouvée'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        categorie
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la catégorie',
        error: error.message
      });
    }
  }
}
