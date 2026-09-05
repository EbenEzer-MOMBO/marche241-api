import { query } from '../config/database';
import { CommissionAffiliee, ResultatPagine, OptionsPagination } from '../lib/database-types';

/**
 * Modèle en lecture seule pour les commissions d'affiliation.
 * La création d'une ligne se fait EXCLUSIVEMENT par le trigger SQL
 * trg_commandes_creer_commission_affilie (migration 021) — jamais par un
 * INSERT applicatif — afin qu'il n'existe qu'un seul endroit qui calcule la
 * commission, quel que soit le chemin par lequel la commande est passée à
 * 'livree' (API Node ou Admin Laravel).
 */
export class CommissionModel {
  private static readonly TABLE_NAME = 'commissions_affiliees';

  /**
   * Liste paginée des commissions d'un affilié
   */
  static async getAllByAffilie(
    affilieId: number,
    options: OptionsPagination
  ): Promise<ResultatPagine<CommissionAffiliee>> {
    const { page, limite } = options;
    const offset = (page - 1) * limite;

    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.TABLE_NAME} WHERE affilie_id = $1`,
      [affilieId]
    );
    const count = Number(total[0].count);

    const { rows } = await query<CommissionAffiliee>(
      `SELECT * FROM ${this.TABLE_NAME}
       WHERE affilie_id = $1
       ORDER BY date_creation DESC
       LIMIT $2 OFFSET $3`,
      [affilieId, limite, offset]
    );

    return {
      donnees: rows,
      total: count,
      page,
      limite,
      total_pages: count ? Math.ceil(count / limite) : 0
    };
  }

  /**
   * Solde dû (commissions 'due') et total versé à vie pour un affilié
   */
  static async getResumeAffilie(
    affilieId: number
  ): Promise<{ soldeDue: number; totalVerse: number; commandesLivrees: number }> {
    const { rows } = await query<{ solde_due: string; total_verse: string; commandes_livrees: string }>(
      `SELECT
         COALESCE(SUM(montant_commission) FILTER (WHERE statut = 'due'), 0) AS solde_due,
         COALESCE(SUM(montant_commission) FILTER (WHERE statut = 'payee'), 0) AS total_verse,
         COUNT(*) FILTER (WHERE statut IN ('due', 'payee')) AS commandes_livrees
       FROM ${this.TABLE_NAME}
       WHERE affilie_id = $1`,
      [affilieId]
    );

    return {
      soldeDue: Number(rows[0]?.solde_due ?? 0),
      totalVerse: Number(rows[0]?.total_verse ?? 0),
      commandesLivrees: Number(rows[0]?.commandes_livrees ?? 0)
    };
  }

  /**
   * Commissions pas encore notifiées à l'affilié (email/WhatsApp), pour le cron
   */
  static async getNonNotifiees(limite: number = 100): Promise<CommissionAffiliee[]> {
    const { rows } = await query<CommissionAffiliee>(
      `SELECT c.*, a.nom AS affilie_nom, a.email AS affilie_email, a.telephone AS affilie_telephone,
              cmd.numero_commande
       FROM ${this.TABLE_NAME} c
       JOIN affilies a ON a.id = c.affilie_id
       JOIN commandes cmd ON cmd.id = c.commande_id
       WHERE c.notifie_le IS NULL
       ORDER BY c.date_creation ASC
       LIMIT $1`,
      [limite]
    );
    return rows;
  }

  /**
   * Marque une commission comme notifiée
   */
  static async marquerNotifiee(id: number): Promise<void> {
    await query(`UPDATE ${this.TABLE_NAME} SET notifie_le = NOW() WHERE id = $1`, [id]);
  }

}
