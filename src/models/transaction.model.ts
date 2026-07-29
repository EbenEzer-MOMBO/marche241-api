import { supabaseAdmin } from '../config/supabase';
import { Transaction, StatutPaiement } from '../lib/database-types';
import { logger } from '../utils/logger';

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
    limite: number = 10,
    filters?: {
      statut?: string;
      type_paiement?: string;
      recherche?: string;
      mois?: string;
    }
  ): Promise<{ transactions: Transaction[], total: number }> {
    const offset = (page - 1) * limite;

    // 1. Construire la requête de comptage
    let countQuery = supabaseAdmin
      .from('transactions')
      .select('*, commande:commande_id!inner(boutique_id)', { count: 'exact', head: true })
      .eq('commande.boutique_id', boutiqueId);

    // 2. Construire la requête de données
    let dataQuery = supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id!inner(*)
      `)
      .eq('commande.boutique_id', boutiqueId)
      .order('date_creation', { ascending: false });

    // Appliquer les filtres communs
    if (filters) {
      const { statut, type_paiement, recherche, mois } = filters;

      if (statut && statut !== 'all') {
        countQuery = countQuery.eq('statut', statut);
        dataQuery = dataQuery.eq('statut', statut);
      }

      if (type_paiement && type_paiement !== 'all') {
        countQuery = countQuery.eq('type_paiement', type_paiement);
        dataQuery = dataQuery.eq('type_paiement', type_paiement);
      }

      if (recherche) {
        const searchFilter = `reference_transaction.ilike.%${recherche}%,numero_telephone.ilike.%${recherche}%,reference_operateur.ilike.%${recherche}%`;
        countQuery = countQuery.or(searchFilter);
        dataQuery = dataQuery.or(searchFilter);
      }

      if (mois) {
        const [yearStr, monthStr] = mois.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const endOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

        countQuery = countQuery.gte('date_creation', startOfMonth.toISOString()).lt('date_creation', endOfMonth.toISOString());
        dataQuery = dataQuery.gte('date_creation', startOfMonth.toISOString()).lt('date_creation', endOfMonth.toISOString());
      }
    }

    // Exécuter le comptage
    const { count, error: countError } = await countQuery;

    if (countError) {
      throw new Error(`Erreur lors du comptage des transactions: ${countError.message}`);
    }

    // Exécuter la récupération avec pagination
    const { data, error } = await dataQuery.range(offset, offset + limite - 1);

    if (error) {
      throw new Error(`Erreur lors de la récupération des transactions: ${error.message}`);
    }

    return {
      transactions: data || [],
      total: count || 0
    };
  }

  /**
   * Récupère toutes les transactions liées aux commandes d'une boutique sans pagination pour l'exportation
   * @param boutiqueId ID de la boutique
   * @param filters Filtres appliqués
   */
  static async getTransactionsForExport(
    boutiqueId: number,
    filters?: {
      statut?: string;
      type_paiement?: string;
      recherche?: string;
      mois?: string;
    }
  ): Promise<Transaction[]> {
    let dataQuery = supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id!inner(*)
      `)
      .eq('commande.boutique_id', boutiqueId)
      .order('date_creation', { ascending: false });

    // Appliquer les filtres communs
    if (filters) {
      const { statut, type_paiement, recherche, mois } = filters;

      if (statut && statut !== 'all') {
        dataQuery = dataQuery.eq('statut', statut);
      }

      if (type_paiement && type_paiement !== 'all') {
        dataQuery = dataQuery.eq('type_paiement', type_paiement);
      }

      if (recherche) {
        const searchFilter = `reference_transaction.ilike.%${recherche}%,numero_telephone.ilike.%${recherche}%,reference_operateur.ilike.%${recherche}%`;
        dataQuery = dataQuery.or(searchFilter);
      }

      if (mois) {
        const [yearStr, monthStr] = mois.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const endOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

        dataQuery = dataQuery.gte('date_creation', startOfMonth.toISOString()).lt('date_creation', endOfMonth.toISOString());
      }
    }

    // Exécuter la récupération
    const { data, error } = await dataQuery;

    if (error) {
      throw new Error(`Erreur lors de la récupération des transactions pour export: ${error.message}`);
    }

    return data || [];
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
          return null;
        }
        logger.error(`[TransactionModel] Erreur recherche reference_operateur:`, error.message);
        throw new Error(`Erreur lors de la récupération de la transaction: ${error.message}`);
      }

      return data;
    } catch (error) {
      logger.error(`[TransactionModel] Exception dans findByReferenceOperateur:`, error);
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

  /**
   * Récupère les transactions encore en_attente au-delà du délai de réconciliation.
   */
  static async getStalePendingTransactions(timeoutMinutes: number): Promise<Transaction[]> {
    const threshold = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        commande:commande_id(
          id,
          numero_commande,
          statut,
          client_nom,
          client_telephone,
          client_adresse,
          client_ville,
          client_commune
        )
      `)
      .eq('statut', 'en_attente')
      .lt('date_creation', threshold)
      .not('reference_operateur', 'is', null);

    if (error) {
      throw new Error(`Erreur lors de la récupération des transactions à réconcilier: ${error.message}`);
    }

    return (data || []) as Transaction[];
  }

  /**
   * Marque une transaction en échec et annule la commande associée si encore en_attente.
   * Sans notification WhatsApp d'annulation (gérée séparément via tentative_de_paiement_echouee).
   */
  static async markTransactionAsFailed(
    transactionId: number,
    commandeId: number | null | undefined,
    note: string
  ): Promise<Transaction | null> {
    const { data: transactionUpdated, error: updateError } = await supabaseAdmin
      .from('transactions')
      .update({
        statut: 'echec' as StatutPaiement,
        notes: note,
        date_modification: new Date()
      })
      .eq('id', transactionId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Erreur mise à jour transaction ${transactionId}: ${updateError.message}`);
    }

    if (commandeId) {
      const { error: commandeError } = await supabaseAdmin
        .from('commandes')
        .update({
          statut: 'annulee',
          date_modification: new Date()
        })
        .eq('id', commandeId)
        .eq('statut', 'en_attente');

      if (commandeError) {
        console.error(
          `[TransactionModel] Erreur annulation commande ${commandeId} après échec paiement:`,
          commandeError
        );
      }
    }

    return transactionUpdated as Transaction;
  }

  /**
   * @deprecated Utiliser PaiementController.reconcileStalePayments (réconciliation Ebilling).
   * Conservé pour compatibilité : délègue à la réconciliation via CronService.
   */
  static async expirerTransactionsEnAttente(): Promise<{ count: number; transactions: Transaction[] }> {
    console.warn(
      '[TransactionModel] expirerTransactionsEnAttente est déprécié — utiliser la réconciliation Ebilling'
    );
    return { count: 0, transactions: [] };
  }
}
