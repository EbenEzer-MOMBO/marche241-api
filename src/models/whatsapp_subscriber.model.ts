import { query } from '../config/database';

export interface WhatsappSubscriber {
  id?: number;
  phone: string;
  name: string | null;
  status: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export class WhatsappSubscriberModel {
  private static readonly TABLE_NAME = 'whatsapp_subscribers';

  /**
   * Normalise un numéro de téléphone pour WhatsApp avec le préfixe '+'
   */
  private static normalizePhone(phone: string): string {
    const onlyDigits = phone.trim().replace(/\D/g, '');
    if (onlyDigits === '') {
      return '';
    }
    let digits = onlyDigits;
    if (digits.startsWith('0')) {
      digits = '241' + digits.substring(1);
    }
    if (digits.length <= 9) {
      digits = '241' + digits;
    }
    return '+' + digits;
  }

  /**
   * Enregistre ou met à jour un abonné en statut actif
   * @param phone Numéro de téléphone
   * @param name Nom de l'abonné
   */
  static async subscribe(phone: string, name: string | null = null): Promise<WhatsappSubscriber> {
    const cleanedPhone = this.normalizePhone(phone);

    if (!cleanedPhone) {
      throw new Error('Le numéro de téléphone ne peut pas être vide ou invalide');
    }

    try {
      // `phone` étant unique, l'insertion et la réactivation se font en une
      // seule requête atomique : deux appels concurrents ne peuvent pas créer
      // de doublon. Le nom existant est conservé si aucun nom n'est fourni.
      const { rows } = await query<WhatsappSubscriber>(
        `INSERT INTO ${this.TABLE_NAME} (phone, name, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (phone) DO UPDATE
           SET status = 'active',
               name = COALESCE($2, ${this.TABLE_NAME}.name),
               updated_at = NOW()
         RETURNING *`,
        [cleanedPhone, name || null]
      );

      return rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WhatsappSubscriberModel] Erreur lors de l'abonnement de ${cleanedPhone}:`, message);
      throw new Error(`Erreur lors de la création de l'abonné: ${message}`);
    }
  }

  /**
   * Désabonne un utilisateur (bascule le statut à inactive)
   * @param phone Numéro de téléphone
   */
  static async unsubscribe(phone: string): Promise<WhatsappSubscriber | null> {
    const cleanedPhone = this.normalizePhone(phone);

    if (!cleanedPhone) {
      throw new Error('Le numéro de téléphone ne peut pas être vide ou invalide');
    }

    try {
      const { rows } = await query<WhatsappSubscriber>(
        `UPDATE ${this.TABLE_NAME}
         SET status = 'inactive', updated_at = NOW()
         WHERE phone = $1
         RETURNING *`,
        [cleanedPhone]
      );

      if (!rows[0]) {
        console.log(`[WhatsappSubscriberModel] Aucun abonné trouvé pour le numéro ${cleanedPhone} pour désabonnement`);

        return null;
      }

      return rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WhatsappSubscriberModel] Erreur lors du désabonnement de ${cleanedPhone}:`, message);
      throw new Error(`Erreur lors du désabonnement: ${message}`);
    }
  }

  /**
   * Désabonne un utilisateur à partir de son ID
   * @param id Identifiant de l'abonné
   */
  static async unsubscribeById(id: number): Promise<WhatsappSubscriber | null> {
    if (!id || isNaN(id)) {
      throw new Error("L'identifiant de l'abonné est invalide");
    }

    try {
      const { rows } = await query<WhatsappSubscriber>(
        `UPDATE ${this.TABLE_NAME}
         SET status = 'inactive', updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );

      if (!rows[0]) {
        console.log(`[WhatsappSubscriberModel] Aucun abonné trouvé pour l'ID ${id} pour désabonnement`);

        return null;
      }

      return rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[WhatsappSubscriberModel] Erreur lors du désabonnement de l'ID ${id}:`, message);
      throw new Error(`Erreur lors du désabonnement: ${message}`);
    }
  }
}
