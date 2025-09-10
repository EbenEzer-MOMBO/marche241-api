import { supabaseAdmin } from '../config/supabase';
import { Categorie } from '../lib/database-types';

export class CategorieModel {
  /**
   * Récupère toutes les catégories
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getAllCategories(boutiqueId?: number): Promise<Categorie[]> {
    // Construire la requête
    let query = supabaseAdmin
      .from('categories')
      .select('*')
      .order('ordre_affichage', { ascending: true });
    
    // Filtrer par boutique si spécifié
    if (boutiqueId) {
      query = query.eq('boutique_id', boutiqueId);
    }
    
    // Exécuter la requête
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des catégories: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère une catégorie par son ID
   */
  static async getCategorieById(id: number): Promise<Categorie | null> {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération de la catégorie: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère une catégorie par son slug
   */
  static async getCategorieBySlug(slug: string): Promise<Categorie | null> {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération de la catégorie: ${error.message}`);
    }
    
    return data;
  }
}
