import { Request, Response } from 'express';
import { EVENEMENTS_NOTIFICATION, GROUPES_NOTIFICATION } from '../config/notifications.config';
import { NotificationsTelegramModel } from '../models/notifications-telegram.model';
import {
  chargerConfigTelegram,
  envoyerTelegram,
  formaterMessage,
  notifier,
  TelegramErreur,
  verifierTelegram,
  viderCacheTelegram
} from '../services/telegram.service';
import { EvenementNotification } from '../config/notifications.config';
import { logger } from '../utils/logger';

const corps = (req: Request) => (req as any).validatedBody ?? req.body;

function repondreErreur(res: Response, err: unknown, contexte: string): void {
  if (err instanceof TelegramErreur) {
    res.status(err.statusHttp).json({ success: false, message: err.message, code: err.code });
    return;
  }
  logger.error(`[NotificationController] ${contexte} :`, (err as Error)?.message ?? err);
  res.status(500).json({ success: false, message: `Erreur lors de ${contexte}` });
}

async function etatComplet() {
  const config = await chargerConfigTelegram();
  return {
    config,
    verification: await verifierTelegram(config?.chat_id ?? null),
    groupes: GROUPES_NOTIFICATION,
    evenements: EVENEMENTS_NOTIFICATION.map(({ code, groupe, nom }) => ({ code, groupe, nom }))
  };
}

/** Notifications Telegram de l'équipe : réglages et envois pour le back-office (clé de service). */
export class NotificationController {
  static async lire(_req: Request, res: Response): Promise<void> {
    try {
      res.json({ success: true, telegram: await etatComplet() });
    } catch (err) {
      repondreErreur(res, err, 'la lecture des notifications Telegram');
    }
  }

  static async modifier(req: Request, res: Response): Promise<void> {
    try {
      const { chat_id, actif, evenements, modifie_par } = corps(req);
      const chatId = chat_id ? String(chat_id).trim() : null;
      let canalNom: string | null = null;
      if (chatId) {
        const verification = await verifierTelegram(chatId);
        // Sans jeton, on enregistre quand même le canal (il sera vérifié quand le jeton sera en place)
        if (verification.jeton_present && verification.erreur) {
          res.status(400).json({
            success: false,
            message: verification.erreur,
            code: 'VALIDATION_ERROR',
            errors: [{ field: 'chat_id', code: 'TELEGRAM_CANAL_INACCESSIBLE', message: verification.erreur }]
          });
          return;
        }
        canalNom = verification.canal?.titre ?? null;
      }
      if (actif && !chatId) {
        const message = 'Renseignez le canal avant d’activer les notifications';
        res.status(400).json({ success: false, message, code: 'VALIDATION_ERROR', errors: [{ field: 'chat_id', code: 'CHAMP_REQUIS', message }] });
        return;
      }
      await NotificationsTelegramModel.enregistrer({ chat_id: chatId, canal_nom: canalNom, actif, evenements, modifie_par });
      viderCacheTelegram();
      res.json({ success: true, telegram: await etatComplet() });
    } catch (err) {
      repondreErreur(res, err, "l'enregistrement des notifications Telegram");
    }
  }

  static async tester(_req: Request, res: Response): Promise<void> {
    try {
      const config = await chargerConfigTelegram();
      if (!config?.chat_id) {
        res.status(409).json({ success: false, message: 'Renseignez et enregistrez le canal avant le test', code: 'TELEGRAM_CANAL_MANQUANT' });
        return;
      }
      await envoyerTelegram(
        config.chat_id,
        formaterMessage('test', {
          titre: 'Test des notifications Marché 241',
          lignes: ['Si vous lisez ce message, le canal est bien relié au back-office.', config.actif ? null : 'Les notifications sont actuellement désactivées.']
        })
      );
      await NotificationsTelegramModel.tracerEnvoi(null);
      viderCacheTelegram();
      res.json({ success: true, message: 'Message de test envoyé' });
    } catch (err) {
      if (err instanceof TelegramErreur) await NotificationsTelegramModel.tracerEnvoi(err.message).catch(() => undefined);
      repondreErreur(res, err, "l'envoi du message de test");
    }
  }

  /** Événements émis par le back-office (versements) : filtrés par les mêmes réglages. */
  static async evenement(req: Request, res: Response): Promise<void> {
    try {
      const { evenement, titre, lignes, lien } = corps(req);
      const envoye = await notifier(evenement as EvenementNotification, { titre, lignes, lien });
      res.json({ success: true, envoye });
    } catch (err) {
      repondreErreur(res, err, "l'envoi de la notification");
    }
  }
}
