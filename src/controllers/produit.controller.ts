import { Request, Response } from 'express';
import { ProduitModel } from '../models/produit.model';

export class ProduitController {
  /**
   * Récupère tous les produits avec pagination
   */
  static async getAllProduits(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      const page = parseInt(query.page as string) || 1;
      const limite = parseInt(query.limite as string) || 10;
      const tri_par = (query.tri_par as string) || 'date_creation';
      const ordre = ((query.ordre as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
      
      const { produits, total } = await ProduitModel.getAllProduits(page, limite, tri_par, ordre);
      
      res.status(200).json({
        success: true,
        donnees: produits,
        total,
        page,
        limite,
        total_pages: Math.ceil(total / limite)
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits',
        error: error.message
      });
    }
  }

  /**
   * Récupère un produit par son ID
   */
  static async getProduitById(req: Request, res: Response): Promise<void> {
    try {
      const idOrSlug = req.params.id;
      let produit;
      
      // Vérifier si l'ID est un nombre ou une chaîne
      const id = parseInt(idOrSlug);
      
      if (!isNaN(id)) {
        // Si c'est un nombre, rechercher par ID
        produit = await ProduitModel.getProduitById(id);
      } else {
        // Sinon, rechercher par slug
        produit = await ProduitModel.getProduitBySlug(idOrSlug);
      }
      
      if (!produit) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        produit
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du produit',
        error: error.message
      });
    }
  }

  /**
   * Récupère un produit par son slug
   */
  static async getProduitBySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      
      const produit = await ProduitModel.getProduitBySlug(slug);
      
      if (!produit) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        produit
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du produit',
        error: error.message
      });
    }
  }

  /**
   * Récupère les produits par catégorie
   */
  static async getProduitsByCategorie(req: Request, res: Response): Promise<void> {
    try {
      const categorieId = parseInt(req.params.categorieId);
      
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      const limite = parseInt(query.limite as string) || 10;
      
      if (isNaN(categorieId)) {
        res.status(400).json({
          success: false,
          message: 'ID de catégorie invalide'
        });
        return;
      }
      
      const produits = await ProduitModel.getProduitsByCategorie(categorieId, limite);
      
      res.status(200).json({
        success: true,
        produits
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits par catégorie',
        error: error.message
      });
    }
  }

  /**
   * Récupère les produits les plus importants par catégorie
   */
  static async getTopProduitsByCategories(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      const limite = parseInt(query.limite as string) || 4;
      const boutiqueId = query.boutique_id ? parseInt(query.boutique_id as string) : undefined;
      
      // Vérifier si boutiqueId est un nombre valide
      if (query.boutique_id && isNaN(boutiqueId as number)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      const produitsByCategories = await ProduitModel.getTopProduitsByCategories(limite, boutiqueId);
      
      res.status(200).json({
        success: true,
        categories: produitsByCategories
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits par catégorie',
        error: error.message
      });
    }
  }
}
