import { query } from '../config/database';
import { logger } from '../utils/logger';

export type TypeEntiteVue = 'boutique' | 'produit';

export interface VueTracking {
  id: number;
  type_entite: TypeEntiteVue;
  entite_id: number;
  ip_address: string;
  user_agent?: string;
  referer?: string;
  date_vue: Date;
}

export interface StatsVues {
  vues_totales: number;
  vues_aujourd_hui: number;
  vues_7_jours: number;
  vues_30_jours: number;
}

const STATS_VIDES: StatsVues = {
  vues_totales: 0,
  vues_aujourd_hui: 0,
  vues_7_jours: 0,
  vues_30_jours: 0
};

export class VueModel {
  private static readonly TABLE_NAME = 'vues_tracking';

  /**
   * Enregistre une vue pour une entité (boutique ou produit)
   * Retourne true si c'est une nouvelle vue, false si déjà vue aujourd'hui
   */
  static async enregistrerVue(
    typeEntite: TypeEntiteVue,
    entiteId: number,
    ipAddress: string,
    userAgent?: string,
    referer?: string
  ): Promise<boolean> {
    try {
      // Appeler la fonction SQL pour enregistrer la vue
      const { rows } = await query<{ enregistrer_vue: boolean }>(
        `SELECT enregistrer_vue($1::type_entite_vue, $2, $3, $4, $5) AS enregistrer_vue`,
        [typeEntite, entiteId, ipAddress, userAgent || null, referer || null]
      );

      logger.debug(`[VueModel] Nouvelle vue enregistrée: ${rows[0]?.enregistrer_vue}`);

      return rows[0]?.enregistrer_vue === true;
    } catch (error) {
      logger.error('[VueModel] Erreur lors de l\'appel de enregistrer_vue:', error);

      // Fallback: essayer d'insérer directement
      return this.enregistrerVueDirecte(typeEntite, entiteId, ipAddress, userAgent, referer);
    }
  }

  /**
   * Méthode de fallback pour enregistrer une vue directement sans fonction SQL
   */
  private static async enregistrerVueDirecte(
    typeEntite: TypeEntiteVue,
    entiteId: number,
    ipAddress: string,
    userAgent?: string,
    referer?: string
  ): Promise<boolean> {
    logger.debug('[VueModel] Tentative d\'enregistrement direct de la vue');

    try {
      // Une seule vue par entité et par IP sur la journée en cours
      const { rows } = await query<{ id: number }>(
        `INSERT INTO ${this.TABLE_NAME} (type_entite, entite_id, ip_address, user_agent, referer)
         SELECT $1::type_entite_vue, $2::integer, $3::varchar, $4::text, $5::text
         WHERE NOT EXISTS (
           SELECT 1 FROM ${this.TABLE_NAME}
           WHERE type_entite = $1::type_entite_vue
             AND entite_id = $2::integer
             AND ip_address = $3::varchar
             AND date_vue >= CURRENT_DATE
             AND date_vue < CURRENT_DATE + INTERVAL '1 day'
         )
         RETURNING id`,
        [typeEntite, entiteId, ipAddress, userAgent || null, referer || null]
      );

      if (rows.length === 0) {
        logger.debug('[VueModel] Vue déjà enregistrée aujourd\'hui pour cette IP');

        return false;
      }

      // Incrémenter le compteur de vues
      await this.incrementerCompteurVues(typeEntite, entiteId);

      logger.debug('[VueModel] Vue enregistrée avec succès');

      return true;
    } catch (error) {
      logger.error('[VueModel] Exception dans enregistrerVueDirecte:', error);

      return false;
    }
  }

  /**
   * Incrémente le compteur de vues d'une entité
   */
  private static async incrementerCompteurVues(
    typeEntite: TypeEntiteVue,
    entiteId: number
  ): Promise<void> {
    // Le type d'entité provient d'une union fermée : la table est sûre
    const tableName = typeEntite === 'boutique' ? 'boutiques' : 'produits';

    try {
      // L'incrément est fait par la base pour éviter toute perte de mise à
      // jour entre deux vues concurrentes
      await query(
        `UPDATE ${tableName} SET nombre_vues = COALESCE(nombre_vues, 0) + 1 WHERE id = $1`,
        [entiteId]
      );
    } catch (error) {
      logger.error('[VueModel] Exception dans incrementerCompteurVues:', error);
    }
  }

