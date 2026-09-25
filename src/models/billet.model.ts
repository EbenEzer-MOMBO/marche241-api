import crypto from 'crypto';
import { query, withTransaction } from '../config/database';
import { Billet } from '../lib/database-types';

export interface BilletACreer {
  produit_id: number;
  type_billet: string;
  quantite: number;
}

export class BilletModel {
  static async findByCommandeId(commandeId: number): Promise<Billet[]> {
    const { rows } = await query<Billet>(
      `SELECT * FROM billets WHERE commande_id = $1 ORDER BY produit_id, numero`,
      [commandeId]
    );
    return rows;
  }

  static async findByJeton(jeton: string): Promise<Billet[]> {
    const { rows } = await query<Billet>(
      `SELECT * FROM billets WHERE jeton = $1 ORDER BY produit_id, numero`,
      [jeton]
    );
    return rows;
  }

  /**
   * Émet les billets d'une commande. Idempotent : si des billets existent déjà,
   * ils sont renvoyés sans en créer de nouveaux.
   */
  static async emitForCommande(commandeId: number, aCreer: BilletACreer[]): Promise<Billet[]> {
    const existants = await this.findByCommandeId(commandeId);
    if (existants.length > 0) {
      return existants;
    }

    if (aCreer.length === 0) {
      return [];
    }

    const jeton = crypto.randomBytes(24).toString('hex');

    return withTransaction(async (client) => {
      const dejaPresents = await client.query<Billet>(
        `SELECT * FROM billets WHERE commande_id = $1 ORDER BY produit_id, numero`,
        [commandeId]
      );
      if (dejaPresents.rows.length > 0) {
        return dejaPresents.rows;
      }

      const crees: Billet[] = [];

      for (const ligne of aCreer) {
        const { rows: maxRows } = await client.query<{ max: number | null }>(
          `SELECT MAX(numero) AS max FROM billets WHERE produit_id = $1`,
          [ligne.produit_id]
        );
        let suivant = (maxRows[0]?.max ?? 0) + 1;

        for (let i = 0; i < ligne.quantite; i += 1) {
          const { rows } = await client.query<Billet>(
            `INSERT INTO billets (commande_id, produit_id, type_billet, numero, jeton)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [commandeId, ligne.produit_id, ligne.type_billet, suivant, jeton]
          );
          crees.push(rows[0]);
          suivant += 1;
        }
      }

      return crees;
    });
  }
}
