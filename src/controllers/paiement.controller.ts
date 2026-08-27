import { Request, Response } from 'express';
import axios from 'axios';
import { TransactionModel } from '../models/transaction.model';
import { CommandeModel } from '../models/commande.model';
import { StatutPaiement, Transaction, MethodePaiement, Commande } from '../lib/database-types';
import { ProduitModel } from '../models/produit.model';
import { VendeurModel } from '../models/vendeur.model';
import { WhatsappSubscriberModel } from '../models/whatsapp_subscriber.model';
import { WhatsAppService } from '../services/whatsapp.service';
import { logger } from '../utils/logger';

export class PaiementController {
  private static ebillingTokenCache: { value: string; expiresAt: number } | null = null;

  private static mapPaymentSystemToMethode(paymentSystemName: string | null | undefined): MethodePaiement | undefined {
    if (!paymentSystemName) {
      return undefined;
    }

    const name = paymentSystemName.toLowerCase();
    if (name === 'airtelmoney' || name === 'airtel_money') {
      return 'airtel_money';
    }
    if (name === 'moovmoney1' || name === 'moovmoney' || name === 'moov_money') {
      return 'moov_money';
    }
    if (name.includes('orabank') || name === 'visa' || name === 'mastercard' || name.includes('card')) {
      return 'carte_bancaire';
    }

    return 'mobile_money';
  }


  /**
   * Vérifie que le montant d'une transaction correspond au montant attendu selon le type de paiement
   * @param transaction Transaction à vérifier
   * @param commandePrechargee Commande déjà chargée (évite un SELECT redondant)
   * @returns {Promise<boolean>} true si le montant est correct, false sinon
   */
  private static async verifierMontantTransaction(
    transaction: Transaction,
    commandePrechargee?: Awaited<ReturnType<typeof CommandeModel.getCommandeById>> | null
  ): Promise<{ isValid: boolean, message?: string, commande?: Awaited<ReturnType<typeof CommandeModel.getCommandeById>> }> {
    try {
      const commandeId = transaction.commande_id;
      if (!commandeId) {
        return { isValid: true };
      }

      const commande = commandePrechargee ?? await CommandeModel.getCommandeById(commandeId);
      if (!commande) {
        logger.error(`[PaiementController] Commande ${commandeId} non trouvée`);
        return { isValid: false, message: `Commande ${commandeId} non trouvée` };
      }

      // Vérifier que la commande a des articles
      const articles = commande.articles;
      if (!articles || articles.length === 0) {
        logger.error(`[PaiementController] Aucun article trouvé pour la commande ${commandeId}`);
        return { isValid: false, message: `Aucun article trouvé pour la commande ${commandeId}` };
      }

      // Calculer le total des articles (prix HT sans majoration)
      const totalArticles = articles.reduce((sum, article) => {
        return sum + (article.prix_unitaire * article.quantite);
      }, 0);

      const fraisLivraison = commande.frais_livraison || 0;
      const totalCommandeHT = totalArticles + fraisLivraison;
      const montantTransaction = transaction.montant;

      const FRAIS_SERVICE_POURCENTAGE = 0.10;
      const avecFraisService = (montant: number) => Math.round(montant * (1 + FRAIS_SERVICE_POURCENTAGE));

      let montantAttendu: number;
      let typePaiementDescription: string;

      switch (transaction.type_paiement) {
        case 'frais_livraison':
          montantAttendu = fraisLivraison > 0 ? avecFraisService(fraisLivraison) : 0;
          typePaiementDescription = `frais de livraison (${fraisLivraison} + 10% = ${montantAttendu})`;
          break;

        case 'paiement_complet':
          montantAttendu = avecFraisService(totalCommandeHT);
          typePaiementDescription = `paiement complet ((${totalArticles} + ${fraisLivraison}) + 10% = ${montantAttendu})`;
          break;

        case 'solde_apres_livraison':
          montantAttendu = avecFraisService(totalArticles);
          typePaiementDescription = `solde après livraison (${totalArticles} + 10% = ${montantAttendu})`;
          break;

        case 'acompte': {
          const ACOMPTE_POURCENTAGE = 0.50;
          montantAttendu = avecFraisService(Math.round(totalCommandeHT * ACOMPTE_POURCENTAGE));
          typePaiementDescription = `acompte 50% (50% de (${totalArticles} + ${fraisLivraison}) + 10% = ${montantAttendu})`;
          break;
        }

        case 'complement':
          return { isValid: true, commande };

        default:
          montantAttendu = avecFraisService(totalCommandeHT);
          typePaiementDescription = `total de la commande ((${totalArticles} + ${fraisLivraison}) + 10% = ${montantAttendu})`;
          logger.warn(`[PaiementController] Type de paiement non reconnu: ${transaction.type_paiement}`);
      }

      const difference = Math.abs(montantAttendu - montantTransaction);
      if (difference > 2) {
        logger.error(`[PaiementController] Montant incorrect: différence de ${difference}`);
        return {
          isValid: false,
          message: `Montant de la transaction (${montantTransaction} FCFA) non conforme au montant attendu pour ${typePaiementDescription} (${montantAttendu} FCFA)`,
          commande
        };
      }

      return { isValid: true, commande };
    } catch (error: any) {
      logger.error(`[PaiementController] Erreur lors de la vérification du montant:`, error);
      return { isValid: false, message: `Erreur lors de la vérification du montant: ${error.message || 'Erreur inconnue'}` };
    }
  }

