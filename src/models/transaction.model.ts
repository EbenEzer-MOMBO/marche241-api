import { query, withTransaction } from '../config/database';
import { Transaction, StatutPaiement } from '../lib/database-types';

/**
 * Colonnes modifiables via les méthodes de création et de mise à jour.
 * Les noms de colonnes étant interpolés dans le SQL, ils sont valides
 * uniquement s'ils proviennent de cette liste.
 */
const COLONNES_AUTORISEES = [
  'commande_id',
  'boost_id',
  'reference_transaction',
  'montant',
  'methode_paiement',
  'statut',
  'numero_telephone',
  'reference_operateur',
  'date_confirmation',
  'notes',
  'type_paiement',
  'description'
] as const;

/** Colonnes dont le type est un enum et qui nécessitent un cast explicite */
const COLONNES_ENUM: Record<string, string> = {
  statut: 'statut_paiement',
  methode_paiement: 'methode_paiement'
};

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) =>
    (COLONNES_AUTORISEES as readonly string[]).includes(colonne)
  );

/**
 * Construit le placeholder d'une colonne, en ajoutant le cast d'enum requis.
 * @param colonne Nom de la colonne
 * @param position Position du paramètre dans la requête
 */
const placeholder = (colonne: string, position: number): string =>
  COLONNES_ENUM[colonne] ? `$${position}::${COLONNES_ENUM[colonne]}` : `$${position}`;

/**
 * Jointure de la commande associée, sous forme d'objet JSON.
 * Reproduit la relation `commande:commande_id(*)` de l'ancien client.
 */
const JOINTURE_COMMANDE = `(SELECT row_to_json(c) FROM commandes c WHERE c.id = t.commande_id) AS commande`;

/**
 * Filtres applicables aux transactions d'une boutique.
 */
interface FiltresTransaction {
  statut?: string;
  type_paiement?: string;
  recherche?: string;
  mois?: string;
}

/**
 * Construit les conditions SQL correspondant aux filtres fournis.
 * @param filters Filtres éventuels
 * @param params Tableau de paramètres, complété au fil de la construction
 */
const construireFiltres = (
  filters: FiltresTransaction | undefined,
  params: unknown[]
): string => {
  if (!filters) {
    return '';
  }

  const conditions: string[] = [];
  const { statut, type_paiement, recherche, mois } = filters;

  if (statut && statut !== 'all') {
    params.push(statut);
    conditions.push(`t.statut = $${params.length}::statut_paiement`);
  }

  if (type_paiement && type_paiement !== 'all') {
    params.push(type_paiement);
    conditions.push(`t.type_paiement = $${params.length}`);
  }

  if (recherche) {
    // Le terme est passé en paramètre : les caractères spéciaux de LIKE
    // sont échappés pour rester littéraux
    params.push(`%${recherche.replace(/[\\%_]/g, '\\$&')}%`);
    const motif = `$${params.length}`;
    conditions.push(
      `(t.reference_transaction ILIKE ${motif} OR t.numero_telephone ILIKE ${motif} OR t.reference_operateur ILIKE ${motif})`
    );
  }

  if (mois) {
    const [yearStr, monthStr] = mois.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));

    params.push(startOfMonth, endOfMonth);
    conditions.push(`t.date_creation >= $${params.length - 1} AND t.date_creation < $${params.length}`);
  }

  return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
};

export class TransactionModel {
  /**
   * Récupère toutes les transactions avec pagination
   * @param page Numéro de la page
   * @param limite Nombre d'éléments par page
   */
  static async getAllTransactions(page: number = 1, limite: number = 10): Promise<{ transactions: Transaction[], total: number }> {
    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;

    const { rows: total } = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM transactions`);

    const { rows } = await query<Transaction>(
      `SELECT t.*, ${JOINTURE_COMMANDE}
       FROM transactions t
       ORDER BY t.date_creation DESC
       LIMIT $1 OFFSET $2`,
      [limite, offset]
    );

    return {
      transactions: rows,
      total: Number(total[0].count)
    };
  }

  /**
   * Récupère les transactions d'une commande
   * @param commandeId ID de la commande
   */
  static async getTransactionsByCommandeId(commandeId: number): Promise<Transaction[]> {
    const { rows } = await query<Transaction>(
      `SELECT t.*, ${JOINTURE_COMMANDE}
       FROM transactions t
       WHERE t.commande_id = $1
       ORDER BY t.date_creation DESC`,
      [commandeId]
    );

    return rows;
  }

  /**
   * Récupère les transactions liées aux commandes d'une boutique avec pagination
   * @param boutiqueId ID de la boutique
   * @param page Numéro de la page
   * @param limite Nombre d'éléments par page
   * @param filters Filtres appliqués
   */
  static async getTransactionsByBoutiqueId(
    boutiqueId: number,
    page: number = 1,
    limite: number = 10,
    filters?: FiltresTransaction
  ): Promise<{ transactions: Transaction[], total: number }> {
    const offset = (page - 1) * limite;

    const paramsCount: unknown[] = [boutiqueId];
    const conditions = construireFiltres(filters, paramsCount);

    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM transactions t
       JOIN commandes c ON c.id = t.commande_id
       WHERE c.boutique_id = $1 ${conditions}`,
      paramsCount
    );

