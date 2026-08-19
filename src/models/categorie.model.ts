import { query } from '../config/database';
import { Categorie } from '../lib/database-types';

export interface CreateCategorieData {
  nom: string;
  slug: string;
  description?: string;
  parent_id?: number;
  ordre_affichage?: number;
  boutique_id?: number;
}

/**
 * Colonnes modifiables via les méthodes de création et de mise à jour.
 * Les noms de colonnes étant interpolés dans le SQL, ils sont valides
 * uniquement s'ils proviennent de cette liste.
 */
const COLONNES_AUTORISEES = [
  'nom',
  'slug',
  'description',
  'parent_id',
  'ordre_affichage',
  'boutique_id',
  'statut'
] as const;

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) =>
    (COLONNES_AUTORISEES as readonly string[]).includes(colonne)
  );

export class CategorieModel {
  /**
   * Récupère toutes les catégories
   * @param boutiqueId ID de la boutique (optionnel)
   * Si un boutiqueId est fourni, retourne les catégories globales (sans boutique_id)
   * ET les catégories spécifiques à cette boutique
   */
  static async getAllCategories(boutiqueId?: number): Promise<Array<Categorie & { nombre_produits: number }>> {
    // Si une boutique est spécifiée, récupérer les catégories globales ET celles de la boutique
    const conditions = boutiqueId ? 'WHERE c.boutique_id IS NULL OR c.boutique_id = $1' : '';
    const params = boutiqueId ? [boutiqueId] : [];

    const { rows } = await query<Categorie & { nombre_produits: string }>(
      `SELECT c.*, COUNT(p.id) AS nombre_produits
       FROM categories c
       LEFT JOIN produits p ON p.categorie_id = c.id
       ${conditions}
       GROUP BY c.id
       ORDER BY c.ordre_affichage ASC`,
      params
    );

    // `COUNT` est retourné en chaîne par le driver : le ramener en nombre
    return rows.map((categorie) => ({
      ...categorie,
      nombre_produits: Number(categorie.nombre_produits)
    }));
  }

  /**
   * Récupère une catégorie par son ID
   */
  static async getCategorieById(id: number): Promise<Categorie | null> {
    const { rows } = await query<Categorie>(`SELECT * FROM categories WHERE id = $1`, [id]);

    return rows[0] ?? null;
  }

  /**
   * Récupère une catégorie par son slug
   */
  static async getCategorieBySlug(slug: string): Promise<Categorie | null> {
    const { rows } = await query<Categorie>(`SELECT * FROM categories WHERE slug = $1`, [slug]);

    return rows[0] ?? null;
  }

  /**
   * Crée une nouvelle catégorie
   */
  static async createCategorie(categorieData: CreateCategorieData): Promise<Categorie> {
    // Vérifier si le slug existe déjà
    const existingCategorie = await this.getCategorieBySlug(categorieData.slug);
    if (existingCategorie) {
      throw new Error('Une catégorie avec ce slug existe déjà');
    }

    // Déterminer l'ordre d'affichage si non spécifié
    let ordreAffichage = categorieData.ordre_affichage;
    if (!ordreAffichage) {
      const { rows: maxOrdre } = await query<{ ordre_affichage: number }>(
        `SELECT ordre_affichage FROM categories ORDER BY ordre_affichage DESC LIMIT 1`
      );

      ordreAffichage = maxOrdre[0] ? maxOrdre[0].ordre_affichage + 1 : 1;
    }

    // Préparer les données avec les valeurs par défaut
    const champs = filtrerColonnes({
      ...categorieData,
      ordre_affichage: ordreAffichage,
      statut: 'active'
    });

    const colonnes = champs.map(([colonne]) => colonne);
    const placeholders = champs.map((_, i) => `$${i + 1}`);

    const { rows } = await query<Categorie>(
      `INSERT INTO categories (${colonnes.join(', ')}, date_creation, date_modification)
       VALUES (${placeholders.join(', ')}, NOW(), NOW())
       RETURNING *`,
      champs.map(([, valeur]) => valeur)
    );

    return rows[0];
  }

  /**
   * Met à jour une catégorie existante
   */
  static async updateCategorie(id: number, categorieData: Partial<CreateCategorieData>): Promise<Categorie> {
    // Vérifier si la catégorie existe
    const existingCategorie = await this.getCategorieById(id);
    if (!existingCategorie) {
      throw new Error('Catégorie non trouvée');
    }

    // Si le slug est modifié, vérifier qu'il n'existe pas déjà
    if (categorieData.slug && categorieData.slug !== existingCategorie.slug) {
      const slugExists = await this.getCategorieBySlug(categorieData.slug);
      if (slugExists) {
        throw new Error('Une catégorie avec ce slug existe déjà');
      }
    }

    const champs = filtrerColonnes(categorieData as Record<string, unknown>);

    // Sans champ à modifier, seule la date de modification est rafraîchie
    if (champs.length === 0) {
      const { rows } = await query<Categorie>(
        `UPDATE categories SET date_modification = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      return rows[0];
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = $${i + 1}`);

    const { rows } = await query<Categorie>(
      `UPDATE categories SET ${affectations.join(', ')}, date_modification = NOW()
       WHERE id = $${champs.length + 1}
       RETURNING *`,
      [...champs.map(([, valeur]) => valeur), id]
    );

    return rows[0];
  }

  /**
   * Supprime une catégorie
   */
  static async deleteCategorie(id: number): Promise<void> {
    // Vérifier si la catégorie existe
    const existingCategorie = await this.getCategorieById(id);
    if (!existingCategorie) {
      throw new Error('Catégorie non trouvée');
    }

    // Vérifier s'il y a des catégories enfants
    const { rows: enfants } = await query<{ id: number }>(
      `SELECT id FROM categories WHERE parent_id = $1 LIMIT 1`,
      [id]
    );

    if (enfants.length > 0) {
      throw new Error('Impossible de supprimer une catégorie qui a des sous-catégories');
    }

    // Vérifier s'il y a des produits associés
    const { rows: produits } = await query<{ id: number }>(
      `SELECT id FROM produits WHERE categorie_id = $1 LIMIT 1`,
      [id]
    );

    if (produits.length > 0) {
      throw new Error('Impossible de supprimer une catégorie qui contient des produits');
    }

    await query(`DELETE FROM categories WHERE id = $1`, [id]);
  }

  /**
   * Vérifie si une catégorie appartient à une boutique spécifique
   */
  static async isCategorieOwnedByBoutique(categorieId: number, boutiqueId: number): Promise<boolean> {
    const { rows } = await query<{ boutique_id: number | null }>(
      `SELECT boutique_id FROM categories WHERE id = $1`,
      [categorieId]
    );

    return rows[0]?.boutique_id === boutiqueId;
  }
}
