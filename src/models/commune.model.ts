import { supabaseAdmin } from '../config/supabase';
import { CommuneLivraison } from '../lib/database-types';

export class CommuneModel {
  /**
   * Récupère toutes les communes de livraison
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getAllCommunes(boutiqueId?: number): Promise<CommuneLivraison[]> {
    // Construire la requête
    let query = supabaseAdmin
      .from('communes_livraison')
      .select('*')
      .order('nom_commune', { ascending: true });
    
    // Filtrer par boutique si spécifié
    if (boutiqueId) {
      query = query.eq('boutique_id', boutiqueId);
    }
    
    // Exécuter la requête
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des communes: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère les communes d'une boutique spécifique
   * @param boutiqueId ID de la boutique
   */
  static async getCommunesByBoutiqueId(boutiqueId: number): Promise<CommuneLivraison[]> {
    const { data, error } = await supabaseAdmin
      .from('communes_livraison')
      .select('*')
      .eq('boutique_id', boutiqueId)
      .order('nom_commune', { ascending: true });
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des communes de la boutique: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère les communes actives d'une boutique spécifique
   * @param boutiqueId ID de la boutique
   */
  static async getActiveCommunesByBoutiqueId(boutiqueId: number): Promise<CommuneLivraison[]> {
    const { data, error } = await supabaseAdmin
      .from('communes_livraison')
      .select('*')
      .eq('boutique_id', boutiqueId)
      .eq('est_active', true)
      .order('nom_commune', { ascending: true });
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des communes actives de la boutique: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère les communes de livraison actives
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getActiveCommunes(boutiqueId?: number): Promise<CommuneLivraison[]> {
    // Construire la requête
    let query = supabaseAdmin
      .from('communes_livraison')
      .select('*')
      .eq('est_active', true)
      .order('nom_commune', { ascending: true });
    
    // Filtrer par boutique si spécifié
    if (boutiqueId) {
      query = query.eq('boutique_id', boutiqueId);
    }
    
    // Exécuter la requête
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des communes actives: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère une commune par son ID
   * @param id ID de la commune
   */
  static async getCommuneById(id: number): Promise<CommuneLivraison | null> {
    const { data, error } = await supabaseAdmin
      .from('communes_livraison')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération de la commune: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Crée une nouvelle commune de livraison
   * @param commune Données de la commune à créer
   */
  static async createCommune(commune: Omit<CommuneLivraison, 'id' | 'date_creation' | 'date_modification'>): Promise<CommuneLivraison> {
    const { data, error } = await supabaseAdmin
      .from('communes_livraison')
      .insert([commune])
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la création de la commune: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Met à jour une commune existante
   * @param id ID de la commune à mettre à jour
   * @param commune Données à mettre à jour
   */
  static async updateCommune(id: number, commune: Partial<Omit<CommuneLivraison, 'id' | 'date_creation' | 'date_modification'>>): Promise<CommuneLivraison> {
    const { data, error } = await supabaseAdmin
      .from('communes_livraison')
      .update(commune)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour de la commune: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Active ou désactive une commune
   * @param id ID de la commune
   * @param isActive État d'activation
   */
  static async toggleCommuneStatus(id: number, isActive: boolean): Promise<CommuneLivraison> {
    const { data, error } = await supabaseAdmin
      .from('communes_livraison')
      .update({ est_active: isActive })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors du changement de statut de la commune: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Supprime une commune
   * @param id ID de la commune à supprimer
   */
  static async deleteCommune(id: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from('communes_livraison')
      .delete()
      .eq('id', id);
    
    if (error) {
      throw new Error(`Erreur lors de la suppression de la commune: ${error.message}`);
    }
  }
}
