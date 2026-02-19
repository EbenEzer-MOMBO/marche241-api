import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';

export class WhatsAppController {
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

      const messageId = await WhatsAppService.sendMessage(telephone, message);

      if (!messageId) {
        res.status(500).json({
          success: false,
          message: 'Échec de l\'envoi du message. Vérifiez la configuration GREEN-API.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Message envoyé avec succès via WhatsApp',
        data: {
          messageId,
          numeroDestination: WhatsAppService.formatPhoneNumber(telephone)
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
   * Envoie une notification de changement de statut de commande
   */
  static async envoyerNotificationStatut(req: Request, res: Response): Promise<void> {
    try {
      const { 
        telephone, 
        numeroCommande, 
        nouveauStatut, 
        nomClient,
        boutiqueName,
        boutiqueTelephone,
        total,
        fraisLivraison,
        clientAdresse,
        clientVille,
        clientCommune,
        motifAnnulation
      } = req.body;

      // Validation des champs obligatoires
      if (!telephone || !numeroCommande || !nouveauStatut || !nomClient) {
        res.status(400).json({
          success: false,
          message: 'Les champs telephone, numeroCommande, nouveauStatut et nomClient sont obligatoires'
        });
        return;
      }

      const messageId = await WhatsAppService.sendOrderStatusNotification(
        nouveauStatut,
        {
          clientNom: nomClient,
          clientTelephone: telephone,
          numeroCommande,
          boutiqueName: boutiqueName || 'La boutique',
          boutiqueTelephone,
          total: total || 0,
          fraisLivraison: fraisLivraison || 0,
          clientAdresse,
          clientVille,
          clientCommune,
          motifAnnulation
        }
      );

      if (!messageId) {
        res.status(200).json({
          success: true,
          message: 'Notification non envoyée (service non configuré ou statut sans message défini)',
          data: {
            numeroDestination: telephone,
            numeroCommande,
            nouveauStatut
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Notification de statut envoyée avec succès via WhatsApp',
        data: {
          messageId,
          numeroDestination: WhatsAppService.formatPhoneNumber(telephone),
          numeroCommande,
          nouveauStatut
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
   * Notifie un vendeur d'une nouvelle commande
   */
  static async notifierVendeurNouvelleCommande(req: Request, res: Response): Promise<void> {
    try {
      const { 
        telephoneVendeur, 
        numeroCommande, 
        nomClient, 
        total, 
        nombreArticles 
      } = req.body;

      // Validation des champs obligatoires
      if (!telephoneVendeur || !numeroCommande || !nomClient || total === undefined || nombreArticles === undefined) {
        res.status(400).json({
          success: false,
          message: 'Les champs telephoneVendeur, numeroCommande, nomClient, total et nombreArticles sont obligatoires'
        });
        return;
      }

      const messageId = await WhatsAppService.notifyVendeurNewOrder(
        telephoneVendeur,
        {
          numeroCommande,
          clientNom: nomClient,
          total,
          nombreArticles
        }
      );

      if (!messageId) {
        res.status(500).json({
          success: false,
          message: 'Échec de l\'envoi de la notification. Vérifiez la configuration GREEN-API.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Notification vendeur envoyée avec succès',
        data: {
          messageId,
          numeroDestination: WhatsAppService.formatPhoneNumber(telephoneVendeur),
          numeroCommande
        }
      });

    } catch (error: any) {
      console.error('Erreur lors de l\'envoi de la notification vendeur:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de la notification vendeur',
        error: error.message
      });
    }
  }

  /**
   * Endpoint de test pour vérifier la configuration WhatsApp GREEN-API
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

      // Vérifier si le service est configuré
      if (!WhatsAppService.isConfigured()) {
        res.status(500).json({
          success: false,
          message: 'Service WhatsApp non configuré',
          details: 'Vérifiez les variables GREEN_API_ID_INSTANCE et GREEN_API_TOKEN'
        });
        return;
      }

      // Envoyer un message de test
      const messageTest = `🧪 *Test Marché 241*

Ce message confirme que la configuration WhatsApp GREEN-API fonctionne correctement.

📅 Date: ${new Date().toLocaleString('fr-FR')}
✅ Statut: Connecté`;

      const messageId = await WhatsAppService.sendMessage(telephone, messageTest);

      if (!messageId) {
        res.status(500).json({
          success: false,
          message: 'Échec du test. Message non envoyé.',
          details: 'Vérifiez les logs pour plus de détails.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Test WhatsApp réussi ! Message envoyé.',
        data: {
          messageId,
          numeroDestination: WhatsAppService.formatPhoneNumber(telephone),
          provider: 'GREEN-API'
        }
      });

    } catch (error: any) {
      console.error('Erreur lors du test WhatsApp:', error.message);
      res.status(500).json({
        success: false,
        message: 'Échec du test WhatsApp',
        error: error.message,
        details: 'Vérifiez votre configuration GREEN_API_ID_INSTANCE et GREEN_API_TOKEN'
      });
    }
  }

  /**
   * Vérifie le statut de la configuration WhatsApp
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const isConfigured = WhatsAppService.isConfigured();

      res.status(200).json({
        success: true,
        data: {
          configured: isConfigured,
          provider: 'GREEN-API',
          apiUrl: process.env.GREEN_API_URL || 'https://api.green-api.com',
          instanceConfigured: !!process.env.GREEN_API_ID_INSTANCE,
          tokenConfigured: !!process.env.GREEN_API_TOKEN
        }
      });

    } catch (error: any) {
      console.error('Erreur lors de la vérification du statut:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du statut',
        error: error.message
      });
    }
  }
}
