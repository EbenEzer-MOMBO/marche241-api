import { Request, Response } from 'express';
import axios from 'axios';
import { TransactionModel } from '../models/transaction.model';
import { CommandeModel } from '../models/commande.model';
import { StatutPaiement } from '../lib/database-types';

export class PaiementController {
  /**
   * Initialise un paiement mobile (Airtel Money ou Moov Money)
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async initierPaiementMobile(req: Request, res: Response): Promise<void> {
    try {
      console.log('[PaiementController] Début de initierPaiementMobile');
      console.log('[PaiementController] Body reçu:', JSON.stringify(req.body, null, 2));
      
      // Utiliser les données validées par le middleware
      const validatedData = (req as any).validatedBody || req.body;
      console.log('[PaiementController] Données validées:', JSON.stringify(validatedData, null, 2));
      
      const { 
        email, 
        msisdn, 
        amount, 
        reference, 
        payment_system, 
        description,
        lastname,
        firstname
      } = validatedData;
      
      console.log('[PaiementController] Paramètres extraits:', { 
        email, 
        msisdn, 
        amount, 
        reference, 
        payment_system, 
        description,
        lastname,
        firstname
      });

      // Récupérer le jeton d'accès
      console.log('[PaiementController] Récupération du jeton d\'accès...');
      const accessToken = await PaiementController.getAccessToken();
      console.log('[PaiementController] Jeton d\'accès obtenu');

      // Créer la facture
      console.log('[PaiementController] Création de la facture...');
      const factureData = {
        email,
        msisdn,
        amount,
        reference,
        description,
        lastname,
        firstname
      };
      console.log('[PaiementController] Données de la facture:', JSON.stringify(factureData, null, 2));
      
      const factureResponse = await PaiementController.creerFacture(factureData, accessToken);
      console.log('[PaiementController] Réponse de création de facture:', JSON.stringify(factureResponse, null, 2));

      if (factureResponse && factureResponse.response && factureResponse.response.e_bills && factureResponse.response.e_bills[0] && factureResponse.response.e_bills[0].bill_id) {
        // Récupérer l'ID de la facture
        const billId = factureResponse.response.e_bills[0].bill_id;
        console.log('[PaiementController] ID de facture obtenu:', billId);

        // Mettre à jour la transaction avec l'ID de la facture
        console.log('[PaiementController] Recherche de la transaction avec référence:', reference);
        const transaction = await TransactionModel.getTransactionByReference(reference);
        
        if (transaction) {
          console.log('[PaiementController] Transaction trouvée:', JSON.stringify(transaction, null, 2));
          console.log('[PaiementController] Mise à jour de la transaction avec l\'ID de facture...');
          await TransactionModel.updateTransaction(transaction.id, {
            statut: 'en_attente' as StatutPaiement,
            reference_operateur: billId
          });
          console.log('[PaiementController] Transaction mise à jour');
        } else {
          console.log('[PaiementController] Aucune transaction trouvée avec la référence:', reference);
        }

        console.log('[PaiementController] Conversion du système de paiement pour Ebilling');
        let payment_system_ebilling = '';
        if (payment_system === 'airtelmoney') {
          payment_system_ebilling = 'airtelmoney';
        } else if (payment_system === 'moovmoney') {
          payment_system_ebilling = 'moovmoney1';
        }
        console.log('[PaiementController] Système de paiement Ebilling:', payment_system_ebilling);

        // Envoyer le push USSD
        console.log('[PaiementController] Préparation des données pour le push USSD');
        const ussdData = {
          bill_id: billId,
          payment_system_name: payment_system_ebilling,
          payer_msisdn: msisdn
        };
        console.log('[PaiementController] Données USSD:', JSON.stringify(ussdData, null, 2));

        console.log('[PaiementController] Envoi du push USSD...');
        const ussdResponse = await PaiementController.envoyerUSSDPush(ussdData, accessToken);
        console.log('[PaiementController] Réponse du push USSD:', JSON.stringify(ussdResponse, null, 2));

        console.log('[PaiementController] Paiement mobile initialisé avec succès');
        res.status(200).json({
          success: true,
          bill_id: billId,
          message: 'Paiement mobile initialisé avec succès'
        });
      } else {
        console.log('[PaiementController] Erreur: Données de facture invalides dans la réponse');
        res.status(400).json({
          success: false,
          message: 'Erreur lors de la création de la facture'
        });
      }
    } catch (error: any) {
      console.error('[PaiementController] Exception dans initierPaiementMobile:', error);
      console.error('[PaiementController] Stack trace:', error.stack);
      
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'initialisation du paiement mobile',
        error: error.message
      });
    }
  }

  /**
   * Initialise un paiement par carte bancaire (Visa)
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async initierPaiementVisa(req: Request, res: Response): Promise<void> {
    try {
      console.log('[PaiementController] Début de initierPaiementVisa');
      console.log('[PaiementController] Body reçu:', JSON.stringify(req.body, null, 2));
      
      // Utiliser les données validées par le middleware
      const validatedData = (req as any).validatedBody || req.body;
      console.log('[PaiementController] Données validées:', JSON.stringify(validatedData, null, 2));
      
      const { 
        transaction_id,
        return_url,
        email,
        msisdn,
        lastname,
        firstname
      } = validatedData;
      
      console.log('[PaiementController] Paramètres extraits:', { 
        transaction_id, 
        return_url,
        email,
        msisdn,
        lastname,
        firstname
      });

      // Récupérer la transaction
      const transaction = await TransactionModel.getTransactionById(parseInt(transaction_id));
      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
        return;
      }

      // Récupérer le jeton d'accès
      const accessToken = await PaiementController.getAccessToken();

      // Créer la facture
      const factureResponse = await PaiementController.creerFacture({
        email: req.body.email || 'client@example.com',
        msisdn: req.body.msisdn || '00000000000',
        amount: transaction.montant,
        reference: transaction.reference_transaction,
        description: `Paiement commande ${transaction.commande_id}`,
        lastname: req.body.lastname || 'Client',
        firstname: req.body.firstname || ''
      }, accessToken);

      if (factureResponse && factureResponse.response && factureResponse.response.e_bills && factureResponse.response.e_bills[0] && factureResponse.response.e_bills[0].bill_id) {
        // Récupérer l'ID de la facture
        const billId = factureResponse.response.e_bills[0].bill_id;

        // Mettre à jour la transaction avec l'ID de la facture
        await TransactionModel.updateTransaction(transaction.id, {
          statut: 'en_attente' as StatutPaiement,
          reference_operateur: billId
        });

        // Construire l'URL de redirection vers la plateforme Visa Ebilling
        const redirectUrl = `https://staging.billing-easy.net/?invoice=${billId}&operator=ORABANK_NG&redirect=1&redirect_url=${return_url}?bill_id=${billId}`;

        res.status(200).json({
          success: true,
          redirect: true,
          url: redirectUrl,
          bill_id: billId,
          message: 'Redirection vers la plateforme de paiement Visa...'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la création de la facture pour le paiement Visa'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'initialisation du paiement Visa',
        error: error.message
      });
    }
  }

  /**
   * Vérifie l'état d'un paiement
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async verifierPaiement(req: Request, res: Response): Promise<void> {
    try {
      console.log('[PaiementController] Début de verifierPaiement');
      console.log('[PaiementController] Paramètres reçus:', JSON.stringify(req.params, null, 2));
      
      // Utiliser les données validées par le middleware
      const validatedParams = (req as any).validatedParams || req.params;
      console.log('[PaiementController] Paramètres validés:', JSON.stringify(validatedParams, null, 2));
      
      const { bill_id } = validatedParams;
      console.log('[PaiementController] ID de facture:', bill_id);

      const result = await PaiementController.processPaymentVerification(bill_id);

      if (result.success) {
        // Paiement confirmé
        res.status(200).json({
          success: true,
          message: 'Le paiement a été confirmé avec succès',
          transaction: result.transaction
        });
      } else if (result.state === 'ready') {
        // Paiement en attente mais prêt
        res.status(200).json({
          success: false,
          message: result.message,
          state: result.state,
          transaction: result.transaction
        });
      } else {
        // Autres états ou erreurs
        res.status(200).json({
          success: false,
          message: result.message,
          state: result.state
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du paiement',
        error: error.message
      });
    }
  }

  /**
   * Récupère le jeton d'accès pour l'API de paiement
   * @private
   * @returns Jeton d'accès
   */
  private static async getAccessToken(): Promise<string> {
    try {
      const authUrl = "https://staging.billing-easy.net/shap/api/v1/merchant/auth";
      const apiId = "b43ea5f5e3a4c4e";
      const apiSecret = "e97d36-2a452a-235add-a14b73-13f388";

      const authData = new URLSearchParams();
      authData.append('api_id', apiId);
      authData.append('api_secret', apiSecret);

      const response = await axios.post(authUrl, authData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data && response.data.access_token) {
        return response.data.access_token;
      } else {
        throw new Error("Erreur lors de l'authentification");
      }
    } catch (error: any) {
      throw new Error(`Erreur lors de l'obtention du jeton d'accès: ${error.message}`);
    }
  }

