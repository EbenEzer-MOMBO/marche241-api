import { query } from '../config/database';
import { Boost, BoostEvenement, BoostStat, ResultatPagine, StatutBoost } from '../lib/database-types';

/**
 * Colonnes autorisées pour le tri de la liste paginée.
 * Le nom de colonne étant interpolé dans le SQL, toute valeur hors de
 * cette liste est rejetée au profit du tri par défaut.
 */
const COLONNES_TRI = ['id', 'statut', 'forfait_code', 'prix_vendeur_fcfa', 'date_creation', 'date_modification'] as const;

/** Colonnes modifiables via les méthodes de création et de mise à jour. */
const COLONNES_AUTORISEES = [
  'boutique_id',
  'vendeur_id',
  'type_boost',
  'produit_id',
  'forfait_code',
  'statut',
  'prix_vendeur_fcfa',
  'budget_meta_reel_fcfa',
  'duree_jours',
  'zones',
  'date_debut',
  'date_fin',
  'meta_campaign_id',
  'meta_adset_id',
  'meta_ad_id',
  'meta_creative_id',
  'meta_statut_revue',
  'raison_rejet'
] as const;

/** Colonnes dont le type est un enum et qui nécessitent un cast explicite */
const COLONNES_ENUM: Record<string, string> = {
  type_boost: 'type_boost',
  statut: 'statut_boost'
};

/** Colonnes de type JSON, à sérialiser avant envoi */
const COLONNES_JSON = ['zones'];

const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) => (COLONNES_AUTORISEES as readonly string[]).includes(colonne));

const preparerValeur = (colonne: string, valeur: unknown): unknown => {
  if (!COLONNES_JSON.includes(colonne)) {
    return valeur;
  }
  return valeur === null || valeur === undefined ? null : JSON.stringify(valeur);
};

const placeholder = (colonne: string, position: number): string => {
  if (COLONNES_JSON.includes(colonne)) {
    return `$${position}::jsonb`;
  }
  return COLONNES_ENUM[colonne] ? `$${position}::${COLONNES_ENUM[colonne]}` : `$${position}`;
};

export interface FiltresBoosts {
  statut?: StatutBoost;
  boutique_id?: number;
}

export class BoostModel {
  private static readonly TABLE_NAME = 'boosts';

  /**
   * Crée un nouveau boost (statut initial : en_attente_paiement)
   */
  static async creerBoost(donnees: Record<string, unknown>): Promise<Boost> {
    const champs = filtrerColonnes(donnees);
    const colonnes = champs.map(([colonne]) => colonne);
    const placeholders = champs.map(([colonne], i) => placeholder(colonne, i + 1));
    const valeurs = champs.map(([colonne, valeur]) => preparerValeur(colonne, valeur));

    const { rows } = await query<Boost>(
      `INSERT INTO ${this.TABLE_NAME} (${colonnes.join(', ')}, date_creation, date_modification)
       VALUES (${placeholders.join(', ')}, NOW(), NOW())
       RETURNING *`,
      valeurs
    );

    return rows[0];
  }

