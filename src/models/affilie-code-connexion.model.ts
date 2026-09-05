import { createHash } from 'crypto';
import { query } from '../config/database';
import { AffilieCodeConnexion } from '../lib/database-types';

const MAX_TENTATIVES = 5;
const DUREE_VALIDITE_MINUTES = 10;
const DELAI_MIN_RENVOI_SECONDES = 45;

const hasherCode = (code: string): string => createHash('sha256').update(code).digest('hex');

/**
 * Codes OTP à 4 chiffres pour l'authentification du mini dashboard affilié.
 * Séparé du code affilié public (AFF-XXXXXX) utilisé dans les liens de tracking.
 */
export class AffilieCodeConnexionModel {
  private static readonly TABLE_NAME = 'affilie_codes_connexion';

  /**
   * Génère et stocke un nouveau code OTP pour un affilié, si le délai minimum
   * anti-spam depuis la dernière demande est respecté.
   * @returns Le code en clair (à envoyer par email), ou null si le délai anti-spam n'est pas respecté
   */
  static async genererCode(affilieId: number): Promise<string | null> {
    const { rows: recents } = await query<{ date_creation: Date }>(
      `SELECT date_creation FROM ${this.TABLE_NAME}
       WHERE affilie_id = $1
       ORDER BY date_creation DESC
       LIMIT 1`,
      [affilieId]
    );

    if (recents[0]) {
      const { rows: delai } = await query<{ trop_recent: boolean }>(
        `SELECT (NOW() - $1::timestamp) < INTERVAL '${DELAI_MIN_RENVOI_SECONDES} seconds' AS trop_recent`,
        [recents[0].date_creation]
      );
      if (delai[0]?.trop_recent) {
        return null;
      }
    }

    const code = Math.floor(1000 + Math.random() * 9000).toString();

    await query(
      `INSERT INTO ${this.TABLE_NAME} (affilie_id, code_hash, expire_le)
       VALUES ($1, $2, NOW() + INTERVAL '${DUREE_VALIDITE_MINUTES} minutes')`,
      [affilieId, hasherCode(code)]
    );

    return code;
  }

  /**
   * Vérifie le dernier code OTP émis pour un affilié. Incrémente les
   * tentatives en cas d'échec et bloque après MAX_TENTATIVES.
   */
  static async verifierCode(
    affilieId: number,
    code: string
  ): Promise<{ valide: boolean; motif?: 'expire' | 'bloque' | 'invalide' }> {
    const { rows } = await query<AffilieCodeConnexion>(
      `SELECT * FROM ${this.TABLE_NAME}
       WHERE affilie_id = $1 AND utilise_le IS NULL
       ORDER BY date_creation DESC
       LIMIT 1`,
      [affilieId]
    );

    const dernierCode = rows[0];
    if (!dernierCode) {
      return { valide: false, motif: 'invalide' };
    }

    if (dernierCode.tentatives >= MAX_TENTATIVES) {
      return { valide: false, motif: 'bloque' };
    }

    if (new Date(dernierCode.expire_le).getTime() < Date.now()) {
      return { valide: false, motif: 'expire' };
    }

    if (dernierCode.code_hash !== hasherCode(code)) {
      await query(`UPDATE ${this.TABLE_NAME} SET tentatives = tentatives + 1 WHERE id = $1`, [dernierCode.id]);
      return { valide: false, motif: 'invalide' };
    }

    await query(`UPDATE ${this.TABLE_NAME} SET utilise_le = NOW() WHERE id = $1`, [dernierCode.id]);
    return { valide: true };
  }
}
