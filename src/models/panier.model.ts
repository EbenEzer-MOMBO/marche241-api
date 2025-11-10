import { supabaseAdmin } from '../config/supabase';
import { Panier, ResultatPagine, OptionsPagination } from '../lib/database-types';

export class PanierModel {
  private static readonly TABLE_NAME = 'paniers';

  /**
   * Récupère tous les éléments du panier pour une session donnée
   */
  static async getPanierBySessionId(sessionId: string): Promise<Panier[]> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select(`
        *,
        boutique:boutique_id(*),
        produit:produit_id(*)
      `)
      .eq('session_id', sessionId)
      .order('date_creation', { ascending: false });
    
    if (error) {
      throw new Error(`Erreur lors de la récupération du panier: ${error.message}`);
    }
    
    return data as Panier[];
  }

  /**
   * Récupère un élément du panier par son ID
   */
  static async getPanierItemById(id: number): Promise<Panier | null> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select(`
        *,
        boutique:boutique_id(*),
        produit:produit_id(*)
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Code d'erreur pour "aucune ligne trouvée"
        return null;
      }
      throw new Error(`Erreur lors de la récupération de l'élément du panier: ${error.message}`);
    }
    
    return data as Panier;
  }

  /**
   * Vérifie si un produit existe déjà dans le panier pour une session donnée
   */
  static async checkProductInCart(sessionId: string, produitId: number): Promise<Panier | null> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('session_id', sessionId)
      .eq('produit_id', produitId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Code d'erreur pour "aucune ligne trouvée"
        return null;
      }
      throw new Error(`Erreur lors de la vérification du produit dans le panier: ${error.message}`);
    }
    
    return data as Panier;
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
    
    // Ajouter les champs par défaut
    const panierWithDefaults = {
      ...panierData,
      date_creation: new Date().toISOString(),
      date_modification: new Date().toISOString()
    };
    
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .insert(panierWithDefaults)
      .select(`
        *,
        boutique:boutique_id(*),
        produit:produit_id(*)
      `)
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de l'ajout au panier: ${error.message}`);
    }
    
    return data as Panier;
  }

  /**
   * Ajoute un élément au panier sans vérification (utilisé quand la vérification est faite en amont)
   */
  static async addToCartWithoutCheck(panierData: Omit<Panier, 'id' | 'date_creation' | 'date_modification'>): Promise<Panier> {
    // Ajouter les champs par défaut
    const panierWithDefaults = {
      ...panierData,
      date_creation: new Date().toISOString(),
      date_modification: new Date().toISOString()
    };
    
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .insert(panierWithDefaults)
      .select(`
        *,
        boutique:boutique_id(*),
        produit:produit_id(*)
      `)
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de l'ajout au panier: ${error.message}`);
    }
    
    return data as Panier;
  }

  /**
   * Met à jour la quantité d'un élément du panier
   */
  static async updateCartItemQuantity(id: number, quantite: number): Promise<Panier> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        quantite,
        date_modification: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        boutique:boutique_id(*),
        produit:produit_id(*)
      `)
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour de la quantité: ${error.message}`);
    }
    
    return data as Panier;
  }

  /**
   * Met à jour les variants sélectionnés d'un élément du panier
   */
  static async updateCartItemVariants(id: number, variants_selectionnes: any): Promise<Panier> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        variants_selectionnes,
        date_modification: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        boutique:boutique_id(*),
        produit:produit_id(*)
      `)
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour des variants: ${error.message}`);
    }
    
    return data as Panier;
  }

  /**
   * Supprime un élément du panier
   */
  static async removeFromCart(id: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);
    
    if (error) {
      throw new Error(`Erreur lors de la suppression de l'élément du panier: ${error.message}`);
    }
  }

  /**
   * Vide le panier pour une session donnée
   */
  static async clearCart(sessionId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .delete()
      .eq('session_id', sessionId);
    
    if (error) {
      throw new Error(`Erreur lors de la suppression du panier: ${error.message}`);
    }
  }

  /**
   * Compte le nombre d'articles dans le panier pour une session donnée
   */
  static async countCartItems(sessionId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId);
    
    if (error) {
      throw new Error(`Erreur lors du comptage des éléments du panier: ${error.message}`);
    }
    
    return count || 0;
  }
}
