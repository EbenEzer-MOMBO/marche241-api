import { query } from '../config/database';
import { Panier } from '../lib/database-types';

/**
 * Jointures de la boutique et du produit associés, sous forme d'objets JSON.
 * Reproduit les relations `boutique:boutique_id(*)` et `produit:produit_id(*)`
 * de l'ancien client.
 */
const JOINTURES = `
  (SELECT row_to_json(b) FROM boutiques b WHERE b.id = p.boutique_id) AS boutique,
  (SELECT row_to_json(pr) FROM produits pr WHERE pr.id = p.produit_id) AS produit`;

export class PanierModel {
  private static readonly TABLE_NAME = 'paniers';

  /**
   * Récupère tous les éléments du panier pour une session donnée
   */
  static async getPanierBySessionId(sessionId: string): Promise<Panier[]> {
    const { rows } = await query<Panier>(
      `SELECT p.*, ${JOINTURES}
       FROM ${this.TABLE_NAME} p
       WHERE p.session_id = $1
       ORDER BY p.date_creation DESC`,
      [sessionId]
    );

    return rows;
  }

  /**
   * Récupère un élément du panier par son ID
   */
  static async getPanierItemById(id: number): Promise<Panier | null> {
    const { rows } = await query<Panier>(
      `SELECT p.*, ${JOINTURES} FROM ${this.TABLE_NAME} p WHERE p.id = $1`,
      [id]
    );

    return rows[0] ?? null;
  }

  /**
   * Vérifie si un produit existe déjà dans le panier pour une session donnée.
   * La table n'ayant pas de contrainte d'unicité sur (session_id, produit_id),
   * plusieurs lignes peuvent correspondre : la plus ancienne est retournée.
   */
  static async checkProductInCart(sessionId: string, produitId: number): Promise<Panier | null> {
    const { rows } = await query<Panier>(
      `SELECT * FROM ${this.TABLE_NAME}
       WHERE session_id = $1 AND produit_id = $2
       ORDER BY id ASC
       LIMIT 1`,
      [sessionId, produitId]
    );

    return rows[0] ?? null;
  }

  /**
   * Ajoute un élément au panier
   */
  static async addToCart(panierData: Omit<Panier, 'id' | 'date_creation' | 'date_modification'>): Promise<Panier> {
    // Vérifier si le produit existe déjà dans le panier
    const existingItem = await this.checkProductInCart(panierData.session_id, panierData.produit_id);

    if (existingItem) {
      // Si le produit existe déjà, mettre à jour la quantité
      return this.updateCartItemQuantity(existingItem.id, existingItem.quantite + panierData.quantite);
    }

    return this.addToCartWithoutCheck(panierData);
  }

  /**
   * Ajoute un élément au panier sans vérification (utilisé quand la vérification est faite en amont)
   */
  static async addToCartWithoutCheck(panierData: Omit<Panier, 'id' | 'date_creation' | 'date_modification'>): Promise<Panier> {
    const { session_id, boutique_id, produit_id, quantite, variants_selectionnes } = panierData;

    const { rows } = await query<{ id: number }>(
      `INSERT INTO ${this.TABLE_NAME}
         (session_id, boutique_id, produit_id, quantite, variants_selectionnes,
          date_creation, date_modification)
       VALUES ($1, $2, $3, $4, $5::json, NOW(), NOW())
       RETURNING id`,
      [
        session_id,
        boutique_id,
        produit_id,
        quantite,
        variants_selectionnes === undefined || variants_selectionnes === null
          ? null
          : JSON.stringify(variants_selectionnes)
      ]
    );

    return this.getPanierItemById(rows[0].id) as Promise<Panier>;
  }

  /**
   * Met à jour la quantité d'un élément du panier
   */
  static async updateCartItemQuantity(id: number, quantite: number): Promise<Panier> {
    const { rows } = await query<{ id: number }>(
      `UPDATE ${this.TABLE_NAME} SET quantite = $1, date_modification = NOW()
       WHERE id = $2
       RETURNING id`,
      [quantite, id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour de la quantité: élément introuvable');
    }

    return this.getPanierItemById(rows[0].id) as Promise<Panier>;
  }

  /**
   * Met à jour les variants sélectionnés d'un élément du panier
   */
  static async updateCartItemVariants(id: number, variants_selectionnes: unknown): Promise<Panier> {
    const { rows } = await query<{ id: number }>(
      `UPDATE ${this.TABLE_NAME} SET variants_selectionnes = $1::json, date_modification = NOW()
       WHERE id = $2
       RETURNING id`,
      [
        variants_selectionnes === undefined || variants_selectionnes === null
          ? null
          : JSON.stringify(variants_selectionnes),
        id
      ]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour des variants: élément introuvable');
    }

    return this.getPanierItemById(rows[0].id) as Promise<Panier>;
  }

  /**
   * Supprime un élément du panier
   */
  static async removeFromCart(id: number): Promise<void> {
    await query(`DELETE FROM ${this.TABLE_NAME} WHERE id = $1`, [id]);
  }

  /**
   * Vide le panier pour une session donnée
   */
  static async clearCart(sessionId: string): Promise<void> {
    await query(`DELETE FROM ${this.TABLE_NAME} WHERE session_id = $1`, [sessionId]);
  }

  /**
   * Compte le nombre d'articles dans le panier pour une session donnée
   */
  static async countCartItems(sessionId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${this.TABLE_NAME} WHERE session_id = $1`,
      [sessionId]
    );

    return Number(rows[0].count);
  }
}