  /**
   * Crée une facture sur la plateforme de paiement
   * @private
   * @param paymentData Données du paiement
   * @param accessToken Jeton d'accès
   * @returns Réponse de l'API
   */
  private static async creerFacture(paymentData: any, accessToken: string): Promise<any> {
    try {
      const paymentUrl = "https://staging.billing-easy.net/shap/api/v1/merchant/create-invoice";

      const globalArray = {
        payer_email: paymentData.email,
        payer_msisdn: paymentData.msisdn,
        amount: paymentData.amount,
        short_description: paymentData.description,
        label: paymentData.reference,
        payer_last_name: paymentData.lastname,
        payer_first_name: paymentData.firstname || ''
      };

      const response = await axios.post(paymentUrl, globalArray, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Erreur lors de la création de la facture: ${error.message}`);
    }
  }

  /**
   * Envoie un push USSD pour le paiement mobile
   * @private
   * @param ussdData Données USSD
   * @param accessToken Jeton d'accès
   * @returns Réponse de l'API
   */
  private static async envoyerUSSDPush(ussdData: any, accessToken: string): Promise<any> {
    try {
      const ussdPushUrl = "https://staging.billing-easy.net/shap/api/v1/merchant/send-ussd-push";

      const response = await axios.post(ussdPushUrl, ussdData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      return response.data;
    } catch (error: any) {
      throw new Error(`Erreur lors de l'envoi du push USSD: ${error.message}`);
    }
  }

  /**
   * Vérifie l'état d'un paiement
   * @private
   * @param billId ID de la facture
   * @returns Résultat de la vérification
   */
  private static async processPaymentVerification(billId: string): Promise<any> {
    try {
      console.log(`[PaiementController] Début de processPaymentVerification pour billId: ${billId}`);
      
      const SERVER_URL = "https://stg.billing-easy.com/api/v1/merchant/e_bills";
      const USER_NAME = 'weupgrade';
      const SHARED_KEY = 'ae049010-e12a-4b92-8b4a-f83f1c489f97';

      // Vérifier l'état du bill
      const checkBillUrl = `${SERVER_URL}/${billId}`;
      console.log(`[PaiementController] URL de vérification: ${checkBillUrl}`);
      
      console.log(`[PaiementController] Envoi de la requête GET avec authentification...`);
      
      let billState: string | null = null;
      let psTransactionId: string | null = null;
      let paymentSystemName: string | null = null;
      
      try {
        const response = await axios.get(checkBillUrl, {
          auth: {
            username: USER_NAME,
            password: SHARED_KEY
          },
          headers: {
            // Accepter tous les types de contenu, comme dans l'implémentation PHP
            'Accept': '*/*'
          }
        });

        console.log(`[PaiementController] Réponse reçue avec statut: ${response.status}`);
        
        if (response.status !== 200) {
          console.log(`[PaiementController] Erreur: Statut de réponse non 200: ${response.status}`);
          return {
            success: false,
            message: `Erreur lors de la vérification du paiement: Statut ${response.status}`
          };
        }

        const billInfo = response.data;
        console.log(`[PaiementController] Informations de la facture:`, JSON.stringify(billInfo, null, 2));
        
        // Récupérer les informations importantes de la facture
        billState = billInfo.state || null;
        psTransactionId = billInfo.ps_transaction_id || null;
        paymentSystemName = billInfo.payment_system_name || null;
        
        console.log(`[PaiementController] État de la facture: ${billState}`);
        console.log(`[PaiementController] ID de transaction du système de paiement: ${psTransactionId || 'Non disponible'}`);
        console.log(`[PaiementController] Nom du système de paiement: ${paymentSystemName || 'Non disponible'}`);
      } catch (axiosError: any) {
        console.error(`[PaiementController] Erreur axios lors de la vérification:`, axiosError.message);
        if (axiosError.response) {
          console.error(`[PaiementController] Détails de la réponse d'erreur:`, {
            status: axiosError.response.status,
            data: axiosError.response.data
          });
        }
        return {
          success: false,
          message: `Erreur lors de la communication avec le serveur de paiement: ${axiosError.message}`
        };
      }
      
      // On a déjà logué ces informations dans le bloc try
      
      // Rechercher la transaction associée
      const transaction = await TransactionModel.findByReferenceOperateur(billId);
      
      if (!transaction) {
        console.log(`[PaiementController] Aucune transaction trouvée pour la facture ${billId}`);
        return {
          success: false,
          message: "Transaction non trouvée pour cette facture."
        };
      }
      
      console.log(`[PaiementController] Transaction trouvée:`, JSON.stringify(transaction, null, 2));
      
      // Traiter selon l'état de la facture
      if (billState === 'processed' || billState === 'paid') {
        console.log(`[PaiementController] Facture ${billId} est ${billState}, mise à jour de la transaction...`);
        
        // Mettre à jour la transaction avec les informations du paiement
        await TransactionModel.updateTransaction(transaction.id, {
          statut: 'paye' as StatutPaiement,
          reference_operateur: psTransactionId || billId,
          date_confirmation: new Date(),
          notes: `Paiement confirmé via API. État: ${billState}`
        });

        // Mettre à jour l'état de la commande si nécessaire
        if (transaction.commande_id) {
          console.log(`[PaiementController] Mise à jour du statut de la commande ${transaction.commande_id} vers 'confirmee'`);
          await CommandeModel.updateCommandeStatus(transaction.commande_id, 'confirmee');
        } else {
          console.log(`[PaiementController] Aucune commande associée à cette transaction`);
        }

        console.log(`[PaiementController] Paiement confirmé avec succès pour la facture ${billId}`);
        return {
          success: true,
          message: "Le paiement a été confirmé avec succès.",
          transaction: await TransactionModel.getTransactionById(transaction.id) // Récupérer la transaction mise à jour
        };
      } else {
        // Mettre à jour la transaction avec les informations disponibles
        if (paymentSystemName && paymentSystemName !== transaction.methode_paiement) {
          console.log(`[PaiementController] Mise à jour du système de paiement: ${paymentSystemName}`);
          let methode_paiement_format = '';
          if(paymentSystemName === 'airtelmoney') {
            methode_paiement_format = 'airtel_money';
          }else if(paymentSystemName === 'moovmoney'){
            methode_paiement_format = 'moov_money';
          }
          await TransactionModel.updateTransaction(transaction.id, {
            methode_paiement: methode_paiement_format as any,
            notes: `Paiement en attente. Système de paiement: ${paymentSystemName}`
          });
        }
        
        console.log(`[PaiementController] Paiement en attente (ready) pour la facture ${billId}`);
        return {
          success: false,
          message: "Paiement en attente de confirmation. La facture est prête pour le paiement.",
          state: billState,
          transaction: await TransactionModel.getTransactionById(transaction.id)
        };
      }

      console.log(`[PaiementController] Paiement en attente de confirmation pour la facture ${billId}, état: ${billState}`);
      return {
        success: false,
        message: `Paiement en attente de confirmation. État: ${billState}`,
        state: billState
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Erreur lors de la vérification: ${error.message}`
      };
    }
  }
}