  /**
   * Récupère les statistiques de vues pour une entité
   */
  static async getStatsVues(
    typeEntite: TypeEntiteVue,
    entiteId: number
  ): Promise<StatsVues> {
    logger.debug(`[VueModel] Récupération stats vues ${typeEntite} ${entiteId}`);

    try {
      // Essayer d'utiliser la fonction SQL dédiée
      const { rows } = await query<Record<keyof StatsVues, string>>(
        `SELECT * FROM stats_vues($1::type_entite_vue, $2)`,
        [typeEntite, entiteId]
      );

      if (rows.length === 0) {
        return { ...STATS_VIDES };
      }

      // Les compteurs sont des bigint, renvoyés en chaîne par le driver
      return {
        vues_totales: Number(rows[0].vues_totales) || 0,
        vues_aujourd_hui: Number(rows[0].vues_aujourd_hui) || 0,
        vues_7_jours: Number(rows[0].vues_7_jours) || 0,
        vues_30_jours: Number(rows[0].vues_30_jours) || 0
      };
    } catch (error) {
      logger.error('[VueModel] Erreur lors de l\'appel de stats_vues:', error);

      // Fallback: calculer manuellement
      return this.getStatsVuesDirectes(typeEntite, entiteId);
    }
  }

  /**
   * Méthode de fallback pour calculer les stats directement
   */
  private static async getStatsVuesDirectes(
    typeEntite: TypeEntiteVue,
    entiteId: number
  ): Promise<StatsVues> {
    try {
      // Les quatre compteurs sont obtenus en une seule requête
      const { rows } = await query<Record<keyof StatsVues, string>>(
        `SELECT
           COUNT(*) AS vues_totales,
           COUNT(*) FILTER (WHERE date_vue >= CURRENT_DATE) AS vues_aujourd_hui,
           COUNT(*) FILTER (WHERE date_vue >= NOW() - INTERVAL '7 days') AS vues_7_jours,
           COUNT(*) FILTER (WHERE date_vue >= NOW() - INTERVAL '30 days') AS vues_30_jours
         FROM ${this.TABLE_NAME}
         WHERE type_entite = $1::type_entite_vue AND entite_id = $2`,
        [typeEntite, entiteId]
      );

      return {
        vues_totales: Number(rows[0].vues_totales) || 0,
        vues_aujourd_hui: Number(rows[0].vues_aujourd_hui) || 0,
        vues_7_jours: Number(rows[0].vues_7_jours) || 0,
        vues_30_jours: Number(rows[0].vues_30_jours) || 0
      };
    } catch (error) {
      logger.error('[VueModel] Exception dans getStatsVuesDirectes:', error);

      return { ...STATS_VIDES };
    }
  }

  /**
   * Récupère les vues récentes pour une entité
   */
  static async getVuesRecentes(
    typeEntite: TypeEntiteVue,
    entiteId: number,
    limite: number = 100
  ): Promise<VueTracking[]> {
    try {
      const { rows } = await query<VueTracking>(
        `SELECT * FROM ${this.TABLE_NAME}
         WHERE type_entite = $1::type_entite_vue AND entite_id = $2
         ORDER BY date_vue DESC
         LIMIT $3`,
        [typeEntite, entiteId, limite]
      );

      return rows;
    } catch (error) {
      logger.error('[VueModel] Exception dans getVuesRecentes:', error);

      return [];
    }
  }

  /**
   * Nettoie les anciennes vues (à appeler périodiquement)
   */
  static async nettoyerAnciennesVues(joursRetention: number = 90): Promise<number> {
    try {
      const { rows } = await query<{ nettoyer_anciennes_vues: number }>(
        `SELECT nettoyer_anciennes_vues($1) AS nettoyer_anciennes_vues`,
        [joursRetention]
      );

      const supprimees = Number(rows[0]?.nettoyer_anciennes_vues) || 0;
      logger.debug(`[VueModel] ${supprimees} anciennes vues supprimées`);

      return supprimees;
    } catch (error) {
      logger.error('[VueModel] Erreur lors du nettoyage:', error);

      return 0;
    }
  }
}
