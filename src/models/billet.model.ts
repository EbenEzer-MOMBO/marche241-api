import crypto from 'crypto';
import { query, withTransaction } from '../config/database';
import { Billet } from '../lib/database-types';

export interface BilletACreer {
  produit_id: number;
  type_billet: string;
  quantite: number;
}

export interface ParticipantBillet {
  id: number;
  numero: number;
  type_billet: string;
  jeton: string;
  scanne_le: Date | null;
  date_creation: Date;
  commande_id: number;
  numero_commande: string;
  client_nom: string;
  client_email: string | null;
  client_telephone: string;
  statut_paiement: string;
  date_commande: Date;
}

export interface StatsBilletsProduit {
  billets_vendus: number;
  billets_scannes: number;
  revenus: number;
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

  static async findById(id: number): Promise<Billet | null> {
    const { rows } = await query<Billet>(`SELECT * FROM billets WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  /**
   * Liste des billets d'un produit événement avec les informations de l'acheteur.
   */
  static async findParticipantsByProduit(produitId: number): Promise<ParticipantBillet[]> {
    const { rows } = await query<ParticipantBillet>(
      `SELECT b.id, b.numero, b.type_billet, b.jeton, b.scanne_le, b.date_creation,
              c.id AS commande_id, c.numero_commande, c.client_nom, c.client_email,
              c.client_telephone, c.statut_paiement, c.date_commande
         FROM billets b
         JOIN commandes c ON c.id = b.commande_id
        WHERE b.produit_id = $1
        ORDER BY b.date_creation DESC, b.numero DESC`,
      [produitId]
    );
    return rows;
  }

  /**
   * Billets émis / scannés et revenus encaissés (commandes payées) d'un produit.
   */
  static async statsProduit(produitId: number): Promise<StatsBilletsProduit> {
    const { rows } = await query<{ billets_vendus: string; billets_scannes: string; revenus: string }>(
      `SELECT
         (SELECT COUNT(*) FROM billets WHERE produit_id = $1) AS billets_vendus,
         (SELECT COUNT(*) FROM billets WHERE produit_id = $1 AND scanne_le IS NOT NULL) AS billets_scannes,
         (SELECT COALESCE(SUM(ca.sous_total), 0)
            FROM commande_articles ca
            JOIN commandes c ON c.id = ca.commande_id
           WHERE ca.produit_id = $1 AND c.statut_paiement = 'paye') AS revenus`,
      [produitId]
    );
    const ligne = rows[0];
    return {
      billets_vendus: Number(ligne?.billets_vendus ?? 0),
      billets_scannes: Number(ligne?.billets_scannes ?? 0),
      revenus: Number(ligne?.revenus ?? 0)
    };
  }

  static async setScanne(id: number, scanne: boolean): Promise<Billet | null> {
    const { rows } = await query<Billet>(
      `UPDATE billets
          SET scanne_le = CASE WHEN $2::boolean THEN COALESCE(scanne_le, NOW()) ELSE NULL END
        WHERE id = $1
        RETURNING *`,
      [id, scanne]
    );
    return rows[0] ?? null;
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
