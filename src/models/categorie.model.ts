import { supabaseAdmin } from '../config/supabase';
import { Categorie } from '../lib/database-types';

export interface CreateCategorieData {
  nom: string;
  slug: string;
  description?: string;
  parent_id?: number;
  ordre_affichage?: number;
  boutique_id?: number;
}

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
      const { data: maxOrdre } = await supabaseAdmin
        .from('categories')
        .select('ordre_affichage')
        .order('ordre_affichage', { ascending: false })
        .limit(1)
        .single();
      
      ordreAffichage = maxOrdre ? maxOrdre.ordre_affichage + 1 : 1;
    }

    // Préparer les données avec les valeurs par défaut
    const categorieWithDefaults = {
      ...categorieData,
      ordre_affichage: ordreAffichage,
      statut: 'active' as const,
      date_creation: new Date().toISOString(),
      date_modification: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert(categorieWithDefaults)
      .select()
      .single();

    if (error) {
      throw new Error(`Erreur lors de la création de la catégorie: ${error.message}`);
    }

    return data as Categorie;
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

    // Préparer les données de mise à jour
    const updatedData = {
      ...categorieData,
      date_modification: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('categories')
      .update(updatedData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Erreur lors de la mise à jour de la catégorie: ${error.message}`);
    }

    return data as Categorie;
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
    const { data: enfants } = await supabaseAdmin
      .from('categories')
      .select('id')
      .eq('parent_id', id);

    if (enfants && enfants.length > 0) {
      throw new Error('Impossible de supprimer une catégorie qui a des sous-catégories');
    }

    // Vérifier s'il y a des produits associés
    const { data: produits } = await supabaseAdmin
      .from('produits')
      .select('id')
      .eq('categorie_id', id);

    if (produits && produits.length > 0) {
      throw new Error('Impossible de supprimer une catégorie qui contient des produits');
    }

    const { error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Erreur lors de la suppression de la catégorie: ${error.message}`);
    }
  }

  /**
   * Vérifie si une catégorie appartient à une boutique spécifique
   */
  static async isCategorieOwnedByBoutique(categorieId: number, boutiqueId: number): Promise<boolean> {
    const { data, error } = await supabaseAdmin
      .from('categories')
      .select('boutique_id')
      .eq('id', categorieId)
      .single();

    if (error) {
      return false;
    }

    return data?.boutique_id === boutiqueId;
  }
}
