import { supabaseAdmin } from '../config/supabase';
import { Boutique, CreateBoutiqueData, ResultatPagine, OptionsPagination } from '../lib/database-types';

export class BoutiqueModel {
  private static readonly TABLE_NAME = 'boutiques';

  /**
   * Récupère toutes les boutiques avec pagination
   */
  static async getAllBoutiques(options: OptionsPagination): Promise<ResultatPagine<Boutique>> {
    const { page, limite, tri_par = 'date_creation', ordre = 'DESC' } = options;
    
    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;
    
    // Récupérer les données avec pagination
    const { data, error, count } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*', { count: 'exact' })
      .order(tri_par, { ascending: ordre === 'ASC' })
      .range(offset, offset + limite - 1);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des boutiques: ${error.message}`);
    }
    
    // Calculer le nombre total de pages
    const total_pages = count ? Math.ceil(count / limite) : 0;
    
    return {
      donnees: data as Boutique[],
      total: count || 0,
      page,
      limite,
      total_pages
    };
  }

  /**
   * Récupère une boutique par son ID
   */
  static async getBoutiqueById(id: number): Promise<Boutique | null> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Code d'erreur pour "aucune ligne trouvée"
        return null;
      }
      throw new Error(`Erreur lors de la récupération de la boutique: ${error.message}`);
    }
    
    return data as Boutique;
  }

  /**
   * Récupère une boutique par son slug
   */
  static async getBoutiqueBySlug(slug: string): Promise<Boutique | null> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('slug', slug)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Code d'erreur pour "aucune ligne trouvée"
        return null;
      }
      throw new Error(`Erreur lors de la récupération de la boutique: ${error.message}`);
    }
    
    return data as Boutique;
  }

  /**
   * Récupère toutes les boutiques d'un vendeur
   */
  static async getBoutiquesByVendeurId(vendeurId: number): Promise<Boutique[]> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('vendeur_id', vendeurId)
      .order('date_creation', { ascending: false });
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des boutiques du vendeur: ${error.message}`);
    }
    
    return data as Boutique[];
  }

  /**
   * Crée une nouvelle boutique
   */
  static async createBoutique(boutiqueData: CreateBoutiqueData): Promise<Boutique> {
    // Ajouter les champs par défaut
    const boutiqueWithDefaults = {
      ...boutiqueData,
      statut: 'active' as const,
      date_creation: new Date().toISOString(),
      date_modification: new Date().toISOString(),
      nombre_produits: 0,
      note_moyenne: 0,
      nombre_avis: 0,
      couleur_primaire: boutiqueData.couleur_primaire || '#000000',
      couleur_secondaire: boutiqueData.couleur_secondaire || '#ffffff'
    };
    
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .insert(boutiqueWithDefaults)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la création de la boutique: ${error.message}`);
    }
    
    return data as Boutique;
  }

  /**
   * Met à jour une boutique existante
   */
  static async updateBoutique(id: number, boutiqueData: Partial<Boutique>): Promise<Boutique> {
    // Ajouter la date de modification
    const updatedData = {
      ...boutiqueData,
      date_modification: new Date().toISOString()
    };
    
    // Supprimer les champs qu'on ne veut pas mettre à jour
    delete updatedData.id;
    delete updatedData.date_creation;
    delete updatedData.vendeur_id;
    
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update(updatedData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour de la boutique: ${error.message}`);
    }
    
    return data as Boutique;
  }

  /**
   * Supprime une boutique
   */
  static async deleteBoutique(id: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);
    
    if (error) {
      throw new Error(`Erreur lors de la suppression de la boutique: ${error.message}`);
    }
  }

  /**
   * Met à jour le statut d'une boutique
   */
  static async updateBoutiqueStatus(id: number, statut: string): Promise<Boutique> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        statut,
        date_modification: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour du statut de la boutique: ${error.message}`);
    }
    
    return data as Boutique;
  }

  /**
   * Vérifie si un slug de boutique existe déjà
   */
  static async slugExists(slug: string, excludeId?: number): Promise<boolean> {
    let query = supabaseAdmin
      .from(this.TABLE_NAME)
      .select('id')
      .eq('slug', slug);
    
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Erreur lors de la vérification du slug: ${error.message}`);
    }
    
    return data.length > 0;
  }
}
