import { query } from '../config/database';

export interface PolitiqueConfidentialite {
  id: number;
  contenu: string;
  date_creation?: string;
  date_modification?: string;
}

export class PolitiqueModel {
  /**
   * Récupère la politique de confidentialité publique (id = 1)
   */
  static async getPolitique(): Promise<PolitiqueConfidentialite | null> {
    const { rows } = await query<PolitiqueConfidentialite>(
      `SELECT id, contenu, date_creation, date_modification
       FROM politique_confidentialite
       WHERE id = $1`,
      [1]
    );

    return rows[0] ?? null;
  }
}
