import { Request, Response } from 'express';
import { CommandeModel } from '../models/commande.model';
import { TransactionModel } from '../models/transaction.model';
import { ProduitModel } from '../models/produit.model';
import { StatutCommande, StatutPaiement, MethodePaiement } from '../lib/database-types';

export class CommandeController {
  /**
   * Crée une nouvelle commande
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async createCommande(req: Request, res: Response): Promise<void> {
    try {
      console.log('Début de la création de commande');
      console.log('Body reçu:', JSON.stringify(req.body, null, 2));
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      console.log('Body validé:', JSON.stringify(body, null, 2));
      
      // Créer la commande
      console.log('Préparation des données pour création de la commande');
      
      // Extraire les articles et les autres données de la commande
      const { articles, ...commandeData } = body;
      
      // Ajouter les statuts et initialiser les montants
      const commandeToCreate = {
        ...commandeData,
        statut: 'en_attente' as StatutCommande,
        statut_paiement: 'en_attente' as StatutPaiement,
        sous_total: 0,  // Initialiser à 0, sera mis à jour plus tard
        total: 0,       // Initialiser à 0, sera mis à jour plus tard
        montant_paye: 0, // Aucun paiement reçu à la création
        montant_restant: 0, // Sera calculé automatiquement par le trigger SQL
        frais_livraison: commandeData.frais_livraison || 0,
        taxes: commandeData.taxes || 0,
        remise: commandeData.remise || 0
      };
      
      console.log('Données de la commande:', JSON.stringify(commandeToCreate, null, 2));
      
      console.log('Appel à CommandeModel.createCommande');
      const commande = await CommandeModel.createCommande(commandeToCreate);
      console.log('Commande créée avec ID:', commande.id);
      
      // Ajouter les articles à la commande
      if (body.articles && Array.isArray(body.articles)) {
        console.log(`Ajout de ${body.articles.length} articles à la commande`);
        for (const article of body.articles) {
          console.log('Ajout de l\'article:', JSON.stringify(article, null, 2));
          
          // N'inclure que les champs qui existent dans la table commande_articles
          const { description, ...articleSansDescription } = article;
          
          // Calculer le sous-total pour cet article
          const prix_unitaire = articleSansDescription.prix_unitaire || 0;
          const quantite = articleSansDescription.quantite || 0;
          const sous_total = prix_unitaire * quantite;
          
          // S'assurer que variants_selectionnes est correctement préservé
          const variants_selectionnes = article.variants_selectionnes ? 
            JSON.parse(JSON.stringify(article.variants_selectionnes)) : null;
          
          console.log('Variants sélectionnés avant insertion:', JSON.stringify(variants_selectionnes, null, 2));
          
          await CommandeModel.addArticleToCommande({
            commande_id: commande.id,
            produit_id: articleSansDescription.produit_id,
            nom_produit: articleSansDescription.nom_produit,
            prix_unitaire,
            quantite,
            sous_total,
            variants_selectionnes
          });
        }
        console.log('Tous les articles ont été ajoutés');
      } else {
        console.log('Aucun article à ajouter');
      }
      
      // Mettre à jour les totaux de la commande
      console.log('Mise à jour des totaux de la commande');
      const commandeAvecTotaux = await CommandeModel.updateCommandeTotals(commande.id);
      console.log('Totaux mis à jour:', JSON.stringify(commandeAvecTotaux, null, 2));
      
      console.log('Envoi de la réponse au client');
      res.status(201).json({
        success: true,
        message: 'Commande créée avec succès',
        commande: commandeAvecTotaux,
        paiement: {
          total: commandeAvecTotaux.total,
          montant_paye: commandeAvecTotaux.montant_paye || 0,
          montant_restant: commandeAvecTotaux.montant_restant || commandeAvecTotaux.total,
          statut_paiement: commandeAvecTotaux.statut_paiement
        }
      });
    } catch (error: any) {
      console.error('ERREUR lors de la création de la commande:', error);
      console.error('Stack trace:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la commande',
        error: error.message
      });
    }
  }

  /**
   * Récupère une commande par son ID
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getCommandeById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commande invalide'
        });
        return;
      }
      
      const commande = await CommandeModel.getCommandeById(id);
      
      if (!commande) {
        res.status(404).json({
          success: false,
          message: 'Commande non trouvée'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        commande
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la commande',
        error: error.message
      });
    }
  }

  /**
   * Récupère une commande par son numéro
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getCommandeByNumero(req: Request, res: Response): Promise<void> {
    try {
      const { numero } = req.params;
      
      if (!numero) {
        res.status(400).json({
          success: false,
          message: 'Numéro de commande requis'
        });
        return;
      }
      
      const commande = await CommandeModel.getCommandeByNumero(numero);
      
      if (!commande) {
        res.status(404).json({
          success: false,
          message: 'Commande non trouvée'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        commande
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la commande',
        error: error.message
      });
    }
  }

  /**
   * Récupère les commandes d'une boutique
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getCommandesByBoutique(req: Request, res: Response): Promise<void> {
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
      
      const { commandes, total } = await CommandeModel.getCommandesByBoutique(boutiqueId, page, limite);
      
      res.status(200).json({
        success: true,
        commandes,
        total,
        page,
        limite,
        total_pages: Math.ceil(total / limite)
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des commandes',
        error: error.message
      });
    }
  }

  /**
   * Met à jour le statut d'une commande
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async updateCommandeStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commande invalide'
        });
        return;
      }
      
      // Vérifier si la commande existe
      const existingCommande = await CommandeModel.getCommandeById(id);
      
      if (!existingCommande) {
        res.status(404).json({
          success: false,
          message: 'Commande non trouvée'
        });
        return;
      }
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      // Définir les valeurs valides de StatutCommande
      const statutsValides = ['en_attente', 'confirmee', 'en_preparation', 'expedie', 'livree', 'annulee', 'remboursee'];
      
      if (!statutsValides.includes(body.statut)) {
        res.status(400).json({
          success: false,
          message: 'Statut de commande invalide'
        });
        return;
      }
      
      const updatedCommande = await CommandeModel.updateCommandeStatus(id, body.statut as StatutCommande);
      
      res.status(200).json({
        success: true,
        message: 'Statut de la commande mis à jour avec succès',
        commande: updatedCommande
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut de la commande',
        error: error.message
      });
    }
  }

  /**
   * Met à jour le statut de paiement d'une commande
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async updatePaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commande invalide'
        });
        return;
      }
      
      // Vérifier si la commande existe
      const existingCommande = await CommandeModel.getCommandeById(id);
      
      if (!existingCommande) {
        res.status(404).json({
          success: false,
          message: 'Commande non trouvée'
        });
        return;
      }
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      // Définir les valeurs valides de StatutPaiement
      const statutsValides = ['en_attente', 'paye', 'echec', 'rembourse'];
      
      if (!statutsValides.includes(body.statut_paiement)) {
        res.status(400).json({
          success: false,
          message: 'Statut de paiement invalide'
        });
        return;
      }
      
      const updatedCommande = await CommandeModel.updatePaymentStatus(
        id, 
        body.statut_paiement as StatutPaiement,
        body.methode_paiement
      );
      
      res.status(200).json({
        success: true,
        message: 'Statut de paiement mis à jour avec succès',
        commande: updatedCommande
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut de paiement',
        error: error.message
      });
    }
  }

  /**
   * Initialise le paiement d'une commande
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async initierPaiement(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commande invalide'
        });
        return;
      }
      
      // Vérifier si la commande existe
      const commande = await CommandeModel.getCommandeById(id);
      
      if (!commande) {
        res.status(404).json({
          success: false,
          message: 'Commande non trouvée'
        });
        return;
      }
      
      // Vérifier la disponibilité des produits avant d'initialiser le paiement
      console.log('[initierPaiement] Vérification de la disponibilité des produits');
      const articles = await CommandeModel.getCommandeArticlesDetails(id);
      const produitsIndisponibles: any[] = [];
      const quantitesInsuffisantes: any[] = [];
      
      for (const article of articles) {
        const produit = await ProduitModel.getProduitById(article.produit_id);
        
        if (!produit) {
          produitsIndisponibles.push({
            nom: article.nom_produit,
            raison: 'Produit introuvable'
          });
          continue;
        }
        
        // Vérifier si le produit est actif
        if (produit.statut !== 'actif') {
          produitsIndisponibles.push({
            nom: article.nom_produit,
            raison: 'Produit non disponible'
          });
          continue;
        }
        
        // Vérifier le stock selon les variants
        if (article.variants_selectionnes && produit.variants) {
          console.log('[initierPaiement] Vérification du stock pour les variants:', article.variants_selectionnes);
          
          // Calculer le stock disponible pour ces variants spécifiques
          let stockDisponible = produit.quantite_stock || 0;
          
          for (const [nomVariant, optionSelectionnee] of Object.entries(article.variants_selectionnes)) {
            const variant = produit.variants.find((v: any) => v.nom === nomVariant);
            
            if (variant && variant.options && variant.quantites) {
              const indexOption = variant.options.indexOf(optionSelectionnee);
              
              if (indexOption !== -1 && variant.quantites[indexOption] !== undefined) {
                const quantiteVariant = variant.quantites[indexOption];
                stockDisponible = Math.min(stockDisponible, quantiteVariant);
                console.log(`[initierPaiement] Stock pour ${nomVariant}=${optionSelectionnee}: ${quantiteVariant}`);
              }
            }
          }
          
          console.log('[initierPaiement] Stock disponible calculé:', stockDisponible);
          
          // Vérifier si la quantité demandée est disponible
          if (article.quantite > stockDisponible) {
            quantitesInsuffisantes.push({
              nom: article.nom_produit,
              quantite_commandee: article.quantite,
              quantite_disponible: stockDisponible,
              variants: article.variants_selectionnes
            });
          }
        } else {
          // Pas de variants, vérifier le stock global
          const stockDisponible = produit.quantite_stock || 0;
          
          if (article.quantite > stockDisponible) {
            quantitesInsuffisantes.push({
              nom: article.nom_produit,
              quantite_commandee: article.quantite,
              quantite_disponible: stockDisponible
            });
          }
        }
      }
      
      // Si des produits sont indisponibles ou en quantité insuffisante, rejeter le paiement
      if (produitsIndisponibles.length > 0 || quantitesInsuffisantes.length > 0) {
        console.log('[initierPaiement] Produits indisponibles ou quantités insuffisantes détectés');
        
        const erreurs: any = {
          success: false,
          message: 'Impossible d\'initialiser le paiement : problèmes de disponibilité des produits'
        };
        
        if (produitsIndisponibles.length > 0) {
          erreurs.produits_indisponibles = produitsIndisponibles;
        }
        
        if (quantitesInsuffisantes.length > 0) {
          erreurs.quantites_insuffisantes = quantitesInsuffisantes;
        }
        
        res.status(400).json(erreurs);
        return;
      }
      
      console.log('[initierPaiement] Tous les produits sont disponibles en quantité suffisante');
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      // Vérifier si la méthode de paiement est valide
      const methodesValides = ['mobile_money', 'airtel_money', 'moov_money', 'especes', 'virement'];
      
      if (!methodesValides.includes(body.methode_paiement)) {
        res.status(400).json({
          success: false,
          message: 'Méthode de paiement invalide'
        });
        return;
      }
      
      // Créer une transaction pour la commande
      const transaction = await TransactionModel.createTransaction({
        commande_id: commande.id,
        reference_transaction: `TRX-${Date.now()}`,
        montant: commande.total,
        methode_paiement: body.methode_paiement as MethodePaiement,
        type_paiement: 'paiement_complet', // Paiement complet par défaut
        statut: 'en_attente' as StatutPaiement,
        numero_telephone: body.numero_telephone,
        description: 'Paiement de la commande'
      });
      
      // Mettre à jour la méthode de paiement de la commande
      await CommandeModel.updatePaymentStatus(commande.id, 'en_attente', body.methode_paiement);
      
      // Retourner la transaction créée
      res.status(200).json({
        success: true,
        message: 'Paiement initialisé avec succès',
        transaction
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'initialisation du paiement',
        error: error.message
      });
    }
  }

  /**
   * Récupère les détails des produits d'une commande
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getCommandeArticlesDetails(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de commande invalide'
        });
        return;
      }
      
      // Vérifier si la commande existe
      const commande = await CommandeModel.getCommandeById(id);
      
      if (!commande) {
        res.status(404).json({
          success: false,
          message: 'Commande non trouvée'
        });
        return;
      }
      
      // Récupérer les détails des articles
      const articles = await CommandeModel.getCommandeArticlesDetails(id);
      
      res.status(200).json({
        success: true,
        commande: {
          id: commande.id,
          numero_commande: commande.numero_commande,
          statut: commande.statut,
          statut_paiement: commande.statut_paiement,
          sous_total: commande.sous_total,
          frais_livraison: commande.frais_livraison,
          taxes: commande.taxes,
          remise: commande.remise,
          total: commande.total,
          date_commande: commande.date_commande
        },
        articles,
        nombre_articles: articles.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des détails des produits de la commande',
        error: error.message
      });
    }
  }
}