  /**
   * Initialise un paiement mobile (Airtel Money ou Moov Money)
   * @param req Requête HTTP
   * @param res Réponse HTTP
   */
  static async initierPaiementMobile(req: Request, res: Response): Promise<void> {
    try {

      // Utiliser les données validées par le middleware
      const validatedData = (req as any).validatedBody || req.body;

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


      // Récupérer le jeton d'accès
      const accessToken = await PaiementController.getAccessToken();

      // Créer la facture
      const factureData = {
        email,
        msisdn,
        amount,
        reference,
        description,
        lastname,
        firstname
      };

      const factureResponse = await PaiementController.creerFacture(factureData, accessToken);

      if (factureResponse && factureResponse.response && factureResponse.response.e_bills && factureResponse.response.e_bills[0] && factureResponse.response.e_bills[0].bill_id) {
        // Récupérer l'ID de la facture
        const billId = factureResponse.response.e_bills[0].bill_id;

        // Recherche de la transaction avec référence
        const transaction = await TransactionModel.getTransactionByReference(reference);

        let payment_system_ebilling = '';
        if (payment_system === 'airtelmoney') {
          payment_system_ebilling = 'airtelmoney';
        } else if (payment_system === 'moovmoney') {
          payment_system_ebilling = 'moovmoney1';
        }

        // Envoyer le push USSD
        const ussdData = {
          bill_id: billId,
          payment_system_name: payment_system_ebilling,
          payer_msisdn: msisdn
        };

        await PaiementController.envoyerUSSDPush(ussdData, accessToken);

        res.status(200).json({
          success: true,
          bill_id: billId,
          message: 'Paiement mobile initialisé avec succès'
        });

      } else {
        res.status(400).json({
          success: false,
          message: 'Erreur lors de la création de la facture'
        });
      }
    } catch (error: any) {
      logger.error('[PaiementController] Exception dans initierPaiementMobile:', error);
      logger.error('[PaiementController] Stack trace:', error.stack);

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

      // Utiliser les données validées par le middleware
      const validatedData = (req as any).validatedBody || req.body;

      const {
        transaction_id,
        return_url,
        email,
        msisdn,
        lastname,
        firstname
      } = validatedData;


      const transaction = await TransactionModel.getTransactionById(parseInt(transaction_id));
      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction non trouvée'
        });
        return;
      }

      if (transaction.statut !== 'en_attente') {
        res.status(400).json({
          success: false,
          message: 'Cette transaction n\'est plus en attente de paiement'
        });
        return;
      }

      const montantVerification = await PaiementController.verifierMontantTransaction(transaction);

      if (!montantVerification.isValid) {
        logger.error(`[PaiementController] Erreur de vérification du montant: ${montantVerification.message}`);
        res.status(400).json({
          success: false,
          message: montantVerification.message || 'Montant de la transaction non conforme'
        });
        return;
      }

      const accessToken = await PaiementController.getAccessToken();

      const factureResponse = await PaiementController.creerFacture({
        email: email || 'client@example.com',
        msisdn: msisdn || '00000000000',
        amount: transaction.montant,
        reference: transaction.reference_transaction,
        description: `Paiement commande ${transaction.commande_id}`,
        lastname: lastname || 'Client',
        firstname: firstname || ''
      }, accessToken);

      if (factureResponse && factureResponse.response && factureResponse.response.e_bills && factureResponse.response.e_bills[0] && factureResponse.response.e_bills[0].bill_id) {
        const billId = factureResponse.response.e_bills[0].bill_id;

        await TransactionModel.updateTransaction(transaction.id, {
          statut: 'en_attente' as StatutPaiement,
          methode_paiement: 'carte_bancaire',
          reference_operateur: billId
        });

        const cardRedirectBase = process.env.EBILLING_CARD_REDIRECT_BASE || 'https://staging.billing-easy.net/';
        const cardOperator = process.env.EBILLING_CARD_OPERATOR || 'ORABANK_NG';

        const returnWithBill = new URL(return_url);
        returnWithBill.searchParams.set('bill_id', billId);

        const redirectUrl = new URL(cardRedirectBase);
        redirectUrl.searchParams.set('invoice', billId);
        redirectUrl.searchParams.set('operator', cardOperator);
        redirectUrl.searchParams.set('redirect', '1');
        redirectUrl.searchParams.set('redirect_url', returnWithBill.toString());

        res.status(200).json({
          success: true,
          redirect: true,
          url: redirectUrl.toString(),
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
      const validatedParams = (req as any).validatedParams || req.params;
      const { bill_id } = validatedParams;

      // Short-circuit: ne pas rappeler Ebilling si la transaction est déjà finalisée
      const existing = await TransactionModel.findByReferenceOperateur(bill_id);
      if (existing && (existing.statut === 'paye' || existing.statut === 'echec' || existing.statut === 'rembourse')) {
        res.status(200).json({
          success: existing.statut === 'paye',
          message:
            existing.statut === 'paye'
              ? 'Le paiement a déjà été confirmé'
              : `Paiement déjà en statut ${existing.statut}`,
          status: existing.statut,
          transaction: existing,
          cached: true
        });
        return;
      }

      const result = await PaiementController.processPaymentVerification(bill_id, existing);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: 'Le paiement a été confirmé avec succès',
          status: result.billState,
          transaction: result.transaction
        });
      } else if (result.state === 'ready') {
        res.status(200).json({
          success: false,
          message: result.message,
          state: result.state,
          transaction: result.transaction
        });
      } else {
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
      const cached = PaiementController.ebillingTokenCache;
      if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
      }

      const authUrl = process.env.EBILLING_AUTH_URL || "https://staging.billing-easy.net/shap/api/v1/merchant/auth";
      const apiId = process.env.EBILLING_API_ID || '';
      const apiSecret = process.env.EBILLING_API_SECRET || '';

      const authData = new URLSearchParams();
      authData.append('api_id', apiId);
      authData.append('api_secret', apiSecret);

      const response = await axios.post(authUrl, authData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data && response.data.access_token) {
        const expiresInSec = Number(response.data.expires_in) || 3600;
        const safetySkewMs = 60_000;
        PaiementController.ebillingTokenCache = {
          value: response.data.access_token,
          expiresAt: Date.now() + Math.max(expiresInSec * 1000 - safetySkewMs, 60_000)
        };
        return response.data.access_token;
      } else {
        throw new Error("Erreur lors de l'authentification");
      }
    } catch (error: any) {
      PaiementController.ebillingTokenCache = null;
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
      const paymentUrl = process.env.EBILLING_CREATE_INVOICE_URL || "https://staging.billing-easy.net/shap/api/v1/merchant/create-invoice";

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
      const ussdPushUrl = process.env.EBILLING_SEND_USSD_PUSH_URL || "https://staging.billing-easy.net/shap/api/v1/merchant/send-ussd-push";

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
  /**
   * Vérifie une facture Ebilling et met à jour transaction/commande si payée.
   * Exposé pour la réconciliation cron après 1h.
   */
  static async processPaymentVerification(
    billId: string,
    transactionPrechargee?: Transaction | null
  ): Promise<any> {
    try {

      const SERVER_URL = process.env.EBILLING_SERVER_URL || "https://stg.billing-easy.com/api/v1/merchant/e_bills";
      const USER_NAME = process.env.EBILLING_USER_NAME || '';
      const SHARED_KEY = process.env.EBILLING_SHARED_KEY || '';

      // Vérifier l'état du bill
      const checkBillUrl = `${SERVER_URL}/${billId}`;


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


        if (response.status !== 200) {
          return {
            success: false,
            message: `Erreur lors de la vérification du paiement: Statut ${response.status}`
          };
        }

        const billInfo = response.data;

        // Récupérer les informations importantes de la facture
        billState = billInfo.state || null;
        psTransactionId = billInfo.ps_transaction_id || null;
        paymentSystemName = billInfo.payment_system_name || null;

      } catch (axiosError: any) {
        logger.error(`[PaiementController] Erreur axios lors de la vérification:`, axiosError.message);
        if (axiosError.response) {
          logger.error(`[PaiementController] Détails de la réponse d'erreur:`, {
            status: axiosError.response.status,
            data: axiosError.response.data
          });
        }
        return {
          success: false,
          message: `Erreur lors de la communication avec le serveur de paiement: ${axiosError.message}`
        };
      }

      // Rechercher la transaction associée (réutilise celle du short-circuit si déjà chargée)
      const transaction = transactionPrechargee ?? await TransactionModel.findByReferenceOperateur(billId);

      if (!transaction) {
        return {
          success: false,
          message: "Transaction non trouvée pour cette facture."
        };
      }


      // Traiter selon l'état de la facture
      if (billState === 'processed' || billState === 'paid') {
        // Charger la commande une seule fois (réutilisée pour montant + update)
        let commande = transaction.commande_id
          ? await CommandeModel.getCommandeById(transaction.commande_id)
          : null;

        const montantVerification = await PaiementController.verifierMontantTransaction(transaction, commande);

        if (!montantVerification.isValid) {
          logger.error(`[PaiementController] Erreur de vérification du montant: ${montantVerification.message}`);
          return {
            success: false,
            message: montantVerification.message || 'Montant de la transaction non conforme',
            needsReview: true
          };
        }

        if (montantVerification.commande) {
          commande = montantVerification.commande;
        }

        const methode_paiement = PaiementController.mapPaymentSystemToMethode(paymentSystemName);

        const statutTransaction: StatutPaiement = 'paye';

        const updateData: any = {
          statut: statutTransaction,
          reference_operateur: billId,
          reference_transaction: psTransactionId,
          date_confirmation: new Date(),
          notes: `Paiement confirmé via API. État: ${billState}${paymentSystemName ? `, Système: ${paymentSystemName}` : ''}`
        };

        if (methode_paiement) {
          updateData.methode_paiement = methode_paiement;
        }

        await TransactionModel.updateTransaction(transaction.id, updateData);

        if (transaction.commande_id && commande) {
          const montantPaye = await CommandeModel.getMontantPaye(transaction.commande_id);

          let nouveauStatutPaiement: StatutPaiement;
          let nouveauStatutCommande = commande.statut;

          if (montantPaye <= 0) {
            nouveauStatutPaiement = 'en_attente';
          } else if (montantPaye < commande.total) {
            nouveauStatutPaiement = 'partiellement_paye';
          } else {
            nouveauStatutPaiement = 'paye';
          }

          if (montantPaye > 0 && commande.statut === 'en_attente') {
            nouveauStatutCommande = 'confirmee';
          }

          await CommandeModel.updatePaymentStatus(
            transaction.commande_id,
            nouveauStatutPaiement,
            updateData.methode_paiement || commande.methode_paiement
          );

          if (nouveauStatutCommande !== commande.statut) {
            await CommandeModel.updateCommandeStatus(transaction.commande_id, nouveauStatutCommande);
          }

          if (commande.client_telephone) {
            try {
              await WhatsappSubscriberModel.subscribe(commande.client_telephone, commande.client_nom);
            } catch (subError: any) {
              logger.error(`[PaiementController] Échec de l'abonnement automatique WhatsApp pour ${commande.client_telephone}:`, subError.message);
            }
          }

          // Confirmation WhatsApp client + vendeur uniquement au passage en_attente → confirmee
          if (commande.statut === 'en_attente' && nouveauStatutCommande === 'confirmee') {
            await this.sendConfirmationNotifications(transaction.commande_id, montantPaye);
          }
        }

        return {
          success: true,
          message: "Le paiement a été confirmé avec succès.",
          billState: billState,
          transaction: await TransactionModel.getTransactionById(transaction.id)
        };
      } else {
        // Mettre à jour la transaction avec les informations disponibles
        if (paymentSystemName) {
          const methode_paiement = PaiementController.mapPaymentSystemToMethode(paymentSystemName);
          if (methode_paiement) {
            await TransactionModel.updateTransaction(transaction.id, {
              methode_paiement: methode_paiement,
              notes: `Paiement en attente. Système de paiement: ${paymentSystemName}`
            });
          }
        }

        return {
          success: false,
          message: "Paiement en attente de confirmation. La facture est prête pour le paiement.",
          state: billState,
          transaction: await TransactionModel.getTransactionById(transaction.id)
        };
      }

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

  /**
   * Réconciliation des transactions encore en_attente après le délai configuré.
   * Relit l'état Ebilling : paid/processed → confirmation ; ready/expired → échec + WhatsApp.
   */
  static async reconcileStalePayments(): Promise<{
    confirmations: number;
    echecs_notifies: number;
    erreurs: number;
    timeout_minutes: number;
    examined: number;
  }> {
    const timeoutMinutes = Math.max(
      1,
      parseInt(process.env.PAYMENT_RECONCILE_AFTER_MINUTES || '60', 10) || 60
    );

    const SERVER_URL = process.env.EBILLING_SERVER_URL || 'https://stg.billing-easy.com/api/v1/merchant/e_bills';
    const USER_NAME = process.env.EBILLING_USER_NAME || '';
    const SHARED_KEY = process.env.EBILLING_SHARED_KEY || '';

    let confirmations = 0;
    let echecs_notifies = 0;
    let erreurs = 0;

    const staleTransactions = await TransactionModel.getStalePendingTransactions(timeoutMinutes);
    logger.info(
      `[PaiementController] Réconciliation: ${staleTransactions.length} transaction(s) en_attente > ${timeoutMinutes} min`
    );

    for (const transaction of staleTransactions) {
      const billId = transaction.reference_operateur;
      if (!billId) {
        continue;
      }

      try {
        const response = await axios.get(`${SERVER_URL}/${billId}`, {
          auth: { username: USER_NAME, password: SHARED_KEY },
          headers: { Accept: '*/*' },
        });

        const billState = String(response.data?.state || '').toLowerCase();

        if (billState === 'processed' || billState === 'paid') {
          const result = await PaiementController.processPaymentVerification(billId, transaction);
          if (result.success) {
            confirmations += 1;
            logger.info(
              `[PaiementController] Réconciliation: TX ${transaction.id} confirmée (bill ${billId})`
            );
          } else {
            erreurs += 1;
            logger.warn(
              `[PaiementController] Réconciliation: TX ${transaction.id} paid/processed mais process a échoué: ${result.message}`
            );
          }
          continue;
        }

        if (billState === 'ready' || billState === 'expired') {
          await TransactionModel.markTransactionAsFailed(
            transaction.id,
            transaction.commande_id,
            `Réconciliation cron: facture Ebilling encore "${billState}" après ${timeoutMinutes} min`
          );

          const phone =
            (transaction as any).commande?.client_telephone ||
            transaction.numero_telephone;

          if (phone) {
            try {
              const messageId = await WhatsAppService.notifyPaymentFailed(phone);
              if (messageId) {
                echecs_notifies += 1;
              }
            } catch (waError: any) {
              logger.error(
                `[PaiementController] Réconciliation WhatsApp échec paiement TX ${transaction.id}:`,
                waError.message
              );
            }
          }

          logger.info(
            `[PaiementController] Réconciliation: TX ${transaction.id} en échec (bill ${billId}, state=${billState})`
          );
          continue;
        }

        logger.debug(
          `[PaiementController] Réconciliation: TX ${transaction.id} état Ebilling ignoré: ${billState}`
        );
      } catch (error: any) {
        erreurs += 1;
        logger.error(
          `[PaiementController] Réconciliation erreur TX ${transaction.id} (bill ${billId}):`,
          error.message
        );
      }
    }

    return {
      confirmations,
      echecs_notifies,
      erreurs,
      timeout_minutes: timeoutMinutes,
      examined: staleTransactions.length,
    };
  }

  /**
   * Envoie les notifications WhatsApp de confirmation (client + vendeur) après paiement.
   * Ne bloque jamais le flux de paiement en cas d'échec WhatsApp.
   */
  private static async sendConfirmationNotifications(
    commandeId: number,
    montantPaye: number
  ): Promise<void> {
    try {
      const commande = await CommandeModel.getCommandeById(commandeId);
      if (!commande) {
        logger.warn(`[PaiementController] Commande ${commandeId} introuvable pour notifications WhatsApp`);
        return;
      }

      const articles = commande.articles || [];
      const boutiqueName = commande.boutique?.nom || 'La boutique';
      const boutiqueTelephone = commande.boutique?.telephone;

      if (commande.client_telephone) {
        try {
          const messageId = await WhatsAppService.sendOrderStatusNotification('confirmee', {
            clientNom: commande.client_nom || 'Client',
            clientTelephone: commande.client_telephone,
            numeroCommande: commande.numero_commande,
            boutiqueName,
            boutiqueTelephone,
            total: commande.total,
            fraisLivraison: commande.frais_livraison || 0,
            clientAdresse: commande.client_adresse,
            clientVille: commande.client_ville,
            clientCommune: commande.client_commune,
            articles,
            montantPaye,
          });

          if (messageId) {
            logger.debug(`[PaiementController] Confirmation WhatsApp client envoyée: ${messageId}`);
          } else {
            logger.debug('[PaiementController] Confirmation WhatsApp client non envoyée');
          }
        } catch (clientWaError: any) {
          logger.error('[PaiementController] Erreur WhatsApp client:', clientWaError.message);
        }
      }

      const vendeurTelephone = await this.resolveVendeurWhatsAppPhone(commande);
      if (!vendeurTelephone) {
        logger.debug(`[PaiementController] Aucun téléphone vendeur pour commande ${commande.numero_commande}`);
        return;
      }

      try {
        const vendeurMessageId = await WhatsAppService.notifyVendeurNewOrder(vendeurTelephone, {
          numeroCommande: commande.numero_commande,
          clientNom: commande.client_nom || 'Client',
          total: commande.total,
          nombreArticles: articles.length,
          articles,
          montantPaye,
          clientAdresse: commande.client_adresse,
          clientVille: commande.client_ville,
          clientCommune: commande.client_commune,
        });

        if (vendeurMessageId) {
          logger.debug(`[PaiementController] Notification WhatsApp vendeur envoyée: ${vendeurMessageId}`);
        } else {
          logger.debug('[PaiementController] Notification WhatsApp vendeur non envoyée');
        }
      } catch (vendeurWaError: any) {
        logger.error('[PaiementController] Erreur WhatsApp vendeur:', vendeurWaError.message);
      }
    } catch (error: any) {
      logger.error('[PaiementController] Erreur notifications confirmation WhatsApp:', error.message);
    }
  }

  /**
   * Résout le numéro WhatsApp du vendeur : téléphone vendeur > boutique > numero_paiement
   */
  private static async resolveVendeurWhatsAppPhone(commande: Commande): Promise<string | null> {
    const boutique = commande.boutique;
    if (!boutique) {
      return null;
    }

    if (boutique.vendeur_id) {
      try {
        const vendeur = await VendeurModel.getVendeurById(boutique.vendeur_id);
        if (vendeur?.telephone) {
          return vendeur.telephone;
        }
        if (vendeur?.numero_paiement) {
          return vendeur.numero_paiement;
        }
      } catch (error: any) {
        logger.error(`[PaiementController] Impossible de charger le vendeur ${boutique.vendeur_id}:`, error.message);
      }
    }

    return boutique.telephone || null;
  }
}
