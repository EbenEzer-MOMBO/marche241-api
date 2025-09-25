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
   * Récupère un vendeur par son email
   */
  static async getVendeurByEmail(email: string): Promise<Vendeur | null> {
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('*')
      .eq('email', email)
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
   * Génère un code de vérification pour un vendeur (par téléphone)
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
   * Inscription complète d'un vendeur avec envoi du code de vérification
   */
  static async inscrireVendeur(data: CreateVendeurData): Promise<{ vendeur: Vendeur; code: string }> {
    const { email, nom, telephone, ville } = data;
    
    console.log(`[VendeurModel] Inscription du vendeur: ${email}`);
    
    // Vérifier si l'email existe déjà
    const vendeurExistantEmail = await this.getVendeurByEmail(email);
    if (vendeurExistantEmail) {
      throw new Error('Un compte avec cette adresse email existe déjà');
    }
    
    // Vérifier si le téléphone existe déjà (seulement si fourni)
    if (telephone && telephone.trim() !== '') {
      const vendeurExistantTel = await this.getVendeurByTelephone(telephone);
      if (vendeurExistantTel) {
        throw new Error('Un compte avec ce numéro de téléphone existe déjà');
      }
    }
    
    // Générer un code de vérification
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Définir l'expiration à 30 minutes en UTC
    const maintenant = new Date();
    const codeExpiration = new Date(maintenant.getTime() + 30 * 60 * 1000);
    
    console.log(`[VendeurModel] Code généré pour inscription: ${code}`);
    console.log(`[VendeurModel] Expiration: ${codeExpiration.toISOString()}`);
    
    // Créer le vendeur avec le code de vérification
    const { data: vendeurCree, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .insert({
        email,
        nom,
        telephone: telephone || '',
        ville: ville || '',
        code_verification: code,
        code_expiration: codeExpiration.toISOString(),
        tentatives_code: 0,
        statut: 'en_attente_verification',
        verification_email: false,
        verification_telephone: false,
        date_creation: new Date().toISOString(),
        date_modification: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error(`[VendeurModel] Erreur lors de la création du vendeur:`, error);
      
      // Gérer les erreurs de contrainte d'unicité
      if (error.code === '23505') { // Code PostgreSQL pour violation de contrainte unique
        if (error.message.includes('vendeurs_email_key')) {
          throw new Error('Un compte avec cette adresse email existe déjà');
        } else if (error.message.includes('vendeurs_telephone_key')) {
          throw new Error('Un compte avec ce numéro de téléphone existe déjà');
        }
      }
      
      throw new Error(`Erreur lors de la création du vendeur: ${error.message}`);
    }
    
    console.log(`[VendeurModel] Vendeur créé avec succès: ID ${vendeurCree.id}`);
    
    return {
      vendeur: vendeurCree as Vendeur,
      code
    };
  }

  /**
   * Génère un code de vérification pour un vendeur (par email)
   */
  static async generateVerificationCodeByEmail(email: string): Promise<string> {
    // Générer un code à 6 chiffres pour l'email (plus sécurisé)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Définir l'expiration à 30 minutes en UTC (pour éviter les problèmes de fuseau horaire)
    const maintenant = new Date();
    const codeExpiration = new Date(maintenant.getTime() + 30 * 60 * 1000); // 30 minutes en millisecondes
    
    console.log(`[VendeurModel] Génération code pour ${email}`);
    console.log(`[VendeurModel] Heure actuelle: ${maintenant.toISOString()}`);
    console.log(`[VendeurModel] Expiration: ${codeExpiration.toISOString()}`);
    console.log(`[VendeurModel] Code généré: ${code}`);
    
    // Mettre à jour le vendeur avec le nouveau code
    const { error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        code_verification: code,
        code_expiration: codeExpiration.toISOString(),
        tentatives_code: 0
      })
      .eq('email', email);
    
    if (error) {
      throw new Error(`Erreur lors de la génération du code de vérification: ${error.message}`);
    }
    
    return code;
  }

  /**
   * Vérifie un code de vérification (par téléphone)
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

  /**
   * Vérifie un code de vérification (par email)
   */
  static async verifyCodeByEmail(email: string, code: string): Promise<boolean> {
    console.log(`[VendeurModel] Vérification du code pour ${email}`);
    console.log(`[VendeurModel] Code reçu: "${code}" (longueur: ${code.length})`);
    
    // Récupérer le vendeur
    const { data, error } = await supabaseAdmin
      .from(this.TABLE_NAME)
      .select('code_verification, code_expiration, tentatives_code')
      .eq('email', email)
      .single();
    
    if (error) {
      console.error(`[VendeurModel] Erreur DB lors de la vérification:`, error);
      throw new Error(`Erreur lors de la vérification du code: ${error.message}`);
    }
    
    if (!data) {
      console.log(`[VendeurModel] Aucune donnée trouvée pour ${email}`);
      return false;
    }
    
    console.log(`[VendeurModel] Code en DB: "${data.code_verification}" (longueur: ${data.code_verification?.length})`);
    console.log(`[VendeurModel] Expiration: ${data.code_expiration}`);
    console.log(`[VendeurModel] Tentatives: ${data.tentatives_code}`);
    
    // Vérifier si le code est expiré (forcer UTC)
    // Ajouter 'Z' si pas présent pour forcer l'interprétation UTC
    const expirationString = data.code_expiration.endsWith('Z') ? data.code_expiration : data.code_expiration + 'Z';
    const codeExpiration = new Date(expirationString);
    const maintenant = new Date();
    
    console.log(`[VendeurModel] Expiration (ISO): ${data.code_expiration}`);
    console.log(`[VendeurModel] Expiration corrigée: ${expirationString}`);
    console.log(`[VendeurModel] Expiration (Date): ${codeExpiration.toISOString()}`);
    console.log(`[VendeurModel] Maintenant (Date): ${maintenant.toISOString()}`);
    console.log(`[VendeurModel] Temps restant (ms): ${codeExpiration.getTime() - maintenant.getTime()}`);
    
    if (codeExpiration.getTime() < maintenant.getTime()) {
      console.log(`[VendeurModel] Code expiré`);
      return false;
    }
    
    // Vérifier si le code est correct
    const codeMatch = data.code_verification === code;
    console.log(`[VendeurModel] Codes correspondent: ${codeMatch}`);
    
    if (!codeMatch) {
      console.log(`[VendeurModel] Code incorrect, incrémentation des tentatives`);
      // Incrémenter le nombre de tentatives
      await supabaseAdmin
        .from(this.TABLE_NAME)
        .update({
          tentatives_code: data.tentatives_code + 1,
          derniere_tentative: new Date().toISOString()
        })
        .eq('email', email);
      
      return false;
    }
    
    // Code correct, mettre à jour le statut du vendeur
    await supabaseAdmin
      .from(this.TABLE_NAME)
      .update({
        verification_email: true,
        statut: 'actif',
        code_verification: null,
        code_expiration: null,
        tentatives_code: 0,
        derniere_connexion: new Date().toISOString()
      })
      .eq('email', email);
    
    return true;
  }
}
