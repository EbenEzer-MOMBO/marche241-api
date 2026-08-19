import { query } from '../config/database';
import { CommuneLivraison } from '../lib/database-types';

/**
 * Colonnes modifiables via les méthodes de création et de mise à jour.
 * Les noms de colonnes étant interpolés dans le SQL, ils sont valides
 * uniquement s'ils proviennent de cette liste.
 */
const COLONNES_AUTORISEES = [
  'boutique_id',
  'nom_commune',
  'code_postal',
  'tarif_livraison',
  'delai_livraison_min',
  'delai_livraison_max',
  'est_active'
] as const;

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) =>
    (COLONNES_AUTORISEES as readonly string[]).includes(colonne)
  );

export class CommuneModel {
  /**
   * Récupère toutes les communes de livraison
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getAllCommunes(boutiqueId?: number): Promise<CommuneLivraison[]> {
    // Filtrer par boutique si spécifié
    const conditions = boutiqueId ? 'WHERE boutique_id = $1' : '';
    const params = boutiqueId ? [boutiqueId] : [];

    const { rows } = await query<CommuneLivraison>(
      `SELECT * FROM communes_livraison ${conditions} ORDER BY nom_commune ASC`,
      params
    );

    return rows;
  }

  /**
   * Récupère les communes d'une boutique spécifique
   * @param boutiqueId ID de la boutique
   */
  static async getCommunesByBoutiqueId(boutiqueId: number): Promise<CommuneLivraison[]> {
    const { rows } = await query<CommuneLivraison>(
      `SELECT * FROM communes_livraison WHERE boutique_id = $1 ORDER BY nom_commune ASC`,
      [boutiqueId]
    );

    return rows;
  }

  /**
   * Récupère les communes actives d'une boutique spécifique
   * @param boutiqueId ID de la boutique
   */
  static async getActiveCommunesByBoutiqueId(boutiqueId: number): Promise<CommuneLivraison[]> {
    const { rows } = await query<CommuneLivraison>(
      `SELECT * FROM communes_livraison
       WHERE boutique_id = $1 AND est_active = true
       ORDER BY nom_commune ASC`,
      [boutiqueId]
    );

    return rows;
  }

  /**
   * Récupère les communes de livraison actives
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getActiveCommunes(boutiqueId?: number): Promise<CommuneLivraison[]> {
    // Filtrer par boutique si spécifié
    const conditions = boutiqueId ? 'AND boutique_id = $1' : '';
    const params = boutiqueId ? [boutiqueId] : [];

    const { rows } = await query<CommuneLivraison>(
      `SELECT * FROM communes_livraison
       WHERE est_active = true ${conditions}
       ORDER BY nom_commune ASC`,
      params
    );

    return rows;
  }

  /**
   * Récupère une commune par son ID
   * @param id ID de la commune
   */
  static async getCommuneById(id: number): Promise<CommuneLivraison | null> {
    const { rows } = await query<CommuneLivraison>(
      `SELECT * FROM communes_livraison WHERE id = $1`,
      [id]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère l'identifiant de la boutique propriétaire d'une commune
   * @param id ID de la commune
   */
  static async getBoutiqueIdByCommuneId(id: number): Promise<number | null> {
    const { rows } = await query<{ boutique_id: number }>(
      `SELECT boutique_id FROM communes_livraison WHERE id = $1`,
      [id]
    );

    return rows[0]?.boutique_id ?? null;
  }

  /**
   * Crée une nouvelle commune de livraison
   * @param commune Données de la commune à créer
   */
  static async createCommune(commune: Omit<CommuneLivraison, 'id' | 'date_creation' | 'date_modification'>): Promise<CommuneLivraison> {
    const champs = filtrerColonnes(commune as Record<string, unknown>);

    if (champs.length === 0) {
      throw new Error('Erreur lors de la création de la commune: aucune donnée fournie');
    }

    const colonnes = champs.map(([colonne]) => colonne);
    const placeholders = champs.map((_, i) => `$${i + 1}`);

    const { rows } = await query<CommuneLivraison>(
      `INSERT INTO communes_livraison (${colonnes.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      champs.map(([, valeur]) => valeur)
    );

    return rows[0];
  }

  /**
   * Met à jour une commune existante
   * @param id ID de la commune à mettre à jour
   * @param commune Données à mettre à jour
   */
  static async updateCommune(id: number, commune: Partial<Omit<CommuneLivraison, 'id' | 'date_creation' | 'date_modification'>>): Promise<CommuneLivraison> {
    const champs = filtrerColonnes(commune as Record<string, unknown>);

    // Sans champ à modifier, retourner la commune telle quelle
    if (champs.length === 0) {
      const existante = await this.getCommuneById(id);

      if (!existante) {
        throw new Error('Erreur lors de la mise à jour de la commune: commune introuvable');
      }

      return existante;
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = $${i + 1}`);

    const { rows } = await query<CommuneLivraison>(
      `UPDATE communes_livraison SET ${affectations.join(', ')}
       WHERE id = $${champs.length + 1}
       RETURNING *`,
      [...champs.map(([, valeur]) => valeur), id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour de la commune: commune introuvable');
    }

    return rows[0];
  }

  /**
   * Active ou désactive une commune
   * @param id ID de la commune
   * @param isActive État d'activation
   */
  static async toggleCommuneStatus(id: number, isActive: boolean): Promise<CommuneLivraison> {
    const { rows } = await query<CommuneLivraison>(
      `UPDATE communes_livraison SET est_active = $1 WHERE id = $2 RETURNING *`,
      [isActive, id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors du changement de statut de la commune: commune introuvable');
    }

    return rows[0];
  }

  /**
   * Supprime une commune
   * @param id ID de la commune à supprimer
   */
  static async deleteCommune(id: number): Promise<void> {
    await query(`DELETE FROM communes_livraison WHERE id = $1`, [id]);
  }
}
