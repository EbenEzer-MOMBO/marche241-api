import { PoolClient, QueryResultRow } from 'pg';
import { query, withTransaction } from '../config/database';
import { Commande, CommandeArticle, StatutCommande, StatutPaiement } from '../lib/database-types';
import { ProduitModel } from './produit.model';
import { logger } from '../utils/logger';

/**
 * Exécute une requête sur la transaction en cours si un client est fourni,
 * sinon sur le pool. Permet aux méthodes de participer à une transaction
 * ouverte par l'appelant sans dupliquer leur code.
 * @param client Client de transaction, ou undefined pour utiliser le pool
 */
const executer = <T extends QueryResultRow>(
  client: PoolClient | undefined,
  text: string,
  params: unknown[] = []
): Promise<{ rows: T[] }> =>
  client ? client.query<T>(text, params) : query<T>(text, params);

/**
 * Colonnes modifiables lors de la création d'une commande.
 * Les noms de colonnes étant interpolés dans le SQL, ils sont valides
 * uniquement s'ils proviennent de cette liste.
 */
const COLONNES_COMMANDE = [
  'numero_commande',
  'boutique_id',
  'client_nom',
  'client_telephone',
  'client_adresse',
  'client_ville',
  'client_commune',
  'client_instructions',
  'sous_total',
  'frais_livraison',
  'taxes',
  'remise',
  'total',
  'statut',
  'statut_paiement',
  'methode_paiement',
  'montant_paye'
] as const;

/** Colonnes de type enum, nécessitant un cast explicite */
const COLONNES_ENUM: Record<string, string> = {
  statut: 'statut_commande',
  statut_paiement: 'statut_paiement',
  methode_paiement: 'methode_paiement'
};

/**
 * Jointures complètes d'une commande : boutique, articles et transactions.
 * Reproduit les relations imbriquées de l'ancien client.
 */
const JOINTURES_COMMANDE = `
  (SELECT row_to_json(b) FROM boutiques b WHERE b.id = c.boutique_id) AS boutique,
  (SELECT COALESCE(json_agg(a), '[]'::json) FROM commande_articles a WHERE a.commande_id = c.id) AS articles,
  (SELECT COALESCE(json_agg(t), '[]'::json) FROM transactions t WHERE t.commande_id = c.id) AS transactions`;

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) =>
    (COLONNES_COMMANDE as readonly string[]).includes(colonne)
  );

/**
 * Construit le placeholder d'une colonne, avec le cast d'enum requis.
 * @param colonne Nom de la colonne
 * @param position Position du paramètre dans la requête
 */
const placeholder = (colonne: string, position: number): string =>
  COLONNES_ENUM[colonne] ? `$${position}::${COLONNES_ENUM[colonne]}` : `$${position}`;

export class CommandeModel {
  /**
   * Génère un numéro de commande unique
   * Format: COM-YYYY-MMXXXX (où MM est le mois en cours et XXXX est un numéro séquentiel)
   * @param client Client de transaction, pour lire dans la même transaction que l'insertion
   */
  static async generateNumeroCommande(client?: PoolClient): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Mois sur 2 chiffres (01-12)

    // Récupérer le dernier numéro de commande du mois en cours
    const prefix = `COM-${year}-${month}`;

