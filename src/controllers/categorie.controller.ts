import { Request, Response } from 'express';
import { CategorieModel, CreateCategorieData } from '../models/categorie.model';

export class CategorieController {
  /**
   * Récupère toutes les catégories
   * @param req Requête HTTP avec paramètre boutique_id optionnel
   * @param res Réponse HTTP
   */
  static async getAllCategories(req: Request, res: Response): Promise<void> {
    try {
      console.log('[CategorieController] ===== GET ALL CATEGORIES =====');
      console.log('[CategorieController] Query params:', req.query);
      
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      // Récupérer le paramètre boutique_id s'il existe
      const boutiqueId = query.boutique_id ? parseInt(query.boutique_id as string) : undefined;
      
      console.log('[CategorieController] Boutique ID parsé:', boutiqueId);
      
      // Vérifier si boutiqueId est un nombre valide
      if (query.boutique_id && isNaN(boutiqueId as number)) {
        console.log('[CategorieController] ID de boutique invalide:', query.boutique_id);
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      const categories = await CategorieModel.getAllCategories(boutiqueId);
      
      console.log('[CategorieController] Nombre de catégories retournées:', categories.length);
      console.log('[CategorieController] Catégories globales:', categories.filter(c => !c.boutique_id).length);
      console.log('[CategorieController] Catégories spécifiques:', categories.filter(c => c.boutique_id).length);
      
      res.status(200).json({
        success: true,
        categories
      });
    } catch (error: any) {
      console.error('[CategorieController] ERREUR:', error);
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

  /**
   * Crée une nouvelle catégorie
   */
  static async createCategorie(req: Request, res: Response): Promise<void> {
    try {
      const categorieData: CreateCategorieData = req.body;
      
      // Validation des champs requis
      if (!categorieData.nom || !categorieData.slug) {
        res.status(400).json({
          success: false,
          message: 'Le nom et le slug sont obligatoires'
        });
        return;
      }

      // Vérifier que l'utilisateur est authentifié et récupérer ses informations
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Si boutique_id est spécifié, vérifier que l'utilisateur en est propriétaire
      if (categorieData.boutique_id) {
        // TODO: Ajouter la vérification de propriété de la boutique
        // const isOwner = await BoutiqueModel.isBoutiqueOwnedByVendeur(categorieData.boutique_id, user.id);
        // if (!isOwner) {
        //   res.status(403).json({
        //     success: false,
        //     message: 'Vous n\'êtes pas autorisé à créer des catégories pour cette boutique'
        //   });
        //   return;
        // }
      }

      const categorie = await CategorieModel.createCategorie(categorieData);
      
      res.status(201).json({
        success: true,
        message: 'Catégorie créée avec succès',
        categorie
      });
    } catch (error: any) {
      if (error.message.includes('slug existe déjà')) {
        res.status(409).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la création de la catégorie',
          error: error.message
        });
      }
    }
  }

  /**
   * Met à jour une catégorie existante
   */
  static async updateCategorie(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de catégorie invalide'
        });
        return;
      }

      const categorieData: Partial<CreateCategorieData> = req.body;
      
      // Vérifier que l'utilisateur est authentifié
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Récupérer la catégorie existante pour vérifier les permissions
      const existingCategorie = await CategorieModel.getCategorieById(id);
      if (!existingCategorie) {
        res.status(404).json({
          success: false,
          message: 'Catégorie non trouvée'
        });
        return;
      }

      // Si la catégorie appartient à une boutique, vérifier les permissions
      if (existingCategorie.boutique_id) {
        // TODO: Ajouter la vérification de propriété de la boutique
        // const isOwner = await BoutiqueModel.isBoutiqueOwnedByVendeur(existingCategorie.boutique_id, user.id);
        // if (!isOwner) {
        //   res.status(403).json({
        //     success: false,
        //     message: 'Vous n\'êtes pas autorisé à modifier cette catégorie'
        //   });
        //   return;
        // }
      }

      const categorie = await CategorieModel.updateCategorie(id, categorieData);
      
      res.status(200).json({
        success: true,
        message: 'Catégorie mise à jour avec succès',
        categorie
      });
    } catch (error: any) {
      if (error.message.includes('slug existe déjà')) {
        res.status(409).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('non trouvée')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la mise à jour de la catégorie',
          error: error.message
        });
      }
    }
  }

  /**
   * Supprime une catégorie
   */
  static async deleteCategorie(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de catégorie invalide'
        });
        return;
      }

      // Vérifier que l'utilisateur est authentifié
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Récupérer la catégorie existante pour vérifier les permissions
      const existingCategorie = await CategorieModel.getCategorieById(id);
      if (!existingCategorie) {
        res.status(404).json({
          success: false,
          message: 'Catégorie non trouvée'
        });
        return;
      }

      // Si la catégorie appartient à une boutique, vérifier les permissions
      if (existingCategorie.boutique_id) {
        // TODO: Ajouter la vérification de propriété de la boutique
        // const isOwner = await BoutiqueModel.isBoutiqueOwnedByVendeur(existingCategorie.boutique_id, user.id);
        // if (!isOwner) {
        //   res.status(403).json({
        //     success: false,
        //     message: 'Vous n\'êtes pas autorisé à supprimer cette catégorie'
        //   });
        //   return;
        // }
      }

      await CategorieModel.deleteCategorie(id);
      
      res.status(200).json({
        success: true,
        message: 'Catégorie supprimée avec succès'
      });
    } catch (error: any) {
      if (error.message.includes('non trouvée')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('sous-catégories') || error.message.includes('produits')) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la suppression de la catégorie',
          error: error.message
        });
      }
    }
  }
}
