import { query } from '../config/database';
import { PasskeyChallengeType, VendeurPasskey, VendeurPasskeyChallenge } from '../lib/database-types';

export class VendeurPasskeyModel {
  static async listByVendeurId(vendeurId: number): Promise<VendeurPasskey[]> {
    const { rows } = await query<VendeurPasskey>(
      `SELECT * FROM vendeur_passkeys WHERE vendeur_id = $1 ORDER BY created_at DESC`,
      [vendeurId]
    );
    return rows;
  }

  static async findByCredentialId(credentialId: string): Promise<VendeurPasskey | null> {
    const { rows } = await query<VendeurPasskey>(
      `SELECT * FROM vendeur_passkeys WHERE credential_id = $1`,
      [credentialId]
    );
    return rows[0] ?? null;
  }

  static async findByIdForVendeur(id: number, vendeurId: number): Promise<VendeurPasskey | null> {
    const { rows } = await query<VendeurPasskey>(
      `SELECT * FROM vendeur_passkeys WHERE id = $1 AND vendeur_id = $2`,
      [id, vendeurId]
    );
    return rows[0] ?? null;
  }

  static async create(data: {
    vendeur_id: number;
    credential_id: string;
    public_key: Buffer;
    counter: number;
    device_name?: string | null;
    transports?: string[] | null;
  }): Promise<VendeurPasskey> {
    const { rows } = await query<VendeurPasskey>(
      `INSERT INTO vendeur_passkeys
        (vendeur_id, credential_id, public_key, counter, device_name, transports)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.vendeur_id,
        data.credential_id,
        data.public_key,
        data.counter,
        data.device_name ?? null,
        data.transports ?? null
      ]
    );
    return rows[0];
  }

  static async updateCounter(id: number, counter: number): Promise<void> {
    await query(`UPDATE vendeur_passkeys SET counter = $1 WHERE id = $2`, [counter, id]);
  }

  static async deleteForVendeur(id: number, vendeurId: number): Promise<boolean> {
    const { rowCount } = await query(
      `DELETE FROM vendeur_passkeys WHERE id = $1 AND vendeur_id = $2`,
      [id, vendeurId]
    );
    return (rowCount ?? 0) > 0;
  }

  static async saveChallenge(data: {
    vendeur_id: number | null;
    challenge: string;
    type: PasskeyChallengeType;
    expires_at: Date;
  }): Promise<void> {
    await query(`DELETE FROM vendeur_passkey_challenges WHERE expires_at < NOW()`);
    await query(
      `INSERT INTO vendeur_passkey_challenges (vendeur_id, challenge, type, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [data.vendeur_id, data.challenge, data.type, data.expires_at]
    );
  }

  static async consumeChallenge(
    challenge: string,
    type: PasskeyChallengeType
  ): Promise<VendeurPasskeyChallenge | null> {
    const { rows } = await query<VendeurPasskeyChallenge>(
      `DELETE FROM vendeur_passkey_challenges
       WHERE challenge = $1 AND type = $2 AND expires_at > NOW()
       RETURNING *`,
      [challenge, type]
    );
    return rows[0] ?? null;
  }

  static async consumeLatestForVendeur(
    vendeurId: number,
    type: PasskeyChallengeType
  ): Promise<VendeurPasskeyChallenge | null> {
    const { rows } = await query<VendeurPasskeyChallenge>(
      `DELETE FROM vendeur_passkey_challenges
       WHERE id = (
         SELECT id FROM vendeur_passkey_challenges
         WHERE vendeur_id = $1 AND type = $2 AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1
       )
       RETURNING *`,
      [vendeurId, type]
    );
    return rows[0] ?? null;
  }
}
