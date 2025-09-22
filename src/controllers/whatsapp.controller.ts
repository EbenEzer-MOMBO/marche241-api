import { Request, Response } from 'express';
import { WhatsAppService, CommandeConfirmation } from '../services/whatsapp.service';

export class WhatsAppController {
  /**
   * Envoie une confirmation de commande via WhatsApp
   */
  static async envoyerConfirmationCommande(req: Request, res: Response): Promise<void> {
    try {
      const {
        numeroCommande,
        nomClient,
        montantTotal,
        dateCommande,
        produits,
        adresseLivraison,
        telephoneClient
      } = req.body;

      // Validation des champs obligatoires
      if (!numeroCommande || !nomClient || !montantTotal || !telephoneClient || !produits) {
        res.status(400).json({
          success: false,
          message: 'Les champs numeroCommande, nomClient, montantTotal, telephoneClient et produits sont obligatoires'
        });
        return;
      }

      // Validation du numéro de téléphone
      if (!WhatsAppService.validerNumeroWhatsApp(telephoneClient)) {
        res.status(400).json({
          success: false,
          message: 'Le numéro de téléphone WhatsApp n\'est pas valide. Format attendu: +241XXXXXXXXX'
        });
        return;
      }

      // Validation du montant
      if (typeof montantTotal !== 'number' || montantTotal <= 0) {
        res.status(400).json({
          success: false,
          message: 'Le montant total doit être un nombre positif'
        });
        return;
      }

      // Validation des produits
      if (!Array.isArray(produits) || produits.length === 0) {
        res.status(400).json({
          success: false,
          message: 'La liste des produits ne peut pas être vide'
        });
        return;
      }

      // Validation de chaque produit
      for (const produit of produits) {
        if (!produit.nom || !produit.quantite || !produit.prix) {
          res.status(400).json({
            success: false,
            message: 'Chaque produit doit avoir un nom, une quantité et un prix'
          });
          return;
        }
      }

      const commandeData: CommandeConfirmation = {
        numeroCommande,
        nomClient,
        montantTotal,
        dateCommande: dateCommande || new Date().toLocaleDateString('fr-FR'),
        produits,
        adresseLivraison,
        telephoneClient: WhatsAppService.formaterNumeroWhatsApp(telephoneClient)
      };

      // Tentative d'envoi avec template d'abord, puis fallback sur message texte
      let resultat;
      try {
        resultat = await WhatsAppService.envoyerConfirmationCommande(commandeData);
      } catch (templateError: any) {
        console.log('Échec du template, utilisation du message texte:', templateError.message);
        resultat = await WhatsAppService.envoyerConfirmationCommandeTexte(commandeData);
      }

      res.status(200).json({
        success: true,
        message: 'Confirmation de commande envoyée avec succès via WhatsApp',
        data: {
          messageId: resultat.messages?.[0]?.id,
          numeroDestination: commandeData.telephoneClient,
          numeroCommande: numeroCommande
        }
      });

    } catch (error: any) {
      console.error('Erreur lors de l\'envoi de la confirmation WhatsApp:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de la confirmation WhatsApp',
        error: error.message
      });
    }
  }

  /**
   * Envoie une notification de changement de statut de commande
   */
  static async envoyerNotificationStatut(req: Request, res: Response): Promise<void> {
    try {
      const { telephone, numeroCommande, nouveauStatut, nomClient } = req.body;

      // Validation des champs obligatoires
      if (!telephone || !numeroCommande || !nouveauStatut || !nomClient) {
        res.status(400).json({
          success: false,
          message: 'Les champs telephone, numeroCommande, nouveauStatut et nomClient sont obligatoires'
        });
        return;
      }

      // Validation du numéro de téléphone
      if (!WhatsAppService.validerNumeroWhatsApp(telephone)) {
        res.status(400).json({
          success: false,
          message: 'Le numéro de téléphone WhatsApp n\'est pas valide'
        });
        return;
      }

      const telephoneFormate = WhatsAppService.formaterNumeroWhatsApp(telephone);

      const resultat = await WhatsAppService.envoyerNotificationStatut(
        telephoneFormate,
        numeroCommande,
        nouveauStatut,
        nomClient
      );

      res.status(200).json({
        success: true,
        message: 'Notification de statut envoyée avec succès via WhatsApp',
        data: {
          messageId: resultat.messages?.[0]?.id,
          numeroDestination: telephoneFormate,
          numeroCommande: numeroCommande,
          nouveauStatut: nouveauStatut
        }
      });

    } catch (error: any) {
      console.error('Erreur lors de l\'envoi de la notification de statut:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de la notification de statut',
        error: error.message
      });
    }
  }

  /**
   * Envoie un message WhatsApp personnalisé
   */
  static async envoyerMessage(req: Request, res: Response): Promise<void> {
    try {
      const { telephone, message } = req.body;

      // Validation des champs obligatoires
      if (!telephone || !message) {
        res.status(400).json({
          success: false,
          message: 'Les champs telephone et message sont obligatoires'
        });
        return;
      }

      // Validation du numéro de téléphone
      if (!WhatsAppService.validerNumeroWhatsApp(telephone)) {
        res.status(400).json({
          success: false,
          message: 'Le numéro de téléphone WhatsApp n\'est pas valide'
        });
        return;
      }

      const telephoneFormate = WhatsAppService.formaterNumeroWhatsApp(telephone);

      const messageWhatsApp = {
        messaging_product: 'whatsapp' as const,
        to: telephoneFormate,
        type: 'text' as const,
        text: {
          body: message
        }
      };

      const resultat = await WhatsAppService.sendMessage(messageWhatsApp);

      res.status(200).json({
        success: true,
        message: 'Message envoyé avec succès via WhatsApp',
        data: {
          messageId: resultat.messages?.[0]?.id,
          numeroDestination: telephoneFormate
        }
      });

    } catch (error: any) {
      console.error('Erreur lors de l\'envoi du message WhatsApp:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi du message WhatsApp',
        error: error.message
      });
    }
  }

  /**
   * Valide un numéro de téléphone WhatsApp
   */
  static async validerNumero(req: Request, res: Response): Promise<void> {
    try {
      const { telephone } = req.body;

      if (!telephone) {
        res.status(400).json({
          success: false,
          message: 'Le champ telephone est obligatoire'
        });
        return;
      }

      const estValide = WhatsAppService.validerNumeroWhatsApp(telephone);
      const numeroFormate = estValide ? WhatsAppService.formaterNumeroWhatsApp(telephone) : null;

      res.status(200).json({
        success: true,
        data: {
          numeroOriginal: telephone,
          numeroFormate: numeroFormate,
          estValide: estValide
        }
      });

    } catch (error: any) {
      console.error('Erreur lors de la validation du numéro:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la validation du numéro',
        error: error.message
      });
    }
  }

  /**
   * Endpoint de test pour vérifier la configuration WhatsApp
   */
  static async testConfiguration(req: Request, res: Response): Promise<void> {
    try {
      const { telephone } = req.body;

      if (!telephone) {
        res.status(400).json({
          success: false,
          message: 'Le champ telephone est obligatoire pour le test'
        });
        return;
      }

      // Test avec des données de commande fictives
      const commandeTest: any = {
        numeroCommande: `TEST-${Date.now()}`,
        nomClient: 'Client Test',
        montantTotal: 5000,
        dateCommande: new Date().toLocaleDateString('fr-FR'),
        telephoneClient: telephone,
        produits: [
          {
            nom: 'Produit Test',
            quantite: 1,
            prix: 5000
          }
        ],
        adresseLivraison: 'Adresse de test',
        nomBoutique: 'Marché 241'
      };

      // Préparation de la liste des produits formatée
      const produitsFormatte = commandeTest.produits
        .map((p: any) => `• ${p.nom} (x${p.quantite}) - ${p.prix} FCFA`)
        .join('\n');

      // Test avec le template commande_validee et les variables attendues
      const messageTest = {
        messaging_product: 'whatsapp' as const,
        to: WhatsAppService.formaterNumeroWhatsApp(telephone),
        type: 'template' as const,
        template: {
          name: 'commande_validation',
          language: {
            code: 'fr'
          },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: commandeTest.nomClient },                // customer_name
              { type: 'text', text: commandeTest.numeroCommande },            // order_number
              { type: 'text', text: commandeTest.montantTotal.toString() },    // total_amount
              { type: 'text', text: commandeTest.dateCommande },              // order_date
              { type: 'text', text: produitsFormatte },                        // product_list
              { type: 'text', text: commandeTest.nomBoutique }                // shop_name1
            ]
          }]
        }
      };

      let resultat;
      try {
        resultat = await WhatsAppService.sendMessage(messageTest);
      } catch (error: any) {
        throw new Error(`Échec du test: ${error.message}`);
      }

      res.status(200).json({
        success: true,
        message: 'Test WhatsApp réussi ! Message de confirmation envoyé.',
        data: {
          messageId: resultat.messages?.[0]?.id,
          numeroDestination: WhatsAppService.formaterNumeroWhatsApp(telephone),
          commandeTest: commandeTest,
          templateUtilise: 'commande_validee',
          parametresTemplate: messageTest.template.components[0].parameters
        }
      });

    } catch (error: any) {
      console.error('Erreur lors du test WhatsApp:', error.message);
      res.status(500).json({
        success: false,
        message: 'Échec du test WhatsApp',
        error: error.message,
        details: 'Vérifiez votre configuration WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID'
      });
    }
  }

  /**
   * Webhook pour recevoir les notifications WhatsApp
   */
  static async webhook(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body;

      // Vérification du token de validation (pour la configuration initiale)
      if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
        console.log('Webhook WhatsApp vérifié avec succès');
        res.status(200).send(req.query['hub.challenge']);
        return;
      }

      // Traitement des notifications WhatsApp
      if (body.object === 'whatsapp_business_account') {
        body.entry?.forEach((entry: any) => {
          entry.changes?.forEach((change: any) => {
            if (change.field === 'messages') {
              const messages = change.value.messages;
              const statuses = change.value.statuses;

              // Traitement des messages reçus
              if (messages) {
                messages.forEach((message: any) => {
                  console.log('Message reçu:', {
                    from: message.from,
                    id: message.id,
                    timestamp: message.timestamp,
                    type: message.type,
                    text: message.text?.body
                  });
                });
              }

              // Traitement des statuts de livraison
              if (statuses) {
                statuses.forEach((status: any) => {
                  console.log('Statut de message:', {
                    id: status.id,
                    status: status.status,
                    timestamp: status.timestamp,
                    recipient_id: status.recipient_id
                  });
                });
              }
            }
          });
        });
      }

      res.status(200).json({ success: true });

    } catch (error: any) {
      console.error('Erreur dans le webhook WhatsApp:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du traitement du webhook',
        error: error.message
      });
    }
  }
}
