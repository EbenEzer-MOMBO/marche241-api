import { Request, Response } from 'express';
import { PanierModel } from '../models/panier.model';
import { Panier } from '../lib/database-types';

export class PanierController {
  /**
   * Récupère le panier d'une session
   */
  static async getPanier(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: 'ID de session invalide'
        });
        return;
      }

      const panierItems = await PanierModel.getPanierBySessionId(sessionId);

      res.status(200).json({
        success: true,
        panier: panierItems
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du panier',
        error: error.message
      });
    }
  }

  /**
   * Récupère un élément du panier par son ID
   */
  static async getPanierItemById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID d\'élément de panier invalide'
        });
        return;
      }

      const panierItem = await PanierModel.getPanierItemById(id);
      
      if (!panierItem) {
        res.status(404).json({
          success: false,
          message: 'Élément du panier non trouvé'
        });
        return;
      }

      res.status(200).json({
        success: true,
        item: panierItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de l\'élément du panier',
        error: error.message
      });
    }
  }

  /**
   * Ajoute un produit au panier
   */
  static async addToCart(req: Request, res: Response): Promise<void> {
    try {
      const { session_id, boutique_id, produit_id, quantite, variants_selectionnes } = req.body;
      
      // Vérifier que les champs obligatoires sont présents
      if (!session_id || !boutique_id || !produit_id || !quantite) {
        res.status(400).json({
          success: false,
          message: 'Les champs session_id, boutique_id, produit_id et quantite sont obligatoires'
        });
        return;
      }

      // Vérifier que la quantité est positive
      if (quantite <= 0) {
        res.status(400).json({
          success: false,
          message: 'La quantité doit être supérieure à 0'
        });
        return;
      }

      const panierItem = await PanierModel.addToCart({
        session_id,
        boutique_id,
        produit_id,
        quantite,
        variants_selectionnes
      });

      res.status(201).json({
        success: true,
        message: 'Produit ajouté au panier avec succès',
        item: panierItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout au panier',
        error: error.message
      });
    }
  }

  /**
   * Met à jour la quantité d'un élément du panier
   */
  static async updateCartItemQuantity(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { quantite } = req.body;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID d\'élément de panier invalide'
        });
        return;
      }
      
      // Vérifier que la quantité est présente et positive
      if (!quantite || quantite <= 0) {
        res.status(400).json({
          success: false,
          message: 'La quantité doit être présente et supérieure à 0'
        });
        return;
      }
      
      // Vérifier si l'élément existe
      const existingItem = await PanierModel.getPanierItemById(id);
      if (!existingItem) {
        res.status(404).json({
          success: false,
          message: 'Élément du panier non trouvé'
        });
        return;
      }

      const updatedItem = await PanierModel.updateCartItemQuantity(id, quantite);

      res.status(200).json({
        success: true,
        message: 'Quantité mise à jour avec succès',
        item: updatedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la quantité',
        error: error.message
      });
    }
  }

  /**
   * Met à jour les variants sélectionnés d'un élément du panier
   */
  static async updateCartItemVariants(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { variants_selectionnes } = req.body;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID d\'élément de panier invalide'
        });
        return;
      }
      
      // Vérifier que les variants sont présents
      if (!variants_selectionnes) {
        res.status(400).json({
          success: false,
          message: 'Les variants sélectionnés sont obligatoires'
        });
        return;
      }
      
      // Vérifier si l'élément existe
      const existingItem = await PanierModel.getPanierItemById(id);
      if (!existingItem) {
        res.status(404).json({
          success: false,
          message: 'Élément du panier non trouvé'
        });
        return;
      }

      const updatedItem = await PanierModel.updateCartItemVariants(id, variants_selectionnes);

      res.status(200).json({
        success: true,
        message: 'Variants mis à jour avec succès',
        item: updatedItem
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour des variants',
        error: error.message
      });
    }
  }

  /**
   * Supprime un élément du panier
   */
  static async removeFromCart(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID d\'élément de panier invalide'
        });
        return;
      }
      
      // Vérifier si l'élément existe
      const existingItem = await PanierModel.getPanierItemById(id);
      if (!existingItem) {
        res.status(404).json({
          success: false,
          message: 'Élément du panier non trouvé'
        });
        return;
      }

      await PanierModel.removeFromCart(id);

      res.status(200).json({
        success: true,
        message: 'Élément supprimé du panier avec succès'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de l\'élément du panier',
        error: error.message
      });
    }
  }

  /**
   * Vide le panier d'une session
   */
  static async clearCart(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: 'ID de session invalide'
        });
        return;
      }

      await PanierModel.clearCart(sessionId);

      res.status(200).json({
        success: true,
        message: 'Panier vidé avec succès'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du panier',
        error: error.message
      });
    }
  }

  /**
   * Compte le nombre d'articles dans le panier
   */
  static async countCartItems(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: 'ID de session invalide'
        });
        return;
      }

      const count = await PanierModel.countCartItems(sessionId);

      res.status(200).json({
        success: true,
        count
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du comptage des éléments du panier',
        error: error.message
      });
    }
  }
}