    const paramsData: unknown[] = [boutiqueId];
    const conditionsData = construireFiltres(filters, paramsData);
    paramsData.push(limite, offset);

    const { rows } = await query<Transaction>(
      `SELECT t.*, row_to_json(c) AS commande
       FROM transactions t
       JOIN commandes c ON c.id = t.commande_id
       WHERE c.boutique_id = $1 ${conditionsData}
       ORDER BY t.date_creation DESC
       LIMIT $${paramsData.length - 1} OFFSET $${paramsData.length}`,
      paramsData
    );

    return {
      transactions: rows,
      total: Number(total[0].count)
    };
  }

  /**
   * Récupère toutes les transactions liées aux commandes d'une boutique sans pagination pour l'exportation
   * @param boutiqueId ID de la boutique
   * @param filters Filtres appliqués
   */
  static async getTransactionsForExport(
    boutiqueId: number,
    filters?: FiltresTransaction
  ): Promise<Transaction[]> {
    const params: unknown[] = [boutiqueId];
    const conditions = construireFiltres(filters, params);

    const { rows } = await query<Transaction>(
      `SELECT t.*, row_to_json(c) AS commande
       FROM transactions t
       JOIN commandes c ON c.id = t.commande_id
       WHERE c.boutique_id = $1 ${conditions}
       ORDER BY t.date_creation DESC`,
      params
    );

    return rows;
  }

  /**
   * Récupère une transaction par son ID
   * @param id ID de la transaction
   */
  static async getTransactionById(id: number): Promise<Transaction | null> {
    const { rows } = await query<Transaction>(
      `SELECT t.*, ${JOINTURE_COMMANDE} FROM transactions t WHERE t.id = $1`,
      [id]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère une transaction par sa référence
   * @param reference Référence de la transaction
   */
  static async getTransactionByReference(reference: string): Promise<Transaction | null> {
    const { rows } = await query<Transaction>(
      `SELECT t.*, ${JOINTURE_COMMANDE} FROM transactions t WHERE t.reference_transaction = $1`,
      [reference]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère une transaction par la référence fournie par l'opérateur
   * @param referenceOperateur Référence de l'opérateur
   */
  static async findByReferenceOperateur(referenceOperateur: string): Promise<Transaction | null> {
    const { rows } = await query<Transaction>(
      `SELECT t.*, ${JOINTURE_COMMANDE} FROM transactions t WHERE t.reference_operateur = $1`,
      [referenceOperateur]
    );

    return rows[0] ?? null;
  }

  /**
   * Crée une nouvelle transaction
   * @param transaction Données de la transaction
   */
  static async createTransaction(transaction: Omit<Transaction, 'id' | 'date_creation' | 'date_modification'>): Promise<Transaction> {
    const champs = filtrerColonnes(transaction as Record<string, unknown>);

    if (champs.length === 0) {
      throw new Error('Erreur lors de la création de la transaction: aucune donnée fournie');
    }

    const colonnes = champs.map(([colonne]) => colonne);
    const placeholders = champs.map(([colonne], i) => placeholder(colonne, i + 1));

    const { rows } = await query<Transaction>(
      `INSERT INTO transactions (${colonnes.join(', ')}, date_creation, date_modification)
       VALUES (${placeholders.join(', ')}, NOW(), NOW())
       RETURNING *`,
      champs.map(([, valeur]) => valeur)
    );

    return rows[0];
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
    const affectations = ['statut = $1::statut_paiement', 'date_modification = NOW()'];
    const params: unknown[] = [statut];

    // Ajouter la date de confirmation si le statut est "payé"
    if (statut === 'paye') {
      affectations.push('date_confirmation = NOW()');
    }

    // Ajouter la référence opérateur si fournie
    if (referenceOperateur) {
      params.push(referenceOperateur);
      affectations.push(`reference_operateur = $${params.length}`);
    }

    // Ajouter les notes si fournies
    if (notes) {
      params.push(notes);
      affectations.push(`notes = $${params.length}`);
    }

    params.push(id);

    const { rows } = await query<Transaction>(
      `UPDATE transactions SET ${affectations.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour du statut de la transaction: transaction introuvable');
    }

    return rows[0];
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
    const champs = filtrerColonnes(transaction as Record<string, unknown>)
      .filter(([, valeur]) => valeur !== '' && valeur !== null && valeur !== undefined);

    if (champs.length === 0) {
      const { rows } = await query<Transaction>(
        `UPDATE transactions SET date_modification = NOW() WHERE id = $1 RETURNING *`,
        [id]
      );

      if (!rows[0]) {
        throw new Error('Erreur lors de la mise à jour de la transaction: transaction introuvable');
      }

      return rows[0];
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = ${placeholder(colonne, i + 1)}`);

    const { rows } = await query<Transaction>(
      `UPDATE transactions SET ${affectations.join(', ')}, date_modification = NOW()
       WHERE id = $${champs.length + 1}
       RETURNING *`,
      [...champs.map(([, valeur]) => valeur), id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour de la transaction: transaction introuvable');
    }

    return rows[0];
  }

  /**
   * Récupère les statistiques des transactions
   * @param startDate Date de début (optionnel)
   * @param endDate Date de fin (optionnel)
   */
  static async getTransactionStats(startDate?: Date, endDate?: Date): Promise<{
    total: number;
    totalAmount: number;
    byStatus: Record<string, number>;
    byMethod: Record<string, number>;
    successRate: number;
  }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    // Ajouter les filtres de date si spécifiés
    if (startDate) {
      params.push(startDate);
      conditions.push(`date_creation >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`date_creation <= $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Les agrégats sont calculés par la base plutôt que ligne à ligne
    const { rows } = await query<{ statut: string; methode_paiement: string; n: string; montant: string }>(
      `SELECT statut::text AS statut, methode_paiement::text AS methode_paiement,
              COUNT(*) AS n, COALESCE(SUM(montant), 0) AS montant
       FROM transactions ${where}
       GROUP BY statut, methode_paiement`,
      params
    );

    const stats = {
      total: 0,
      totalAmount: 0,
      byStatus: {} as Record<string, number>,
      byMethod: {} as Record<string, number>,
      successRate: 0
    };

    for (const ligne of rows) {
      const n = Number(ligne.n);
      stats.total += n;
      stats.totalAmount += Number(ligne.montant);
      stats.byStatus[ligne.statut] = (stats.byStatus[ligne.statut] || 0) + n;
      stats.byMethod[ligne.methode_paiement] = (stats.byMethod[ligne.methode_paiement] || 0) + n;
    }

    // Calculer le taux de réussite
    // NOTE : ce statut ne fait pas partie de l'enum `statut_paiement`
    // (en_attente, paye, echec, rembourse, partiellement_paye). Le taux vaut
    // donc toujours 0. Comportement conservé tel quel lors de la migration.
    const payeStatus = 'processed';
    const successCount = stats.byStatus[payeStatus] || 0;
    stats.successRate = stats.total > 0 ? (successCount / stats.total) * 100 : 0;

    return stats;
  }

  /**
   * Récupère les transactions encore en_attente au-delà du délai de réconciliation.
   */
  static async getStalePendingTransactions(timeoutMinutes: number): Promise<Transaction[]> {
    const { rows } = await query<Transaction>(
      `SELECT t.*,
              (SELECT row_to_json(x) FROM (
                 SELECT c.id, c.numero_commande, c.statut, c.client_nom, c.client_telephone,
                        c.client_adresse, c.client_ville, c.client_commune
                 FROM commandes c WHERE c.id = t.commande_id
               ) x) AS commande
       FROM transactions t
       WHERE t.statut = 'en_attente'
         AND t.date_creation < NOW() - ($1 || ' minutes')::interval
         AND t.reference_operateur IS NOT NULL`,
      [String(timeoutMinutes)]
    );

    return rows;
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
    // Les deux mises à jour sont liées : elles doivent aboutir ensemble
    return withTransaction(async (client) => {
      const { rows } = await client.query<Transaction>(
        `UPDATE transactions
         SET statut = 'echec'::statut_paiement, notes = $1, date_modification = NOW()
         WHERE id = $2
         RETURNING *`,
        [note, transactionId]
      );

      if (!rows[0]) {
        throw new Error(`Erreur mise à jour transaction ${transactionId}: transaction introuvable`);
      }

      if (commandeId) {
        await client.query(
          `UPDATE commandes
           SET statut = 'annulee'::statut_commande, date_modification = NOW()
           WHERE id = $1 AND statut = 'en_attente'::statut_commande`,
          [commandeId]
        );
      }

      return rows[0];
    });
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
