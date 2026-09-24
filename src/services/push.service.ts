import webpush from 'web-push';
import { logger } from '../utils/logger';
import { PushSubscriptionModel } from '../models/push_subscription.model';

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

let vapidConfigured = false;

const configureVapid = (): boolean => {
  if (vapidConfigured) {
    return true;
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;

  return true;
};

/**
 * Service d'envoi de notifications push web (VAPID) aux vendeurs.
 * Miroir de WhatsAppService : les abonnés expirés (410/404) sont supprimés en base.
 */
export class PushService {
  static isConfigured(): boolean {
    return configureVapid();
  }

  static getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /**
   * Envoie une notification push à tous les abonnements d'un vendeur.
   * Ne lève jamais d'exception : les échecs sont journalisés individuellement.
   */
  static async sendToVendeur(vendeurId: number, payload: PushNotificationPayload): Promise<number> {
    if (!this.isConfigured()) {
      logger.debug('[PushService] Service push non configuré (VAPID manquant), envoi ignoré');
      return 0;
    }

    const subscriptions = await PushSubscriptionModel.findByVendeurId(vendeurId);
    if (subscriptions.length === 0) {
      return 0;
    }

    const body = JSON.stringify(payload);
    let sentCount = 0;

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body
        );
        sentCount += 1;
      } catch (error: any) {
        const statusCode = error?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          logger.debug(`[PushService] Abonnement expiré, suppression: ${subscription.endpoint}`);
          await PushSubscriptionModel.deleteByEndpoint(subscription.endpoint);
        } else {
          logger.error(
            `[PushService] Erreur d'envoi pour l'abonnement ${subscription.endpoint}:`,
            error.message
          );
        }
      }
    }

    return sentCount;
  }
}
