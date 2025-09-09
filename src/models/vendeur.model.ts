import { supabaseAdmin } from '../config/supabase';
import { Vendeur, CreateVendeurData, ResultatPagine, OptionsPagination } from '../lib/database-types';

export class VendeurModel {
  private static readonly TABLE_NAME = 'vendeurs';

  /**
   * Récupère tous les vendeurs avec pagination
   */
  static async getAllVendeurs(options: OptionsPagination): Promise<ResultatPagine<Vendeur>> {
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
      throw new Error(`Erreur lors de la récupération des vendeurs: ${error.message}`);
    }
    
    // Calculer le nombre total de pages
    const total_pages = count ? Math.ceil(count / limite) : 0;
    
    return {
      donnees: data as Vendeur[],
      total: count || 0,
      page,
      limite,
      total_pages
    };
  }

  /**
   * Récupère un vendeur par son ID
   */
  static async getVendeurById(id: number): Promise<Vendeur | null> {
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
      throw new Error(`Erreur lors de la récupération du vendeur: ${error.message}`);
    }
    
    return data as Vendeur;
  }

  /**
   * Récupère un vendeur par son numéro de téléphone
   */
  static async getVendeurByTelephone(telephone: string): Promise<Vendeur | null> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('telephone', telephone)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        // Code d'erreur pour "aucune ligne trouvée"
        return null;
      }
      throw new Error(`Erreur lors de la récupération du vendeur: ${error.message}`);
    }
    
    return data as Vendeur;
  }

  /**
   * Crée un nouveau vendeur
   */
  static async createVendeur(vendeurData: CreateVendeurData): Promise<Vendeur> {
    // Ajouter les champs par défaut
    const vendeurWithDefaults = {
      ...vendeurData,
      statut: 'en_attente_verification' as const,
      date_creation: new Date().toISOString(),
      date_modification: new Date().toISOString(),
      tentatives_code: 0,
      verification_telephone: false,
      verification_email: false
    };
    
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .insert(vendeurWithDefaults)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la création du vendeur: ${error.message}`);
    }
    
    return data as Vendeur;
  }

  /**
   * Met à jour un vendeur existant
   */
  static async updateVendeur(id: number, vendeurData: Partial<Vendeur>): Promise<Vendeur> {
    // Ajouter la date de modification
    const updatedData = {
      ...vendeurData,
      date_modification: new Date().toISOString()
    };
    
    // Supprimer les champs qu'on ne veut pas mettre à jour
    delete updatedData.id;
    delete updatedData.date_creation;
    
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update(updatedData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour du vendeur: ${error.message}`);
    }
    
    return data as Vendeur;
  }

  /**
   * Supprime un vendeur
   */
  static async deleteVendeur(id: number): Promise<void> {
    const { error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .delete()
      .eq('id', id);
    
    if (error) {
      throw new Error(`Erreur lors de la suppression du vendeur: ${error.message}`);
    }
  }

  /**
   * Met à jour le statut d'un vendeur
   */
  static async updateVendeurStatus(id: number, statut: string): Promise<Vendeur> {
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
      throw new Error(`Erreur lors de la mise à jour du statut du vendeur: ${error.message}`);
    }
    
    return data as Vendeur;
  }

  /**
   * Génère un code de vérification pour un vendeur
   */
  static async generateVerificationCode(telephone: string): Promise<string> {
    // Générer un code à 4 chiffres
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Définir l'expiration à 10 minutes
    const codeExpiration = new Date();
    codeExpiration.setMinutes(codeExpiration.getMinutes() + 10);
    
    // Mettre à jour le vendeur avec le nouveau code
    const { error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        code_verification: code,
        code_expiration: codeExpiration.toISOString(),
        tentatives_code: 0
      })
      .eq('telephone', telephone);
    
    if (error) {
      throw new Error(`Erreur lors de la génération du code de vérification: ${error.message}`);
    }
    
    return code;
  }

  /**
   * Vérifie un code de vérification
   */
  static async verifyCode(telephone: string, code: string): Promise<boolean> {
    // Récupérer le vendeur
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('code_verification, code_expiration, tentatives_code')
      .eq('telephone', telephone)
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la vérification du code: ${error.message}`);
    }
    
    if (!data) {
      return false;
    }
    
    // Vérifier si le code est expiré
    const codeExpiration = new Date(data.code_expiration);
    if (codeExpiration < new Date()) {
      return false;
    }
    
    // Vérifier si le code est correct
    if (data.code_verification !== code) {
      // Incrémenter le nombre de tentatives
      await supabaseAdmin
        .from(this.TABLE_NAME)
        .update({
          tentatives_code: data.tentatives_code + 1,
          derniere_tentative: new Date().toISOString()
        })
        .eq('telephone', telephone);
      
      return false;
    }
    
    // Code correct, mettre à jour le statut du vendeur
    await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        verification_telephone: true,
        statut: 'actif',
        code_verification: null,
        code_expiration: null,
        tentatives_code: 0,
        derniere_connexion: new Date().toISOString()
      })
      .eq('telephone', telephone);
    
    return true;
  }
}
