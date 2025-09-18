import { supabaseAdmin } from '../config/supabase';
import { Produit } from '../lib/database-types';

export class ProduitModel {
  /**
   * Met à jour le stock d'un produit
   * @param produitId ID du produit
   * @param quantite Quantité à décrémenter (valeur positive pour décrémenter, négative pour incrémenter)
   * @returns Le produit mis à jour
   */
  static async updateStock(produitId: number, quantite: number): Promise<Produit> {
    console.log(`[ProduitModel] Mise à jour du stock pour le produit ${produitId}, quantité: ${quantite}`);
    
    try {
      // Récupérer le produit actuel pour vérifier le stock disponible
      const { data: produit, error: produitError } = await supabaseAdmin
        .from('produits')
        .select('stock')
        .eq('id', produitId)
        .single();
      
      if (produitError) {
        console.error(`[ProduitModel] Erreur lors de la récupération du produit: ${produitError.message}`);
        throw new Error(`Erreur lors de la récupération du produit: ${produitError.message}`);
      }
      
      if (!produit) {
        console.error(`[ProduitModel] Produit non trouvé: ${produitId}`);
        throw new Error(`Produit non trouvé: ${produitId}`);
      }
      
      // Vérifier si le stock est suffisant
      const nouveauStock = produit.stock - quantite;
      if (nouveauStock < 0) {
        console.error(`[ProduitModel] Stock insuffisant pour le produit ${produitId}: ${produit.stock} < ${quantite}`);
        throw new Error(`Stock insuffisant pour le produit ${produitId}`);
      }
      
      // Mettre à jour le stock
      const { data: produitMisAJour, error: updateError } = await supabaseAdmin
        .from('produits')
        .update({
          stock: nouveauStock,
          date_modification: new Date()
        })
        .eq('id', produitId)
        .select()
        .single();
      
      if (updateError) {
        console.error(`[ProduitModel] Erreur lors de la mise à jour du stock: ${updateError.message}`);
        throw new Error(`Erreur lors de la mise à jour du stock: ${updateError.message}`);
      }
      
      console.log(`[ProduitModel] Stock mis à jour pour le produit ${produitId}: ${produit.stock} -> ${nouveauStock}`);
      return produitMisAJour;
    } catch (error) {
      console.error(`[ProduitModel] Exception dans updateStock:`, error);
      throw error;
    }
  }
  
  /**
   * Récupère tous les produits avec pagination
   */
  static async getAllProduits(page: number = 1, limite: number = 10, tri_par: string = 'date_creation', ordre: 'ASC' | 'DESC' = 'DESC'): Promise<{ produits: Produit[], total: number }> {
    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;
    
    // Récupérer le nombre total de produits
    const { count, error: countError } = await supabaseAdmin
      .from('produits')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      throw new Error(`Erreur lors du comptage des produits: ${countError.message}`);
    }
    
    // Récupérer les produits avec pagination
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .order(tri_par, { ascending: ordre === 'ASC' })
      .range(offset, offset + limite - 1);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des produits: ${error.message}`);
    }
    
    return {
      produits: data || [],
      total: count || 0
    };
  }

  /**
   * Récupère un produit par son ID
   */
  static async getProduitById(id: number): Promise<Produit | null> {
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération du produit: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère un produit par son slug
   */
  static async getProduitBySlug(slug: string): Promise<Produit | null> {
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .eq('slug', slug)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération du produit: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère les produits par catégorie
   */
  static async getProduitsByCategorie(categorieId: number, limite: number = 10): Promise<Produit[]> {
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .eq('categorie_id', categorieId)
      .eq('statut', 'actif')
      .order('note_moyenne', { ascending: false })
      .limit(limite);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des produits par catégorie: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère les produits les plus importants par catégorie
   * Les produits sont triés par note moyenne et nombre de ventes
   * Ne renvoie que les catégories avec des produits, limité à 3 catégories maximum
   * @param limite Nombre de produits à récupérer par catégorie
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getTopProduitsByCategories(limite: number = 4, boutiqueId?: number): Promise<{ [key: string]: any }> {
    // Récupérer toutes les catégories
    const { data: categories, error: categoriesError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('statut', 'active')
      .order('ordre_affichage', { ascending: true })
      .limit(3); // Limiter à 3 catégories maximum
    
    if (categoriesError) {
      throw new Error(`Erreur lors de la récupération des catégories: ${categoriesError.message}`);
    }
    
    if (!categories || categories.length === 0) {
      return {};
    }
    
    // Récupérer les produits pour chaque catégorie
    const result: { [key: string]: any } = {};
    
    for (const categorie of categories) {
      // Construire la requête
      let query = supabaseAdmin
        .from('produits')
        .select(`
          *,
          boutique:boutique_id(id, nom, slug, logo),
          categorie:categorie_id(id, nom, slug)
        `)
        .eq('categorie_id', categorie.id)
        .eq('statut', 'actif')
        .order('note_moyenne', { ascending: false })
        .order('nombre_ventes', { ascending: false })
        .limit(limite);
      
      // Ajouter le filtre par boutique si spécifié
      if (boutiqueId) {
        query = query.eq('boutique_id', boutiqueId);
      }
      
      // Exécuter la requête
      const { data: produits, error: produitsError } = await query;
      
      if (produitsError) {
        console.error(`Erreur lors de la récupération des produits pour la catégorie ${categorie.id}: ${produitsError.message}`);
        continue;
      }
      
      // Ne pas inclure les catégories sans produits
      if (produits && produits.length > 0) {
        result[categorie.slug] = {
          categorie,
          produits: produits
        };
      }
    }
    
    return result;
  }
}
