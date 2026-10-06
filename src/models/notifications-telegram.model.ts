import { query } from '../config/database';

/** Configuration des notifications Telegram (table notifications_telegram, ligne unique, migration 031). */
export interface ConfigNotificationsTelegram {
  chat_id: string | null;
  canal_nom: string | null;
  actif: boolean;
  evenements: string[];
  dernier_envoi_le: Date | null;
  derniere_erreur: string | null;
  modifie_par: string | null;
  date_modification: Date;
}

const COLONNES = 'chat_id, canal_nom, actif, evenements, dernier_envoi_le, derniere_erreur, modifie_par, date_modification';

export class NotificationsTelegramModel {
  static async lire(): Promise<ConfigNotificationsTelegram | null> {
    const { rows } = await query<ConfigNotificationsTelegram>(`SELECT ${COLONNES} FROM notifications_telegram WHERE id = 1`);
    return rows[0] ?? null;
  }

  static async enregistrer(donnees: {
    chat_id: string | null;
    canal_nom: string | null;
    actif: boolean;
    evenements: string[];
    modifie_par: string | null;
  }): Promise<ConfigNotificationsTelegram> {
    const { rows } = await query<ConfigNotificationsTelegram>(
      `INSERT INTO notifications_telegram (id, chat_id, canal_nom, actif, evenements, modifie_par, date_modification)
       VALUES (1, $1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         chat_id = EXCLUDED.chat_id, canal_nom = EXCLUDED.canal_nom, actif = EXCLUDED.actif,
         evenements = EXCLUDED.evenements, modifie_par = EXCLUDED.modifie_par, date_modification = NOW()
       RETURNING ${COLONNES}`,
      [donnees.chat_id, donnees.canal_nom, donnees.actif, donnees.evenements, donnees.modifie_par]
    );
    return rows[0];
  }

  /** Trace du dernier envoi : succès (erreur effacée) ou message d'erreur Telegram. */
  static async tracerEnvoi(erreur: string | null): Promise<void> {
    await query(
      erreur === null
        ? `UPDATE notifications_telegram SET dernier_envoi_le = NOW(), derniere_erreur = NULL WHERE id = 1`
        : `UPDATE notifications_telegram SET derniere_erreur = $1 WHERE id = 1`,
      erreur === null ? [] : [erreur.slice(0, 500)]
    );
  }
}