  static async getBoostById(id: number): Promise<Boost | null> {
    const { rows } = await query<Boost>(`SELECT * FROM ${this.TABLE_NAME} WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }

  static async isOwnedByVendeur(boostId: number, vendeurId: number): Promise<boolean> {
    const boost = await this.getBoostById(boostId);
    return !!boost && boost.vendeur_id === vendeurId;
  }

  /**
   * Liste paginée des boosts d'une boutique
   */
  static async getBoostsByBoutiqueId(
    boutiqueId: number,
    page: number,
    limite: number,
    tri_par: string = 'date_creation',
    ordre: 'ASC' | 'DESC' = 'DESC'
  ): Promise<ResultatPagine<Boost>> {
    const offset = (page - 1) * limite;
    const colonneTri = (COLONNES_TRI as readonly string[]).includes(tri_par) ? tri_par : 'date_creation';
    const sensTri = ordre === 'ASC' ? 'ASC' : 'DESC';

    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.TABLE_NAME} WHERE boutique_id = $1`,
      [boutiqueId]
    );
    const count = Number(total[0].count);

    const { rows } = await query<Boost>(
      `SELECT * FROM ${this.TABLE_NAME}
       WHERE boutique_id = $1
       ORDER BY ${colonneTri} ${sensTri}
       LIMIT $2 OFFSET $3`,
      [boutiqueId, limite, offset]
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
   * Liste paginée et filtrée de tous les boosts (usage admin)
   */
  static async getAllBoosts(
    page: number,
    limite: number,
    filtres: FiltresBoosts = {},
    tri_par: string = 'date_creation',
    ordre: 'ASC' | 'DESC' = 'DESC'
  ): Promise<ResultatPagine<Boost>> {
    const offset = (page - 1) * limite;
    const colonneTri = (COLONNES_TRI as readonly string[]).includes(tri_par) ? tri_par : 'date_creation';
    const sensTri = ordre === 'ASC' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const valeurs: unknown[] = [];

    if (filtres.statut) {
      valeurs.push(filtres.statut);
      conditions.push(`statut = $${valeurs.length}::statut_boost`);
    }
    if (filtres.boutique_id) {
      valeurs.push(filtres.boutique_id);
      conditions.push(`boutique_id = $${valeurs.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.TABLE_NAME} ${whereClause}`,
      valeurs
    );
    const count = Number(total[0].count);

    const { rows } = await query<Boost>(
      `SELECT * FROM ${this.TABLE_NAME}
       ${whereClause}
       ORDER BY ${colonneTri} ${sensTri}
       LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
      [...valeurs, limite, offset]
    );

    return {
      donnees: rows,
      total: count,
      page,
      limite,
      total_pages: count ? Math.ceil(count / limite) : 0
    };
  }

  static async updateBoost(id: number, donnees: Record<string, unknown>): Promise<Boost> {
    const champs = filtrerColonnes(donnees);

    if (champs.length === 0) {
      const { rows } = await query<Boost>(
        `UPDATE ${this.TABLE_NAME} SET date_modification = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );
      if (!rows[0]) {
        throw new Error('Erreur lors de la mise à jour du boost: boost introuvable');
      }
      return rows[0];
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = ${placeholder(colonne, i + 1)}`);
    const valeurs = champs.map(([colonne, valeur]) => preparerValeur(colonne, valeur));

    const { rows } = await query<Boost>(
      `UPDATE ${this.TABLE_NAME} SET ${affectations.join(', ')}, date_modification = NOW()
       WHERE id = $${champs.length + 1}
       RETURNING *`,
      [...valeurs, id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour du boost: boost introuvable');
    }

    return rows[0];
  }

  static async updateStatut(id: number, statut: StatutBoost, extra: Record<string, unknown> = {}): Promise<Boost> {
    return this.updateBoost(id, { ...extra, statut });
  }

  /**
   * Boosts en attente de revue Meta (pour le cron de synchro statut)
   */
  static async getBoostsEnAttenteRevue(): Promise<Boost[]> {
    const { rows } = await query<Boost>(
      `SELECT * FROM ${this.TABLE_NAME} WHERE statut = 'en_attente_revue' ORDER BY date_creation ASC`
    );
    return rows;
  }

  /**
   * Boosts actifs (pour le cron de synchro des stats)
   */
  static async getBoostsActifs(): Promise<Boost[]> {
    const { rows } = await query<Boost>(
      `SELECT * FROM ${this.TABLE_NAME} WHERE statut = 'actif' ORDER BY date_creation ASC`
    );
    return rows;
  }

  /**
   * Boosts actifs dont la date de fin est dépassée (pour le cron d'expiration)
   */
  static async getBoostsActifsExpires(): Promise<Boost[]> {
    const { rows } = await query<Boost>(
      `SELECT * FROM ${this.TABLE_NAME} WHERE statut = 'actif' AND date_fin IS NOT NULL AND date_fin < NOW()`
    );
    return rows;
  }
}

export class BoostEvenementModel {
  static async creer(boostId: number, typeEvenement: string, donnees?: Record<string, unknown>): Promise<BoostEvenement> {
    const { rows } = await query<BoostEvenement>(
      `INSERT INTO boost_evenements (boost_id, type_evenement, donnees, date_creation)
       VALUES ($1, $2, $3::jsonb, NOW())
       RETURNING *`,
      [boostId, typeEvenement, donnees ? JSON.stringify(donnees) : null]
    );
    return rows[0];
  }

  static async listerParBoost(boostId: number): Promise<BoostEvenement[]> {
    const { rows } = await query<BoostEvenement>(
      `SELECT * FROM boost_evenements WHERE boost_id = $1 ORDER BY date_creation DESC`,
      [boostId]
    );
    return rows;
  }
}

export class BoostStatModel {
  static async ajouterSnapshot(
    boostId: number,
    stats: { impressions: number; clics: number; depense_fcfa: number }
  ): Promise<BoostStat> {
    const { rows } = await query<BoostStat>(
      `INSERT INTO boost_stats (boost_id, impressions, clics, depense_fcfa, date_snapshot)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [boostId, stats.impressions, stats.clics, stats.depense_fcfa]
    );
    return rows[0];
  }

  static async getDernierSnapshot(boostId: number): Promise<BoostStat | null> {
    const { rows } = await query<BoostStat>(
      `SELECT * FROM boost_stats WHERE boost_id = $1 ORDER BY date_snapshot DESC LIMIT 1`,
      [boostId]
    );
    return rows[0] ?? null;
  }

  static async getSerieParBoost(boostId: number): Promise<BoostStat[]> {
    const { rows } = await query<BoostStat>(
      `SELECT * FROM boost_stats WHERE boost_id = $1 ORDER BY date_snapshot ASC`,
      [boostId]
    );
    return rows;
  }
}
