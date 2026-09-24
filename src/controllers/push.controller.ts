import { Request, Response } from 'express';
import { PushService } from '../services/push.service';
import { PushSubscriptionModel } from '../models/push_subscription.model';

export class PushController {
  /**
   * Retourne la clé publique VAPID nécessaire au frontend pour s'abonner.
   */
  static async getVapidPublicKey(req: Request, res: Response): Promise<void> {
    const publicKey = PushService.getVapidPublicKey();

    if (!publicKey) {
      res.status(500).json({
        success: false,
        message: 'Service de notifications push non configuré sur le serveur'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { publicKey }
    });
  }

  /**
   * Enregistre un abonnement push pour le vendeur authentifié.
   */
  static async subscribe(req: Request, res: Response): Promise<void> {
    try {
      const vendeur = req.vendeur;
      if (!vendeur) {
        res.status(401).json({ success: false, message: 'Vendeur non authentifié' });
        return;
      }

      const { endpoint, keys } = req.body;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        res.status(400).json({
          success: false,
          message: 'Les champs endpoint, keys.p256dh et keys.auth sont obligatoires'
        });
        return;
      }

      const subscription = await PushSubscriptionModel.subscribe(
        vendeur.id,
        { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        req.headers['user-agent']
      );

      res.status(200).json({
        success: true,
        message: 'Abonnement aux notifications push enregistré avec succès',
        data: subscription
      });
    } catch (error: any) {
      console.error("Erreur lors de l'abonnement push:", error.message);
      res.status(500).json({
        success: false,
        message: "Erreur lors de l'abonnement aux notifications push",
        error: error.message
      });
    }
  }

  /**
   * Supprime un abonnement push (désabonnement).
   */
  static async unsubscribe(req: Request, res: Response): Promise<void> {
    try {
      const { endpoint } = req.body;

      if (!endpoint) {
        res.status(400).json({
          success: false,
          message: 'Le champ endpoint est obligatoire'
        });
        return;
      }

      await PushSubscriptionModel.deleteByEndpoint(endpoint);

      res.status(200).json({
        success: true,
        message: 'Désabonnement des notifications push réussi'
      });
    } catch (error: any) {
      console.error('Erreur lors du désabonnement push:', error.message);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du désabonnement des notifications push',
        error: error.message
      });
    }
  }
}