    try {
      // Rechercher la dernière commande avec ce préfixe
      const { rows } = await executer<{ numero_commande: string }>(
        client,
        `SELECT numero_commande FROM commandes
         WHERE numero_commande LIKE $1
         ORDER BY numero_commande DESC
         LIMIT 1`,
        [`${prefix}%`]
      );

      let sequentialNumber = 1;

      if (rows[0]?.numero_commande) {
        // Extraire le numéro séquentiel de la dernière commande
        const lastNumber = parseInt(rows[0].numero_commande.substring(prefix.length), 10);
        if (!isNaN(lastNumber)) {
          sequentialNumber = lastNumber + 1;
        }
      }

      // Formater le numéro séquentiel sur 4 chiffres
      const formattedNumber = sequentialNumber.toString().padStart(4, '0');

      return `${prefix}${formattedNumber}`;
    } catch (error) {
      logger.error('[CommandeModel] Erreur lors de la génération du numéro de commande:', error);
      // En cas d'erreur, utiliser un numéro aléatoire comme fallback
      const randomNum = Math.floor(1000 + Math.random() * 9000); // Nombre aléatoire à 4 chiffres

      return `${prefix}${randomNum.toString().padStart(4, '0')}`;
    }
  }

  /**
   * Crée une nouvelle commande
   * @param commande Données de la commande
   * @param client Client de transaction, si la création participe à une transaction
   */
  static async createCommande(
    commande: Omit<Commande, 'id' | 'date_commande' | 'date_modification'>,
    client?: PoolClient
  ): Promise<Commande> {
    logger.debug('[CommandeModel] Début de createCommande');

    try {
      // Générer un numéro de commande si non fourni
      if (!commande.numero_commande) {
        commande.numero_commande = await this.generateNumeroCommande(client);
        logger.debug('[CommandeModel] Numéro de commande généré:', commande.numero_commande);
      }

      const champs = filtrerColonnes(commande as Record<string, unknown>);

      if (champs.length === 0) {
        throw new Error('Erreur lors de la création de la commande: aucune donnée fournie');
      }

      const colonnes = champs.map(([colonne]) => colonne);
      const placeholders = champs.map(([colonne], i) => placeholder(colonne, i + 1));

      const { rows } = await executer<Commande>(
        client,
        `INSERT INTO commandes (${colonnes.join(', ')}, date_commande, date_modification)
         VALUES (${placeholders.join(', ')}, NOW(), NOW())
         RETURNING *`,
        champs.map(([, valeur]) => valeur)
      );

      logger.debug('[CommandeModel] Commande créée avec succès, ID:', rows[0].id);

      return rows[0];
    } catch (error) {
      logger.error('[CommandeModel] Exception dans createCommande:', error);
      throw error;
    }
  }

  /**
   * Ajoute un article à une commande
   * @param article Données de l'article
   * @param client Client de transaction, si l'ajout participe à une transaction
   */
  static async addArticleToCommande(
    article: Omit<CommandeArticle, 'id'>,
    client?: PoolClient
  ): Promise<CommandeArticle> {
    logger.debug('[CommandeModel] Début de addArticleToCommande');

    try {
      const { rows } = await executer<CommandeArticle>(
        client,
        `INSERT INTO commande_articles
           (commande_id, produit_id, nom_produit, prix_unitaire, quantite, variants_selectionnes, sous_total)
         VALUES ($1, $2, $3, $4, $5, $6::json, $7)
         RETURNING *`,
        [
          article.commande_id,
          article.produit_id,
          article.nom_produit,
          article.prix_unitaire,
          article.quantite,
          article.variants_selectionnes ? JSON.stringify(article.variants_selectionnes) : null,
          article.sous_total
        ]
      );

      logger.debug('[CommandeModel] Article ajouté avec succès, ID:', rows[0].id);

      return rows[0];
    } catch (error) {
      logger.error('[CommandeModel] Exception dans addArticleToCommande:', error);
      throw error;
    }
  }

  /**
   * Crée une commande et ses articles, puis met à jour ses totaux, de façon
   * atomique : un échec à n'importe quelle étape annule l'ensemble, ce qui
   * évite les commandes sans articles ou aux totaux incohérents.
   * @param commande Données de la commande
   * @param articles Articles à rattacher à la commande
   */
  static async createCommandeAvecArticles(
    commande: Omit<Commande, 'id' | 'date_commande' | 'date_modification'>,
    articles: Array<Omit<CommandeArticle, 'id' | 'commande_id'>>
  ): Promise<Commande> {
    return withTransaction(async (client) => {
      const commandeCreee = await this.createCommande(commande, client);

      for (const article of articles) {
        await this.addArticleToCommande(
          { ...article, commande_id: commandeCreee.id } as Omit<CommandeArticle, 'id'>,
          client
        );
      }

      return this.updateCommandeTotals(commandeCreee.id, client);
    });
  }

  /**
   * Met à jour le stock des produits d'une commande en tenant compte des variants
   * @param commandeId ID de la commande
   * @param increment Si true, incrémente le stock (annulation), sinon décrémente (confirmation)
   */
  static async updateProductsStock(commandeId: number, increment: boolean = false): Promise<void> {
    logger.debug(`[CommandeModel] Mise à jour du stock pour la commande ${commandeId}, increment: ${increment}`);

    try {
      // Récupérer les articles de la commande avec les variants sélectionnés
      const { rows: articles } = await query<CommandeArticle>(
        `SELECT * FROM commande_articles WHERE commande_id = $1`,
        [commandeId]
      );

      if (articles.length === 0) {
        logger.debug(`[CommandeModel] Aucun article trouvé pour la commande ${commandeId}`);

        return;
      }

      // Mettre à jour le stock de chaque produit
      for (const article of articles) {
        const quantite = increment ? -article.quantite : article.quantite;

        // Si l'article a des variants sélectionnés, mettre à jour le stock du variant
        if (article.variants_selectionnes && Object.keys(article.variants_selectionnes).length > 0) {
          logger.debug(`[CommandeModel] Mise à jour du stock avec variants pour produit ${article.produit_id}`);
          await ProduitModel.updateStockWithVariants(article.produit_id, quantite, article.variants_selectionnes);
        } else {
          // Sinon, mettre à jour le stock global
          logger.debug(`[CommandeModel] Mise à jour du stock global pour produit ${article.produit_id}`);
          await ProduitModel.updateStock(article.produit_id, quantite);
        }
      }

      logger.debug(`[CommandeModel] Stock mis à jour pour tous les produits de la commande ${commandeId}`);
    } catch (error) {
      logger.error('[CommandeModel] Exception dans updateProductsStock:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut d'une commande
   * @param id ID de la commande
   * @param statut Nouveau statut
   */
  static async updateCommandeStatus(id: number, statut: StatutCommande): Promise<Commande> {
    logger.debug(`[CommandeModel] Mise à jour du statut de la commande ${id} vers ${statut}`);

    try {
      // Récupérer le statut actuel de la commande
      const { rows: actuelles } = await query<{ statut: StatutCommande }>(
        `SELECT statut FROM commandes WHERE id = $1`,
        [id]
      );

      if (!actuelles[0]) {
        logger.error(`[CommandeModel] Commande non trouvée: ${id}`);
        throw new Error(`Commande non trouvée: ${id}`);
      }

      const statutActuel = actuelles[0].statut;
      logger.debug(`[CommandeModel] Statut actuel de la commande ${id}: ${statutActuel}`);

      // Ajouter les dates spécifiques en fonction du statut
      const affectations = ['statut = $1::statut_commande', 'date_modification = NOW()'];

      if (statut === 'confirmee') {
        affectations.push('date_confirmation = NOW()');
      } else if (statut === 'expedie') {
        affectations.push('date_expedition = NOW()');
      } else if (statut === 'livree') {
        affectations.push('date_livraison = NOW()');
      }

      // Déterminer l'ajustement de stock induit par le changement de statut
      const doitDecrementer = statut === 'confirmee' && statutActuel !== 'confirmee';
      const doitIncrementer =
        (statut === 'annulee' || statut === 'remboursee') &&
        (statutActuel === 'confirmee' || statutActuel === 'en_preparation' || statutActuel === 'expedie');

      // Le stock est ajusté avant le changement de statut : un stock
      // insuffisant interrompt l'opération sans que la commande passe en
      // « confirmée ». `updateProductsStock` s'appuie sur ProduitModel, qui
      // possède ses propres garanties d'atomicité par produit.
      if (doitDecrementer) {
        logger.debug(`[CommandeModel] Décrémentation du stock pour la commande ${id} confirmée`);
        await this.updateProductsStock(id, false); // false = décrémenter
      } else if (doitIncrementer) {
        logger.debug(`[CommandeModel] Incrémentation du stock pour la commande ${id} annulée/remboursée`);
        await this.updateProductsStock(id, true); // true = incrémenter
      }

      const { rows: misesAJour } = await query<Commande>(
        `UPDATE commandes SET ${affectations.join(', ')} WHERE id = $2 RETURNING *`,
        [statut, id]
      );
      const commande = misesAJour[0];

      // Recharger avec la boutique associée, comme le faisait la jointure d'origine
      const { rows } = await query<Commande>(
        `SELECT c.*, (SELECT row_to_json(b) FROM (
           SELECT b.id, b.nom, b.telephone, b.adresse, b.slug FROM boutiques b WHERE b.id = c.boutique_id
         ) b) AS boutique
         FROM commandes c WHERE c.id = $1`,
        [id]
      );

      logger.debug(`[CommandeModel] Statut de la commande ${id} mis à jour: ${statutActuel} -> ${statut}`);

      return rows[0] ?? commande;
    } catch (error) {
      logger.error('[CommandeModel] Exception dans updateCommandeStatus:', error);
      throw error;
    }
  }

  /**
   * Met à jour le statut de paiement d'une commande
   * @param id ID de la commande
   * @param statutPaiement Nouveau statut de paiement
   * @param methodePaiement Méthode de paiement (optionnel)
   */
  static async updatePaymentStatus(id: number, statutPaiement: StatutPaiement, methodePaiement?: string): Promise<Commande> {
    const affectations = ['statut_paiement = $1::statut_paiement', 'date_modification = NOW()'];
    const params: unknown[] = [statutPaiement];

    if (methodePaiement) {
      params.push(methodePaiement);
      affectations.push(`methode_paiement = $${params.length}::methode_paiement`);
    }

    params.push(id);

    const { rows } = await query<Commande>(
      `UPDATE commandes SET ${affectations.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour du statut de paiement: commande introuvable');
    }

    return rows[0];
  }

  /**
   * Récupère une commande par son ID
   * @param id ID de la commande
   */
  static async getCommandeById(id: number): Promise<Commande | null> {
    const { rows } = await query<Commande>(
      `SELECT c.*, ${JOINTURES_COMMANDE} FROM commandes c WHERE c.id = $1`,
      [id]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère une commande par son numéro
   * @param numeroCommande Numéro de la commande
   */
  static async getCommandeByNumero(numeroCommande: string): Promise<Commande | null> {
    const { rows } = await query<Commande>(
      `SELECT c.*, ${JOINTURES_COMMANDE} FROM commandes c WHERE c.numero_commande = $1`,
      [numeroCommande]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère les commandes d'une boutique
   * @param boutiqueId ID de la boutique
   * @param page Numéro de la page
   * @param limite Nombre d'éléments par page
   */
  static async getCommandesByBoutique(boutiqueId: number, page: number = 1, limite: number = 10): Promise<{ commandes: Commande[], total: number }> {
    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;

    // Récupérer le nombre total de commandes
    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM commandes WHERE boutique_id = $1`,
      [boutiqueId]
    );

    // Récupérer les commandes avec pagination
    const { rows } = await query<Commande>(
      `SELECT c.*, (SELECT row_to_json(b) FROM boutiques b WHERE b.id = c.boutique_id) AS boutique
       FROM commandes c
       WHERE c.boutique_id = $1
       ORDER BY c.date_commande DESC
       LIMIT $2 OFFSET $3`,
      [boutiqueId, limite, offset]
    );

    return {
      commandes: rows,
      total: Number(total[0].count)
    };
  }

  /**
   * Calcule les totaux d'une commande
   * @param commandeId ID de la commande
   * @param client Client de transaction, pour lire les articles de la transaction en cours
   */
  static async calculateCommandeTotals(
    commandeId: number,
    client?: PoolClient
  ): Promise<{ sous_total: number, total: number }> {
    logger.debug('[CommandeModel] Début de calculateCommandeTotals pour commandeId:', commandeId);

    try {
      // Le sous-total et les frais sont agrégés par la base en une requête
      const { rows } = await executer<{
        sous_total: string; frais_livraison: number; taxes: number; remise: number;
      }>(
        client,
        `SELECT
           COALESCE((SELECT SUM(prix_unitaire * quantite) FROM commande_articles WHERE commande_id = c.id), 0) AS sous_total,
           COALESCE(c.frais_livraison, 0) AS frais_livraison,
           COALESCE(c.taxes, 0) AS taxes,
           COALESCE(c.remise, 0) AS remise
         FROM commandes c WHERE c.id = $1`,
        [commandeId]
      );

      if (!rows[0]) {
        throw new Error(`Erreur lors de la récupération de la commande: commande ${commandeId} introuvable`);
      }

      const sousTotal = Number(rows[0].sous_total);
      const total = sousTotal + rows[0].frais_livraison + rows[0].taxes - rows[0].remise;

      logger.debug('[CommandeModel] Totaux calculés:', { sousTotal, total });

      return { sous_total: sousTotal, total };
    } catch (error) {
      logger.error('[CommandeModel] Exception dans calculateCommandeTotals:', error);
      throw error;
    }
  }

  /**
   * Met à jour les totaux d'une commande
   * @param commandeId ID de la commande
   * @param client Client de transaction, si la mise à jour participe à une transaction
   */
  static async updateCommandeTotals(commandeId: number, client?: PoolClient): Promise<Commande> {
    logger.debug('[CommandeModel] Début de updateCommandeTotals pour commandeId:', commandeId);

    try {
      // Calculer les totaux
      const { sous_total, total } = await this.calculateCommandeTotals(commandeId, client);

      // Mettre à jour la commande
      const { rows } = await executer<Commande>(
        client,
        `UPDATE commandes SET sous_total = $1, total = $2, date_modification = NOW()
         WHERE id = $3
         RETURNING *`,
        [sous_total, total, commandeId]
      );

      if (!rows[0]) {
        throw new Error(`Erreur lors de la mise à jour des totaux: commande ${commandeId} introuvable`);
      }

      logger.debug('[CommandeModel] Commande mise à jour avec succès');

      return rows[0];
    } catch (error) {
      logger.error('[CommandeModel] Exception dans updateCommandeTotals:', error);
      throw error;
    }
  }

  /**
   * Récupère les détails des produits d'une commande avec leurs informations complètes
   * @param commandeId ID de la commande
   */
  static async getCommandeArticlesDetails(commandeId: number): Promise<any[]> {
    logger.debug('[CommandeModel] Récupération des détails des articles pour la commande:', commandeId);

    try {
      const { rows } = await query<CommandeArticle>(
        `SELECT a.*, (SELECT row_to_json(p) FROM produits p WHERE p.id = a.produit_id) AS produit
         FROM commande_articles a
         WHERE a.commande_id = $1`,
        [commandeId]
      );

      logger.debug(`[CommandeModel] ${rows.length} articles trouvés`);

      return rows;
    } catch (error) {
      logger.error('[CommandeModel] Exception dans getCommandeArticlesDetails:', error);
      throw error;
    }
  }

  /**
   * Recalcule le montant payé d'une commande en sommant les transactions confirmées
   * @param commandeId ID de la commande
   */
  static async recalculerMontantPaye(commandeId: number): Promise<void> {
    try {
      // Utiliser la fonction SQL créée dans la migration
      await query(`SELECT recalculer_montant_paye_commande($1)`, [commandeId]);

      logger.debug(`[CommandeModel] Montant payé recalculé pour la commande ${commandeId}`);
    } catch (error) {
      logger.error('[CommandeModel] Exception dans recalculerMontantPaye:', error);
      throw error;
    }
  }

  /**
   * Vérifie si une commande est entièrement payée
   * @param commandeId ID de la commande
   */
  static async isCommandeEntierementPayee(commandeId: number): Promise<boolean> {
    const { montant_paye, total } = await this.getMontants(commandeId);

    return montant_paye >= total;
  }

  /**
   * Récupère le montant déjà payé pour une commande
   * @param commandeId ID de la commande
   */
  static async getMontantPaye(commandeId: number): Promise<number> {
    const { montant_paye } = await this.getMontants(commandeId);

    return montant_paye;
  }

  /**
   * Calcule le montant restant à payer pour une commande
   * @param commandeId ID de la commande
   */
  static async getMontantRestant(commandeId: number): Promise<number> {
    const { montant_paye, total } = await this.getMontants(commandeId);

    return Math.max(0, total - montant_paye);
  }

  /**
   * Récupère le total et le montant payé d'une commande.
   * @param commandeId ID de la commande
   */
  private static async getMontants(commandeId: number): Promise<{ montant_paye: number; total: number }> {
    const { rows } = await query<{ montant_paye: number; total: number }>(
      `SELECT COALESCE(montant_paye, 0) AS montant_paye, total FROM commandes WHERE id = $1`,
      [commandeId]
    );

    if (!rows[0]) {
      throw new Error('Commande non trouvée');
    }

    return rows[0];
  }

  /**
   * Annule les commandes orphelines (statut 'en_attente' de plus de X heures sans aucune transaction)
   * et notifie les clients via WhatsApp (template Meta commande_annulee_notification).
   * @param delaiHeures Délai en heures avant de considérer une commande comme orpheline (défaut: 1 heure)
   */
  static async annulerCommandesOrphelines(
    delaiHeures: number = 1
  ): Promise<{ nbAnnulees: number; notificationsEnvoyees: number }> {
    logger.debug(`[CommandeModel] Début de la recherche des commandes orphelines (seuil: ${delaiHeures}h)...`);

    try {
      // L'absence de transaction est évaluée par la base plutôt qu'après
      // chargement de toutes les commandes en attente
      const { rows: orphelines } = await query<{
        id: number; numero_commande: string; client_nom: string; client_telephone: string;
        client_adresse: string; client_ville: string; client_commune: string;
        total: number; frais_livraison: number; boutique: { nom?: string; telephone?: string; slug?: string } | null;
      }>(
        `SELECT c.id, c.numero_commande, c.date_commande, c.client_nom, c.client_telephone,
                c.client_adresse, c.client_ville, c.client_commune, c.total, c.frais_livraison,
                (SELECT row_to_json(b) FROM (
                   SELECT b.id, b.nom, b.telephone, b.slug FROM boutiques b WHERE b.id = c.boutique_id
                 ) b) AS boutique
         FROM commandes c
         WHERE c.statut = 'en_attente'
           AND c.date_commande < NOW() - ($1 || ' hours')::interval
           AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.commande_id = c.id)`,
        [String(delaiHeures)]
      );

      if (orphelines.length === 0) {
        logger.debug('[CommandeModel] Aucune commande orpheline trouvée.');

        return { nbAnnulees: 0, notificationsEnvoyees: 0 };
      }

      const orphelineIds = orphelines.map((cmd) => cmd.id);
      logger.debug(
        `[CommandeModel] Commandes orphelines trouvées (${orphelines.length}):`,
        orphelines.map((c) => c.numero_commande || c.id).join(', ')
      );

      await query(
        `UPDATE commandes SET statut = 'annulee'::statut_commande, date_modification = NOW()
         WHERE id = ANY($1)`,
        [orphelineIds]
      );

      const { WhatsAppService } = await import('../services/whatsapp.service');
      let notificationsEnvoyees = 0;

      for (const cmd of orphelines) {
        if (!cmd.client_telephone) {
          continue;
        }

        try {
          const boutique = cmd.boutique;
          const messageId = await WhatsAppService.sendOrderStatusNotification('annulee', {
            clientNom: cmd.client_nom || 'Client',
            clientTelephone: cmd.client_telephone,
            numeroCommande: cmd.numero_commande || String(cmd.id),
            boutiqueName: boutique?.nom || 'La boutique',
            boutiqueTelephone: boutique?.telephone,
            boutiqueSlug: boutique?.slug,
            total: cmd.total || 0,
            fraisLivraison: cmd.frais_livraison || 0,
            clientAdresse: cmd.client_adresse,
            clientVille: cmd.client_ville,
            clientCommune: cmd.client_commune,
            motifAnnulation: 'Commande expirée sans paiement',
          });

          if (messageId) {
            notificationsEnvoyees += 1;
          }
        } catch (waError: any) {
          logger.error(
            `[CommandeModel] Erreur WhatsApp annulation commande ${cmd.numero_commande}:`,
            waError.message
          );
        }
      }

      logger.debug(
        `[CommandeModel] Succès: ${orphelines.length} commandes orphelines annulées, ${notificationsEnvoyees} notif(s) WhatsApp.`
      );

      return { nbAnnulees: orphelines.length, notificationsEnvoyees };
    } catch (error) {
      logger.error('[CommandeModel] Exception dans annulerCommandesOrphelines:', error);
      throw error;
    }
  }
}
