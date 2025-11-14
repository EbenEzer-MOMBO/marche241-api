import { supabaseAdmin } from '../config/supabase';
import { Transaction, StatutPaiement } from '../lib/database-types';

export class TransactionModel {
  /**
   * Récupère toutes les transactions
   * @param page Numéro de la page
   * @param limite Nombre d'éléments par page
   */
  static async getAllTransactions(page: number = 1, limite: number = 10): Promise<{ transactions: Transaction[], total: number }> {
    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;
    
    // Récupérer le nombre total de transactions
    const { count, error: countError } = await supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      throw new Error(`Erreur lors du comptage des transactions: ${countError.message}`);
    }
    
    // Récupérer les transactions avec pagination
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id(*)
      `)
      .order('date_creation', { ascending: false })
      .range(offset, offset + limite - 1);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des transactions: ${error.message}`);
    }
    
    return {
      transactions: data || [],
      total: count || 0
    };
  }

  /**
   * Récupère les transactions d'une commande
   * @param commandeId ID de la commande
   */
  static async getTransactionsByCommandeId(commandeId: number): Promise<Transaction[]> {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id(*)
      `)
      .eq('commande_id', commandeId)
      .order('date_creation', { ascending: false });
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des transactions de la commande: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère les transactions liées aux commandes d'une boutique avec pagination
   * @param boutiqueId ID de la boutique
   * @param page Numéro de la page
   * @param limite Nombre d'éléments par page
   */
  static async getTransactionsByBoutiqueId(
    boutiqueId: number, 
    page: number = 1, 
    limite: number = 10
  ): Promise<{ transactions: Transaction[], total: number }> {
    const offset = (page - 1) * limite;
    
    // Compter le nombre total de transactions pour cette boutique
    const { count, error: countError } = await supabaseAdmin
      .from('transactions')
      .select('*, commande:commande_id!inner(boutique_id)', { count: 'exact', head: true })
      .eq('commande.boutique_id', boutiqueId);
    
    if (countError) {
      throw new Error(`Erreur lors du comptage des transactions: ${countError.message}`);
    }
    
    // Récupérer les transactions avec les informations de la commande
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id!inner(*)
      `)
      .eq('commande.boutique_id', boutiqueId)
      .order('date_creation', { ascending: false })
      .range(offset, offset + limite - 1);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des transactions: ${error.message}`);
    }
    
    return {
      transactions: data || [],
      total: count || 0
    };
  }

  /**
   * Récupère une transaction par son ID
   * @param id ID de la transaction
   */
  static async getTransactionById(id: number): Promise<Transaction | null> {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id(*)
      `)
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération de la transaction: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère une transaction par sa référence
   * @param reference Référence unique de la transaction
   */
  static async getTransactionByReference(reference: string): Promise<Transaction | null> {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id(*)
      `)
      .eq('reference_transaction', reference)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération de la transaction: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère une transaction par sa référence opérateur (bill_id)
   * @param referenceOperateur Référence fournie par l'opérateur
   */
  static async findByReferenceOperateur(referenceOperateur: string): Promise<Transaction | null> {
    console.log(`[TransactionModel] Recherche de transaction avec reference_operateur: ${referenceOperateur}`);
    
    try {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select(`
          *,
          commande:commande_id(*)
        `)
        .eq('reference_operateur', referenceOperateur)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // PGRST116 signifie "Aucun résultat trouvé"
          console.log(`[TransactionModel] Aucune transaction trouvée avec reference_operateur: ${referenceOperateur}`);
          return null;
        } else {
          console.error(`[TransactionModel] Erreur lors de la recherche de transaction:`, error);
          throw new Error(`Erreur lors de la récupération de la transaction: ${error.message}`);
        }
      }
      
      if (data) {
        console.log(`[TransactionModel] Transaction trouvée avec ID: ${data.id}, commande_id: ${data.commande_id}`);
      } else {
        console.log(`[TransactionModel] Aucune transaction trouvée avec reference_operateur: ${referenceOperateur}`);
      }
      
      return data;
    } catch (error) {
      console.error(`[TransactionModel] Exception dans findByReferenceOperateur:`, error);
      throw error;
    }
  }

  /**
   * Crée une nouvelle transaction
   * @param transaction Données de la transaction à créer
   */
  static async createTransaction(transaction: Omit<Transaction, 'id' | 'date_creation' | 'date_modification'>): Promise<Transaction> {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert([transaction])
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la création de la transaction: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Met à jour le statut d'une transaction
   * @param id ID de la transaction
   * @param statut Nouveau statut
   * @param referenceOperateur Référence fournie par l'opérateur (optionnel)
   * @param notes Notes internes (optionnel)
   */
  static async updateTransactionStatus(
    id: number, 
    statut: StatutPaiement, 
    referenceOperateur?: string, 
    notes?: string
  ): Promise<Transaction> {
    const updateData: any = { 
      statut,
      date_modification: new Date()
    };
    
    // Ajouter la date de confirmation si le statut est "payé"
    if (statut === 'paye') {
      updateData.date_confirmation = new Date();
    }
    
    // Ajouter la référence opérateur si fournie
    if (referenceOperateur) {
      updateData.reference_operateur = referenceOperateur;
    }
    
    // Ajouter les notes si fournies
    if (notes) {
      updateData.notes = notes;
    }
    
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour du statut de la transaction: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Met à jour une transaction existante
   * @param id ID de la transaction
   * @param transaction Données à mettre à jour
   */
  static async updateTransaction(
    id: number, 
    transaction: Partial<Omit<Transaction, 'id' | 'date_creation' | 'date_modification'>>
  ): Promise<Transaction> {
    // Filtrer les valeurs vides et undefined pour éviter les erreurs d'enum
    const cleanedTransaction: any = {};
    
    for (const [key, value] of Object.entries(transaction)) {
      // Ne garder que les valeurs non vides
      if (value !== '' && value !== null && value !== undefined) {
        cleanedTransaction[key] = value;
      }
    }
    
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({
        ...cleanedTransaction,
        date_modification: new Date()
      })
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour de la transaction: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère les statistiques des transactions
   * @param startDate Date de début (optionnel)
   * @param endDate Date de fin (optionnel)
   */
  static async getTransactionStats(startDate?: Date, endDate?: Date): Promise<any> {
    // Construire la requête de base
    let query = supabaseAdmin
      .from('transactions')
      .select('statut, methode_paiement, montant');
    
    // Ajouter les filtres de date si spécifiés
    if (startDate) {
      query = query.gte('date_creation', startDate.toISOString());
    }
    
    if (endDate) {
      query = query.lte('date_creation', endDate.toISOString());
    }
    
    // Exécuter la requête
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des statistiques de transactions: ${error.message}`);
    }
    
    // Calculer les statistiques
    const stats = {
      total: data.length,
      totalAmount: data.reduce((sum, t) => sum + t.montant, 0),
      byStatus: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
      successRate: 0
    };
    
    // Compter par statut
    data.forEach(t => {
      const statut = t.statut as string;
      const methode = t.methode_paiement as string;
      
      if (!stats.byStatus[statut]) {
        stats.byStatus[statut] = 0;
      }
      stats.byStatus[statut]++;
      
      if (!stats.byMethod[methode]) {
        stats.byMethod[methode] = 0;
      }
      stats.byMethod[methode]++;
    });
    
    // Calculer le taux de réussite
    const payeStatus = 'processed';
    const successCount = stats.byStatus[payeStatus] || 0;
    stats.successRate = stats.total > 0 ? (successCount / stats.total) * 100 : 0;
    
    return stats;
  }
}
