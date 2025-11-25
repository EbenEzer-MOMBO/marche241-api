import { Request, Response } from 'express';
import { PanierModel } from '../models/panier.model';
import { Panier } from '../lib/database-types';

export class PanierController {
  /**
   * Récupère le panier d'une session
   */
  static async getPanier(req: Request, res: Response): Promise<void> {
    try {
      console.log('[PanierController] ===== GET PANIER =====');
      const sessionId = req.params.sessionId;
      console.log('[PanierController] Session ID:', sessionId);
      
      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: 'ID de session invalide'
        });
        return;
      }

      const panierItems = await PanierModel.getPanierBySessionId(sessionId);
      console.log('[PanierController] Nombre d\'items dans le panier:', panierItems.length);
      
      // Vérifier la disponibilité et le stock de chaque produit
      const panierItemsVerifies = [];
      const produitsIndisponibles = [];
      const quantitesAjustees = [];

      for (const item of panierItems) {
        const produit = item.produit;
        
        // Vérifier si le produit existe et est actif
        if (!produit || produit.statut !== 'actif') {
          produitsIndisponibles.push({
            id: item.id,
            nom: produit?.nom || 'Produit inconnu',
            raison: 'Produit non disponible'
          });
          // Supprimer l'élément du panier
          await PanierModel.removeFromCart(item.id);
          continue;
        }

        // Calculer le stock disponible selon les variants
        let stockDisponible = produit.quantite_stock || 0;
        
        // Nouveau format des variants dans le panier:
        // variants_selectionnes = {
        //   "variant": { "nom": "zzde", "prix": 34, ... },
        //   "options": { "nombre de plats": "3" }
        // }
        
        if (item.variants_selectionnes && produit.variants) {
          console.log('[PanierController] Item avec variants:', {
            produit_id: produit.id,
            variants_selectionnes: item.variants_selectionnes
          });
          
          // Nouveau format du produit:
          // variants = {
          //   "variants": [{ "nom": "Rouge", "quantite": 10, "prix": 5000, ... }],
          //   "options": [{ "nom": "Message personnalisé", "type": "texte", ... }]
          // }
          
          const variantsData = produit.variants as any;
          
          // Vérifier si le variant sélectionné existe et a du stock
          if (item.variants_selectionnes.variant && variantsData.variants && Array.isArray(variantsData.variants)) {
            const variantSelectionne = item.variants_selectionnes.variant;
            const variantProduit = variantsData.variants.find((v: any) => v.nom === variantSelectionne.nom);
            
            if (variantProduit && typeof variantProduit.quantite === 'number') {
              stockDisponible = Math.min(stockDisponible, variantProduit.quantite);
              console.log('[PanierController] Stock du variant:', {
                nom: variantProduit.nom,
                quantite: variantProduit.quantite,
                stockDisponible
              });
            }
          }
        }
        
        if (stockDisponible === 0) {
          produitsIndisponibles.push({
            id: item.id,
            nom: produit.nom,
            raison: 'Produit en rupture de stock',
            variants: item.variants_selectionnes
          });
          // Supprimer l'élément du panier
          await PanierModel.removeFromCart(item.id);
          continue;
        }

        // Vérifier si la quantité demandée est disponible
        if (item.quantite > stockDisponible) {
          // Ajuster la quantité au stock disponible
          const nouvelleQuantite = stockDisponible;
          await PanierModel.updateCartItemQuantity(item.id, nouvelleQuantite);
          
          quantitesAjustees.push({
            id: item.id,
            nom: produit.nom,
            quantiteOriginale: item.quantite,
            nouvelleQuantite: nouvelleQuantite,
            stockDisponible: stockDisponible,
            variants: item.variants_selectionnes
          });
          
          // Mettre à jour l'item avec la nouvelle quantité
          item.quantite = nouvelleQuantite;
        }

        panierItemsVerifies.push(item);
      }

      console.log('[PanierController] Items vérifiés:', panierItemsVerifies.length);
      console.log('[PanierController] Produits indisponibles:', produitsIndisponibles.length);
      console.log('[PanierController] Quantités ajustées:', quantitesAjustees.length);

      // Préparer la réponse avec les informations de vérification
      const response: any = {
        success: true,
        panier: panierItemsVerifies
      };

      // Ajouter les avertissements si nécessaire
      if (produitsIndisponibles.length > 0 || quantitesAjustees.length > 0) {
        response.avertissements = {};
        
        if (produitsIndisponibles.length > 0) {
          response.avertissements.produitsSupprimes = produitsIndisponibles;
        }
        
        if (quantitesAjustees.length > 0) {
          response.avertissements.quantitesAjustees = quantitesAjustees;
        }
      }

      res.status(200).json(response);
    } catch (error: any) {
      console.error('[PanierController] ERREUR:', error);
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
      console.log('[PanierController] ===== ADD TO CART =====');
      const { session_id, boutique_id, produit_id, quantite, variants_selectionnes } = req.body;
      console.log('[PanierController] Données reçues:', { session_id, boutique_id, produit_id, quantite, variants_selectionnes });
            
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

      // Récupérer le produit pour vérifier le stock
      const { ProduitModel } = require('../models/produit.model');
      const produit = await ProduitModel.getProduitById(produit_id);
      
      if (!produit) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      console.log('[PanierController] Produit trouvé:', { id: produit.id, nom: produit.nom });
      console.log('[PanierController] Format variants produit:', produit.variants);

      // Calculer le stock disponible selon les variants
      let stockDisponible = produit.quantite_stock || 0;
      
      // Nouveau format du panier:
      // variants_selectionnes = {
      //   "variant": { "nom": "zzde", "prix": 34, ... },
      //   "options": { "nombre de plats": "3" }
      // }
      
      // Nouveau format du produit:
      // variants = {
      //   "variants": [{ "nom": "Rouge", "quantite": 10, "prix": 5000, ... }],
      //   "options": [{ "nom": "Message personnalisé", "type": "texte", ... }]
      // }
      
      if (variants_selectionnes && produit.variants) {
        const variantsData = produit.variants as any;
        
        console.log('[PanierController] Vérification du stock avec variants');
        console.log('[PanierController] Variants data:', variantsData);
        
        // Vérifier si un variant spécifique est sélectionné
        if (variants_selectionnes.variant && variantsData.variants && Array.isArray(variantsData.variants)) {
          const variantSelectionne = variants_selectionnes.variant;
          console.log('[PanierController] Variant sélectionné:', variantSelectionne);
          
          const variantProduit = variantsData.variants.find((v: any) => v.nom === variantSelectionne.nom);
          
          if (variantProduit) {
            if (typeof variantProduit.quantite === 'number') {
              stockDisponible = Math.min(stockDisponible, variantProduit.quantite);
              console.log('[PanierController] Stock ajusté selon variant:', {
                nom: variantProduit.nom,
                quantite_variant: variantProduit.quantite,
                stock_final: stockDisponible
              });
            }
          } else {
            console.log('[PanierController] ATTENTION: Variant sélectionné non trouvé dans le produit');
          }
        }
      }

      console.log('[PanierController] Stock disponible final:', stockDisponible);

      // Vérifier le stock disponible
      if (stockDisponible === 0) {
        res.status(400).json({
          success: false,
          message: 'Produit en rupture de stock'
        });
        return;
      }

      // Récupérer les items existants du panier
      const panierItems = await PanierModel.getPanierBySessionId(session_id);
      
      // Chercher un item identique (même produit ET mêmes variants)
      let itemExistant = null;
      
      for (const item of panierItems) {
        if (item.produit_id === produit_id) {
          // Comparer les variants
          const variantsIdentiques = JSON.stringify(item.variants_selectionnes) === JSON.stringify(variants_selectionnes);
          
          if (variantsIdentiques) {
            itemExistant = item;
            break;
          }
        }
      }

      if (itemExistant) {
        console.log('[PanierController] Item existant trouvé, mise à jour de la quantité');
        // Produit identique avec mêmes variants → mettre à jour la quantité
        const nouvelleQuantite = itemExistant.quantite + quantite;
        
        
        // Vérifier que la nouvelle quantité ne dépasse pas le stock
        if (nouvelleQuantite > stockDisponible) {
          res.status(400).json({
            success: false,
            message: `Stock insuffisant. Stock disponible: ${stockDisponible}, quantité demandée: ${nouvelleQuantite}`,
            stockDisponible
          });
          return;
        }

        const updatedItem = await PanierModel.updateCartItemQuantity(itemExistant.id, nouvelleQuantite);
        
        console.log('[PanierController] Quantité mise à jour avec succès');
        
        res.status(200).json({
          success: true,
          message: 'Quantité mise à jour dans le panier',
          item: updatedItem,
          action: 'updated'
        });
      } else {
        console.log('[PanierController] Nouvel item, ajout au panier');
        // Produit avec variants différents ou nouveau produit → ajouter un nouvel item
        
        // Vérifier que la quantité ne dépasse pas le stock
        if (quantite > stockDisponible) {
          res.status(400).json({
            success: false,
            message: `Stock insuffisant. Stock disponible: ${stockDisponible}`,
            stockDisponible
          });
          return;
        }

        const panierItem = await PanierModel.addToCartWithoutCheck({
          session_id,
          boutique_id,
          produit_id,
          quantite,
          variants_selectionnes
        });

        console.log('[PanierController] Produit ajouté au panier avec succès');

        res.status(201).json({
          success: true,
          message: 'Produit ajouté au panier avec succès',
          item: panierItem,
          action: 'added'
        });
      }
    } catch (error: any) {
      console.error('[PanierController] ERREUR:', error);
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
