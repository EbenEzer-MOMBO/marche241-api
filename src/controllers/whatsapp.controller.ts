import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { WhatsAppService } from '../services/whatsapp.service';
import { WhatsappSubscriberModel } from '../models/whatsapp_subscriber.model';

export class WhatsAppController {
  /**
   * Envoi de texte libre supprimé : GREEN-API est retiré, seuls les templates Meta sont utilisés.
   */
  static async envoyerMessage(_req: Request, res: Response): Promise<void> {
    res.status(410).json({
      success: false,
      message: 'Envoi de message libre indisponible : WhatsApp passe uniquement par les templates Meta.',
      code: 'WHATSAPP_TEXTE_LIBRE_SUPPRIME'
    });
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
          motifAnnulation,
          articles: req.body.articles,
          montantPaye: req.body.montantPaye ?? req.body.montant_paye ?? 0,
        }
      );

      if (!messageId) {
        res.status(200).json({
          success: true,
          message: 'Notification non envoyée (Meta non configuré ou statut sans template défini)',
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
          nombreArticles,
          articles: req.body.articles,
          montantPaye: req.body.montantPaye ?? req.body.montant_paye ?? 0,
          clientAdresse: req.body.clientAdresse || req.body.client_adresse,
          clientVille: req.body.clientVille || req.body.client_ville,
          clientCommune: req.body.clientCommune || req.body.client_commune,
        }
      );

      if (!messageId) {
        res.status(500).json({
          success: false,
          message: 'Échec de l\'envoi de la notification. Vérifiez la configuration Meta (WHATSAPP_*).'
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
   * Vérifie le statut de la configuration WhatsApp
   */
  static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const metaConfigured = WhatsAppService.isMetaConfigured();

      res.status(200).json({
        success: true,
        data: {
          configured: metaConfigured,
          provider: 'Meta Cloud API',
          meta: {
            configured: metaConfigured,
            provider: 'Meta Cloud API',
            graphVersion: process.env.META_WHATSAPP_GRAPH_VERSION || 'v21.0',
            phoneNumberIdConfigured: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
            accessTokenConfigured: !!process.env.WHATSAPP_ACCESS_TOKEN,
          },
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
   * Vérification d'existence d'un compte WhatsApp : impossible via l'API Meta Cloud
   * (GREEN-API retiré). Réponse permissive pour ne pas bloquer les parcours existants.
   */
  static async checkWhatsAppNumber(req: Request, res: Response): Promise<void> {
    const { telephone } = req.body;

    if (!telephone) {
      res.status(400).json({
        success: false,
        message: 'Le champ telephone est obligatoire'
      });
      return;
    }

    res.status(200).json({
      success: true,
      existsWhatsapp: true,
      verifie: false
    });
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

