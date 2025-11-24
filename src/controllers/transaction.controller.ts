import { Request, Response } from 'express';
import { TransactionModel } from '../models/transaction.model';
import { CommandeModel } from '../models/commande.model';
import { StatutPaiement } from '../lib/database-types';

export class TransactionController {
  /**
   * Récupère toutes les transactions avec pagination
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getAllTransactions(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      const page = parseInt(query.page as string) || 1;
      const limite = parseInt(query.limite as string) || 10;
      
      const { transactions, total } = await TransactionModel.getAllTransactions(page, limite);
      
      res.status(200).json({
        success: true,
        transactions,
        total,
        page,
        limite,
        total_pages: Math.ceil(total / limite)
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des transactions',
        error: error.message
      });
    }
  }

  /**
   * Récupère les transactions d'une commande
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getTransactionsByCommandeId(req: Request, res: Response): Promise<void> {
    try {
      const commandeId = parseInt(req.params.commandeId);
      
      if (isNaN(commandeId)) {
        res.status(400).json({
          success: false,
          message: 'ID de commande invalide'
        });
        return;
      }
      
      const transactions = await TransactionModel.getTransactionsByCommandeId(commandeId);
      
      res.status(200).json({
        success: true,
        transactions
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des transactions de la commande',
        error: error.message
      });
    }
  }

  /**
   * Récupère les transactions liées aux commandes d'une boutique
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getTransactionsByBoutiqueId(req: Request, res: Response): Promise<void> {
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
      
      const { transactions, total } = await TransactionModel.getTransactionsByBoutiqueId(
        boutiqueId,
        page,
        limite
      );
      
      res.status(200).json({
        success: true,
        transactions,
        total,
        page,
        limite,
        total_pages: Math.ceil(total / limite)
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des transactions de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Récupère une transaction par son ID
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getTransactionById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de transaction invalide'
        });
        return;
      }
      
      const transaction = await TransactionModel.getTransactionById(id);
      
      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        transaction
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la transaction',
        error: error.message
      });
    }
  }

  /**
   * Récupère une transaction par sa référence
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getTransactionByReference(req: Request, res: Response): Promise<void> {
    try {
      const { reference } = req.params;
      
      if (!reference) {
        res.status(400).json({
          success: false,
          message: 'Référence de transaction requise'
        });
        return;
      }
      
      const transaction = await TransactionModel.getTransactionByReference(reference);
      
      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
        return;
      }
      
      res.status(200).json({
        success: true,
        transaction
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la transaction',
        error: error.message
      });
    }
  }

  /**
   * Crée une nouvelle transaction
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async createTransaction(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      console.log('[TransactionController] Création de transaction, body:', JSON.stringify(body, null, 2));
      
      // Si une commande est associée, déterminer automatiquement le type_paiement si non fourni ou incorrect
      if (body.commande_id && body.montant) {
        const commande = await CommandeModel.getCommandeById(body.commande_id);
        
        if (commande) {
          console.log('[TransactionController] Commande trouvée:', {
            id: commande.id,
            total: commande.total,
            frais_livraison: commande.frais_livraison,
            montant_transaction: body.montant
          });
          
          // IMPORTANT: Le total de la commande (commande.total) inclut DÉJÀ la majoration de 4.5%
          // appliquée sur les prix des articles dans le panier. 
          // Nous devons donc seulement appliquer la majoration sur les frais de livraison s'ils existent.
          const FRAIS_SERVICE_POURCENTAGE = 0.045; // 4.5%
          
          // Fonction pour calculer le montant avec frais de service
          const avecFraisService = (montant: number) => Math.round(montant * (1 + FRAIS_SERVICE_POURCENTAGE));
          
          // Déterminer le type de paiement en fonction du montant
          const fraisLivraison = commande.frais_livraison || 0;
          const totalCommande = commande.total; // Déjà avec majoration 4.5%
          const montantTransaction = body.montant;
          
          // Calculer les montants attendus
          // Note: commande.total inclut déjà la majoration, donc pas besoin de la réappliquer
          const fraisLivraisonAvecFrais = fraisLivraison > 0 ? avecFraisService(fraisLivraison) : 0;
          const totalCommandeAvecFrais = totalCommande; // Déjà avec majoration
          const soldeApresLivraisonAvecFrais = totalCommande - fraisLivraisonAvecFrais;
          
          console.log('[TransactionController] Analyse des montants:', {
            fraisLivraison: fraisLivraison,
            fraisLivraisonAvecFrais: fraisLivraisonAvecFrais,
            totalCommande: totalCommande,
            totalCommandeAvecFrais: totalCommandeAvecFrais,
            soldeApresLivraisonAvecFrais: soldeApresLivraisonAvecFrais,
            montantTransaction: montantTransaction,
            note: 'totalCommande inclut déjà la majoration 4.5%'
          });
          
          // Si le montant correspond aux frais de livraison + frais de service (avec tolérance de 2)
          if (Math.abs(montantTransaction - fraisLivraisonAvecFrais) <= 2 && fraisLivraison > 0) {
            body.type_paiement = 'frais_livraison';
            body.description = body.description || `Paiement des frais de livraison (${fraisLivraison} FCFA + majoration 4.5%)`;
            console.log('[TransactionController] Type de paiement détecté: frais_livraison');
          }
          // Si le montant correspond au total de la commande (déjà avec majoration)
          else if (Math.abs(montantTransaction - totalCommandeAvecFrais) <= 2) {
            body.type_paiement = 'paiement_complet';
            body.description = body.description || `Paiement complet de la commande (${totalCommande} FCFA déjà avec majoration 4.5%)`;
            console.log('[TransactionController] Type de paiement détecté: paiement_complet');
          }
          // Si le montant correspond au solde après paiement des frais de livraison
          else if (Math.abs(montantTransaction - soldeApresLivraisonAvecFrais) <= 2 && fraisLivraison > 0) {
            body.type_paiement = 'solde_apres_livraison';
            body.description = body.description || `Paiement du solde après livraison (${soldeApresLivraisonAvecFrais} FCFA)`;
            console.log('[TransactionController] Type de paiement détecté: solde_apres_livraison');
          }
          // Sinon, c'est un acompte ou un complément
          else if (montantTransaction < totalCommandeAvecFrais) {
            body.type_paiement = body.type_paiement || 'acompte';
            body.description = body.description || `Paiement partiel de ${montantTransaction} FCFA`;
            console.log('[TransactionController] Type de paiement: acompte');
          }
        }
      }
      
      const transaction = await TransactionModel.createTransaction(body);
      
      res.status(201).json({
        success: true,
        message: 'Transaction créée avec succès',
        transaction
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la transaction',
        error: error.message
      });
    }
  }

  /**
   * Met à jour le statut d'une transaction
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async updateTransactionStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de transaction invalide'
        });
        return;
      }
      
      // Vérifier si la transaction existe
      const existingTransaction = await TransactionModel.getTransactionById(id);
      
      if (!existingTransaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
        return;
      }
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      const { statut, reference_operateur, notes } = body;
      
      // Définir les valeurs valides de StatutPaiement
      const statutsValides = ['en_attente', 'paye', 'echec', 'rembourse'];
      
      if (!statutsValides.includes(statut)) {
        res.status(400).json({
          success: false,
          message: 'Statut de transaction invalide'
        });
        return;
      }
      
      const updatedTransaction = await TransactionModel.updateTransactionStatus(
        id, 
        statut as StatutPaiement, 
        reference_operateur, 
        notes
      );
      
      res.status(200).json({
        success: true,
        message: 'Statut de la transaction mis à jour avec succès',
        transaction: updatedTransaction
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut de la transaction',
        error: error.message
      });
    }
  }

  /**
   * Met à jour une transaction
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async updateTransaction(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de transaction invalide'
        });
        return;
      }
      
      // Vérifier si la transaction existe
      const existingTransaction = await TransactionModel.getTransactionById(id);
      
      if (!existingTransaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
        return;
      }
      
      // Utiliser validatedBody s'il existe, sinon utiliser body
      const body = (req as any).validatedBody || req.body;
      
      const updatedTransaction = await TransactionModel.updateTransaction(id, body);
      
      res.status(200).json({
        success: true,
        message: 'Transaction mise à jour avec succès',
        transaction: updatedTransaction
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la transaction',
        error: error.message
      });
    }
  }

  /**
   * Récupère les statistiques des transactions
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async getTransactionStats(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      let startDate: Date | undefined;
      let endDate: Date | undefined;
      
      if (query.start_date) {
        startDate = new Date(query.start_date as string);
        if (isNaN(startDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Date de début invalide'
          });
          return;
        }
      }
      
      if (query.end_date) {
        endDate = new Date(query.end_date as string);
        if (isNaN(endDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Date de fin invalide'
          });
          return;
        }
      }
      
      const stats = await TransactionModel.getTransactionStats(startDate, endDate);
      
      res.status(200).json({
        success: true,
        stats
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques de transactions',
        error: error.message
      });
    }
  }
}
