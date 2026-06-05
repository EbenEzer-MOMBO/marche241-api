import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { WhatsAppService } from '../services/whatsapp.service';
import { WhatsappSubscriberModel } from '../models/whatsapp_subscriber.model';

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

      // 1. Tenter d'authentifier l'utilisateur via le token s'il est fourni (facultatif)
      let isUserAuthenticated = false;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET || '');
          if (decoded) {
            isUserAuthenticated = true;
          }
        } catch (e) {
          // Token invalide ou expiré, considéré comme anonyme
        }
      }

      // 2. Si l'utilisateur n'est pas authentifié, restreindre strictement le contenu au format OTP
      if (!isUserAuthenticated) {
        // Valider le format du message : il doit correspondre au format d'envoi de code de vérification
        // Exemple : "Votre code de vérification Marché241 est: 123456\n\nCe code expire dans 10 minutes."
        const otpRegex = /^Votre code de vérification Marché241 est:\s*(\d{4,8})\n\nCe code expire dans 10 minutes\.$/i;
        if (!otpRegex.test(message.trim())) {
          console.warn(`[WhatsAppController] Envoi bloqué : format de message non autorisé pour les requêtes anonymes. Destination: ${telephone}`);
          res.status(403).json({
            success: false,
            message: 'Action interdite. Format de message non autorisé pour les requêtes publiques.',
            code: 'FORBIDDEN_MESSAGE_FORMAT'
          });
          return;
        }
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

  /**
   * Vérifie si un numéro dispose d'un compte WhatsApp
   */
  static async checkWhatsAppNumber(req: Request, res: Response): Promise<void> {
    try {
      const { telephone } = req.body;

      if (!telephone) {
        res.status(400).json({
          success: false,
          message: 'Le champ telephone est obligatoire'
        });
        return;
      }

      // Vérifier si le service est configuré
      if (!WhatsAppService.isConfigured()) {
        res.status(500).json({
          success: false,
          message: 'Service WhatsApp non configuré sur le serveur backend.'
        });
        return;
      }

      const result = await WhatsAppService.checkWhatsAppNumber(telephone);

      if (!result) {
        res.status(500).json({
          success: false,
          message: 'Échec de la vérification WhatsApp.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        existsWhatsapp: result.existsWhatsapp
      });

    } catch (error: any) {
      console.error('Erreur lors de la vérification du numéro WhatsApp:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du numéro WhatsApp',
        error: error.message
      });
    }
  }

  /**
   * Désabonne un utilisateur de la liste WhatsApp (Opt-out)
   */
  static async optOut(req: Request, res: Response): Promise<void> {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        res.status(400).json({
          success: false,
          message: "L'identifiant de désabonnement est requis et doit être valide"
        });
        return;
      }
      
      res.status(400).send(WhatsAppController.getErrorHtml("L'identifiant de désabonnement est invalide ou manquant."));
      return;
    }

    try {
      const subscriber = await WhatsappSubscriberModel.unsubscribeById(Number(id));

      if (!subscriber) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
          res.status(404).json({
            success: false,
            message: "Abonné non trouvé"
          });
          return;
        }
        res.status(404).send(WhatsAppController.getErrorHtml("Ce lien de désabonnement semble expiré ou invalide. Aucun abonné correspondant n'a été trouvé."));
        return;
      }

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        res.status(200).json({
          success: true,
          message: 'Vous avez été désabonné avec succès des notifications WhatsApp',
          data: subscriber
        });
        return;
      }

      res.status(200).send(WhatsAppController.getSuccessHtml());

    } catch (error: any) {
      console.error('Erreur lors du désabonnement WhatsApp:', error.message);
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        res.status(500).json({
          success: false,
          message: 'Erreur lors du désabonnement',
          error: error.message
        });
        return;
      }
      res.status(500).send(WhatsAppController.getErrorHtml("Une erreur interne est survenue lors de votre demande de désabonnement."));
    }
  }

  /**
   * Retourne le code HTML pour une page de désabonnement réussi.
   */
  private static getSuccessHtml(): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Désabonnement Réussi - Marché 241</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Outfit', sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            background-color: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            text-align: center;
            max-width: 450px;
            width: 100%;
        }
        .icon {
            background-color: #f0fdf4;
            color: #16a34a;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            margin: 0 auto 24px;
            line-height: 80px;
        }
        h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #0f172a;
        }
        p {
            font-size: 16px;
            color: #64748b;
            line-height: 1.6;
            margin-bottom: 32px;
        }
        .btn {
            display: inline-block;
            background-color: #1e293b;
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        .btn:hover {
            background-color: #0f172a;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✓</div>
        <h1>Désabonnement réussi</h1>
        <p>Vous avez été retiré avec succès de notre liste de diffusion WhatsApp. Vous ne recevrez plus de messages promotionnels ou d'actualités sur ce numéro.</p>
        <a href="https://marche241.ga/" class="btn">Retour au site</a>
    </div>
</body>
</html>
    `;
  }

  /**
   * Retourne le code HTML pour une page d'erreur de désabonnement.
   */
  private static getErrorHtml(errorMessage: string): string {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erreur de Désabonnement - Marché 241</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Outfit', sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 20px;
            box-sizing: border-box;
        }
        .container {
            background-color: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            text-align: center;
            max-width: 450px;
            width: 100%;
        }
        .icon {
            background-color: #fef2f2;
            color: #dc2626;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            margin: 0 auto 24px;
            line-height: 80px;
        }
        h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 12px;
            color: #0f172a;
        }
        p {
            font-size: 16px;
            color: #64748b;
            line-height: 1.6;
            margin-bottom: 32px;
        }
        .btn {
            display: inline-block;
            background-color: #1e293b;
            color: white;
            text-decoration: none;
            padding: 12px 24px;
            border-radius: 10px;
            font-weight: 600;
            font-size: 14px;
            transition: background-color 0.2s;
        }
        .btn:hover {
            background-color: #0f172a;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✕</div>
        <h1>Une erreur est survenue</h1>
        <p>${errorMessage}</p>
        <a href="https://marche241.com" class="btn">Retour au site</a>
    </div>
</body>
</html>
    `;
  }
}

