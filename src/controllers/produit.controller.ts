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

  /**
   * Crée un nouveau produit
   */
  static async createProduit(req: Request, res: Response): Promise<void> {
    try {
      console.log('[ProduitController] Début createProduit');
      console.log('[ProduitController] Headers:', req.headers);
      console.log('[ProduitController] Body:', req.body);
      
      const produitData = req.body;
      
      // Vérifier que l'utilisateur est authentifié
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Validation des champs requis
      console.log('[ProduitController] Vérification des champs requis:', {
        nom: !!produitData.nom,
        slug: !!produitData.slug,
        prix: !!produitData.prix,
        boutique_id: !!produitData.boutique_id
      });
      
      if (!produitData.nom || !produitData.slug || !produitData.prix || !produitData.boutique_id) {
        res.status(400).json({
          success: false,
          message: 'Les champs nom, slug, prix et boutique_id sont obligatoires'
        });
        return;
      }

      // TODO: Vérifier que l'utilisateur est propriétaire de la boutique
      // const isOwner = await BoutiqueModel.isBoutiqueOwnedByVendeur(produitData.boutique_id, user.id);
      // if (!isOwner) {
      //   res.status(403).json({
      //     success: false,
      //     message: 'Vous n\'êtes pas autorisé à créer des produits pour cette boutique'
      //   });
      //   return;
      // }

      console.log('[ProduitController] Tentative de création du produit avec les données:', {
        nom: produitData.nom,
        slug: produitData.slug,
        prix: produitData.prix,
        boutique_id: produitData.boutique_id,
        // Autres champs non sensibles
        categorie_id: produitData.categorie_id,
        description: produitData.description ? 'Présent' : 'Absent'
      });
      
      const produit = await ProduitModel.createProduit(produitData);
      console.log('[ProduitController] Produit créé avec succès:', produit.id);
      
      res.status(201).json({
        success: true,
        message: 'Produit créé avec succès',
        produit
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
          message: 'Erreur lors de la création du produit',
          error: error.message
        });
      }
    }
  }

  /**
   * Met à jour un produit existant
   */
  static async updateProduit(req: Request, res: Response): Promise<void> {
    try {
      console.log('[ProduitController] Début updateProduit');
      console.log('[ProduitController] Params:', req.params);
      const id = parseInt(req.params.id);
      console.log('[ProduitController] ID extrait:', id);
      
      if (isNaN(id)) {
        console.log('[ProduitController] ID de produit invalide:', req.params.id);
        res.status(400).json({
          success: false,
          message: 'ID de produit invalide'
        });
        return;
      }

      const produitData = req.body;
      console.log('[ProduitController] Body reçu:', produitData);
      
      // Vérifier que l'utilisateur est authentifié
      const user = (req as any).user;
      console.log('[ProduitController] Utilisateur extrait:', user ? user.email || user.id : user);
      if (!user) {
        console.log('[ProduitController] Authentification requise');
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Récupérer le produit existant pour vérifier les permissions
      const existingProduit = await ProduitModel.getProduitById(id);
      console.log('[ProduitController] Produit existant:', existingProduit ? existingProduit.id : existingProduit);
      if (!existingProduit) {
        console.log('[ProduitController] Produit non trouvé pour l\'ID:', id);
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      // TODO: Vérifier que l'utilisateur est propriétaire de la boutique du produit
      // const isOwner = await BoutiqueModel.isBoutiqueOwnedByVendeur(existingProduit.boutique_id, user.id);
      // if (!isOwner) {
      //   res.status(403).json({
      //     success: false,
      //     message: 'Vous n\'êtes pas autorisé à modifier ce produit'
      //   });
      //   return;
      // }

      console.log('[ProduitController] Données envoyées à updateProduit:', produitData);
      const produit = await ProduitModel.updateProduit(id, produitData);
      console.log('[ProduitController] Produit mis à jour avec succès:', produit.id);
      
      res.status(200).json({
        success: true,
        message: 'Produit mis à jour avec succès',
        produit
      });
    } catch (error: any) {
      console.log('[ProduitController] Erreur dans updateProduit:', error.message);
      if (error.message.includes('slug existe déjà')) {
        res.status(409).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('non trouvé')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la mise à jour du produit',
          error: error.message
        });
      }
    }
  }

  /**
   * Supprime un produit
   */
  static async deleteProduit(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de produit invalide'
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

      // Récupérer le produit existant pour vérifier les permissions
      const existingProduit = await ProduitModel.getProduitById(id);
      if (!existingProduit) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      // TODO: Vérifier que l'utilisateur est propriétaire de la boutique du produit
      // const isOwner = await BoutiqueModel.isBoutiqueOwnedByVendeur(existingProduit.boutique_id, user.id);
      // if (!isOwner) {
      //   res.status(403).json({
      //     success: false,
      //     message: 'Vous n\'êtes pas autorisé à supprimer ce produit'
      //   });
      //   return;
      // }

      await ProduitModel.deleteProduit(id);
      
      res.status(200).json({
        success: true,
        message: 'Produit supprimé avec succès'
      });
    } catch (error: any) {
      if (error.message.includes('non trouvé')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('commandes associées')) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la suppression du produit',
          error: error.message
        });
      }
    }
  }

  /**
   * Récupère tous les produits d'une boutique
   */
  static async getProduitsByBoutique(req: Request, res: Response): Promise<void> {
    try {
      const boutiqueId = parseInt(req.params.boutiqueId);
      
      if (isNaN(boutiqueId)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }

      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      const page = parseInt(query.page as string) || 1;
      const limite = parseInt(query.limite as string) || 10;
      const tri_par = (query.tri_par as string) || 'date_creation';
      const ordre = ((query.ordre as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
      
      const { produits, total } = await ProduitModel.getProduitsByBoutique(boutiqueId, page, limite, tri_par, ordre);
      
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
        message: 'Erreur lors de la récupération des produits de la boutique',
        error: error.message
      });
    }
  }
}
