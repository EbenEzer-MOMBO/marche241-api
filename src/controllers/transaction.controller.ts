import { Request, Response } from 'express';
import { TransactionModel } from '../models/transaction.model';
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
