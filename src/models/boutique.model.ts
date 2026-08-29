import { query } from '../config/database';
import { Boutique, CreateBoutiqueData, ResultatPagine, OptionsPagination } from '../lib/database-types';

/**
 * Colonnes autorisées pour le tri de la liste paginée.
 * Le nom de colonne étant interpolé dans le SQL, toute valeur hors de
 * cette liste est rejetée au profit du tri par défaut.
 */
const COLONNES_TRI = [
  'id',
  'nom',
  'slug',
  'ville',
  'statut',
  'note_moyenne',
  'nombre_produits',
  'nombre_avis',
  'nombre_vues',
  'date_creation',
  'date_modification'
] as const;

/**
 * Colonnes modifiables via les méthodes de création et de mise à jour.
 * `nombre_produits` en est exclu : il est maintenu par un trigger.
 */
const COLONNES_AUTORISEES = [
  'nom',
  'slug',
  'description',
  'vendeur_id',
  'logo',
  'banniere',
  'couleur_primaire',
  'couleur_secondaire',
  'adresse',
  'telephone',
  'email',
  'ville',
  'statut',
  'note_moyenne',
  'nombre_avis',
  'nombre_vues',
  'payment_restriction_mode',
  'est_verifiee'
] as const;

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) =>
    (COLONNES_AUTORISEES as readonly string[]).includes(colonne)
  );

export class BoutiqueModel {
  private static readonly TABLE_NAME = 'boutiques';

  /**
   * Récupère toutes les boutiques avec pagination
   */
  static async getAllBoutiques(options: OptionsPagination): Promise<ResultatPagine<Boutique>> {
    const { page, limite, tri_par = 'date_creation', ordre = 'DESC' } = options;

    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;

    // N'accepter que des valeurs connues : elles sont interpolées dans le SQL
    const colonneTri = (COLONNES_TRI as readonly string[]).includes(tri_par) ? tri_par : 'date_creation';
    const sensTri = ordre === 'ASC' ? 'ASC' : 'DESC';

    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.TABLE_NAME}`
    );
    const count = Number(total[0].count);

    const { rows } = await query<Boutique>(
      `SELECT * FROM ${this.TABLE_NAME}
       ORDER BY ${colonneTri} ${sensTri}
       LIMIT $1 OFFSET $2`,
      [limite, offset]
    );

    // Calculer le nombre total de pages
    const total_pages = count ? Math.ceil(count / limite) : 0;

    return {
      donnees: rows,
      total: count,
      page,
      limite,
      total_pages
    };
  }

  /**
   * Récupère une boutique par son ID
   */
  static async getBoutiqueById(id: number): Promise<Boutique | null> {
    const { rows } = await query<Boutique>(`SELECT * FROM ${this.TABLE_NAME} WHERE id = $1`, [id]);

    return rows[0] ?? null;
  }

  /**
   * Récupère une boutique par son slug
   */
  static async getBoutiqueBySlug(slug: string): Promise<Boutique | null> {
    const { rows } = await query<Boutique>(`SELECT * FROM ${this.TABLE_NAME} WHERE slug = $1`, [slug]);

    return rows[0] ?? null;
  }

  /**
   * Récupère toutes les boutiques d'un vendeur
   */
  static async getBoutiquesByVendeurId(vendeurId: number): Promise<Boutique[]> {
    const { rows } = await query<Boutique>(
      `SELECT * FROM ${this.TABLE_NAME} WHERE vendeur_id = $1 ORDER BY date_creation DESC`,
      [vendeurId]
    );

    return rows;
  }

  /**
   * Crée une nouvelle boutique
   */
  static async createBoutique(boutiqueData: CreateBoutiqueData): Promise<Boutique> {
    // Ajouter les champs par défaut
    const champs = filtrerColonnes({
      ...boutiqueData,
      statut: 'active',
      note_moyenne: 0,
      nombre_avis: 0,
      couleur_primaire: boutiqueData.couleur_primaire || '#000000',
      couleur_secondaire: boutiqueData.couleur_secondaire || '#ffffff'
    });

    const colonnes = champs.map(([colonne]) => colonne);
    const placeholders = champs.map((_, i) => `$${i + 1}`);

    const { rows } = await query<Boutique>(
      `INSERT INTO ${this.TABLE_NAME} (${colonnes.join(', ')}, nombre_produits, date_creation, date_modification)
       VALUES (${placeholders.join(', ')}, 0, NOW(), NOW())
       RETURNING *`,
      champs.map(([, valeur]) => valeur)
    );

    return rows[0];
  }

  /**
   * Met à jour une boutique existante
   */
  static async updateBoutique(id: number, boutiqueData: Partial<Boutique>): Promise<Boutique> {
    const champs = filtrerColonnes(boutiqueData as Record<string, unknown>);

    if (champs.length === 0) {
      const { rows } = await query<Boutique>(
        `UPDATE ${this.TABLE_NAME} SET date_modification = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      if (!rows[0]) {
        throw new Error('Erreur lors de la mise à jour de la boutique: boutique introuvable');
      }

      return rows[0];
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = $${i + 1}`);

    const { rows } = await query<Boutique>(
      `UPDATE ${this.TABLE_NAME} SET ${affectations.join(', ')}, date_modification = NOW()
       WHERE id = $${champs.length + 1}
       RETURNING *`,
      [...champs.map(([, valeur]) => valeur), id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour de la boutique: boutique introuvable');
    }

    return rows[0];
  }

  /**
   * Supprime une boutique
   */
  static async deleteBoutique(id: number): Promise<void> {
    await query(`DELETE FROM ${this.TABLE_NAME} WHERE id = $1`, [id]);
  }

  /**
   * Met à jour le statut d'une boutique
   */
  static async updateBoutiqueStatus(id: number, statut: string): Promise<Boutique> {
    const { rows } = await query<Boutique>(
      `UPDATE ${this.TABLE_NAME}
       SET statut = $1::statut_boutique, date_modification = NOW()
       WHERE id = $2
       RETURNING *`,
      [statut, id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour du statut de la boutique: boutique introuvable');
    }

    return rows[0];
  }

  /**
   * Vérifie qu'une boutique appartient à un vendeur
   */
  static async isOwnedByVendeur(boutiqueId: number, vendeurId: number): Promise<boolean> {
    const boutique = await this.getBoutiqueById(boutiqueId);

    return !!boutique && boutique.vendeur_id === vendeurId;
  }

  /**
   * Vérifie si un slug de boutique existe déjà
   */
  static async slugExists(slug: string, excludeId?: number): Promise<boolean> {
    const conditions = excludeId ? 'AND id <> $2' : '';
    const params = excludeId ? [slug, excludeId] : [slug];

    const { rows } = await query<{ id: number }>(
      `SELECT id FROM ${this.TABLE_NAME} WHERE slug = $1 ${conditions} LIMIT 1`,
      params
    );

    return rows.length > 0;
  }
}
