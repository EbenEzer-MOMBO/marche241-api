import { query } from '../config/database';

export interface PushSubscriptionRecord {
  id?: number;
  vendeur_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export class PushSubscriptionModel {
  private static readonly TABLE_NAME = 'push_subscriptions';

  /**
   * Enregistre ou met à jour un abonnement push pour un vendeur.
   * `endpoint` étant unique, un abonnement déjà connu est réassigné au vendeur courant.
   */
  static async subscribe(
    vendeurId: number,
    subscription: PushSubscriptionKeys,
    userAgent?: string | null
  ): Promise<PushSubscriptionRecord> {
    const { rows } = await query<PushSubscriptionRecord>(
      `INSERT INTO ${this.TABLE_NAME} (vendeur_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE
         SET vendeur_id = $1,
             p256dh = $3,
             auth = $4,
             user_agent = $5,
             updated_at = NOW()
       RETURNING *`,
      [vendeurId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, userAgent || null]
    );

    return rows[0];
  }

  /**
   * Récupère tous les abonnements push actifs d'un vendeur.
   */
  static async findByVendeurId(vendeurId: number): Promise<PushSubscriptionRecord[]> {
    const { rows } = await query<PushSubscriptionRecord>(
      `SELECT * FROM ${this.TABLE_NAME} WHERE vendeur_id = $1`,
      [vendeurId]
    );

    return rows;
  }

  /**
   * Supprime un abonnement par son endpoint (désabonnement explicite ou expiré).
   */
  static async deleteByEndpoint(endpoint: string): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM ${this.TABLE_NAME} WHERE endpoint = $1`,
      [endpoint]
    );

    return (rowCount || 0) > 0;
  }
}
