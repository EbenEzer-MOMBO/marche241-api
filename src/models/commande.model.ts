import { supabaseAdmin } from '../config/supabase';
import { Commande, CommandeArticle, StatutCommande, StatutPaiement } from '../lib/database-types';
import { ProduitModel } from './produit.model';
import { logger } from '../utils/logger';

export class CommandeModel {
  /**
   * Génère un numéro de commande unique
   * Format: COM-YYYY-MMXXXX (où MM est le mois en cours et XXXX est un numéro séquentiel)
   */
  static async generateNumeroCommande(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // Mois sur 2 chiffres (01-12)
    
    // Récupérer le dernier numéro de commande du mois en cours
    const prefix = `COM-${year}-${month}`;
    
    try {
      // Rechercher la dernière commande avec ce préfixe
      const { data } = await supabaseAdmin
        .from('commandes')
        .select('numero_commande')
        .like('numero_commande', `${prefix}%`)
        .order('numero_commande', { ascending: false })
        .limit(1);
      
      let sequentialNumber = 1;
      
      if (data && data.length > 0 && data[0].numero_commande) {
        // Extraire le numéro séquentiel de la dernière commande
        const lastNumber = parseInt(data[0].numero_commande.substring(prefix.length), 10);
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
   */
  static async createCommande(commande: Omit<Commande, 'id' | 'date_commande' | 'date_modification'>): Promise<Commande> {
    logger.debug('[CommandeModel] Début de createCommande');
    logger.debug('[CommandeModel] Données reçues:', JSON.stringify(commande, null, 2));
    
    try {
      // Générer un numéro de commande si non fourni
      if (!commande.numero_commande) {
        commande.numero_commande = await this.generateNumeroCommande();
        logger.debug('[CommandeModel] Numéro de commande généré:', commande.numero_commande);
      }

      // Ajouter les dates
      const commandeData = {
        ...commande,
        date_commande: new Date(),
        date_modification: new Date()
      };
      logger.debug('[CommandeModel] Données finales pour insertion:', JSON.stringify(commandeData, null, 2));

      logger.debug('[CommandeModel] Insertion dans la base de données...');
      const { data, error } = await supabaseAdmin
        .from('commandes')
        .insert([commandeData])
        .select()
        .single();
      
      if (error) {
        logger.error('[CommandeModel] ERREUR lors de l\'insertion:', error);
        throw new Error(`Erreur lors de la création de la commande: ${error.message}`);
      }
      
      logger.debug('[CommandeModel] Commande créée avec succès:', JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      logger.error('[CommandeModel] Exception dans createCommande:', error);
      throw error;
    }
  }

  /**
   * Ajoute un article à une commande
   * @param article Données de l'article
   */
  static async addArticleToCommande(article: Omit<CommandeArticle, 'id'>): Promise<CommandeArticle> {
    logger.debug('[CommandeModel] Début de addArticleToCommande');
    logger.debug('[CommandeModel] Données de l\'article:', JSON.stringify(article, null, 2));
    
    try {
      // Préparer les données de l'article pour l'insertion
      // S'assurer que variants_selectionnes est correctement formaté pour PostgreSQL JSON
      const articleData = {
        ...article,
        variants_selectionnes: article.variants_selectionnes ? article.variants_selectionnes : null
      };
      
      logger.debug('[CommandeModel] Données finales de l\'article pour insertion:', JSON.stringify(articleData, null, 2));
      logger.debug('[CommandeModel] Type de variants_selectionnes:', articleData.variants_selectionnes ? typeof articleData.variants_selectionnes : 'null');
      
      logger.debug('[CommandeModel] Insertion de l\'article dans la base de données...');
      const { data, error } = await supabaseAdmin
        .from('commande_articles')
        .insert([articleData])
        .select()
        .single();
      
      if (error) {
        logger.error('[CommandeModel] ERREUR lors de l\'insertion de l\'article:', error);
        throw new Error(`Erreur lors de l'ajout de l'article à la commande: ${error.message}`);
      }
      
      logger.debug('[CommandeModel] Article ajouté avec succès:', JSON.stringify(data, null, 2));
      return data;
    } catch (error) {
      logger.error('[CommandeModel] Exception dans addArticleToCommande:', error);
      throw error;
    }
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
      const { data: articles, error } = await supabaseAdmin
        .from('commande_articles')
        .select('produit_id, quantite, variants_selectionnes')
        .eq('commande_id', commandeId);
      
      if (error) {
        logger.error(`[CommandeModel] Erreur lors de la récupération des articles: ${error.message}`);
        throw new Error(`Erreur lors de la récupération des articles: ${error.message}`);
      }
      
      if (!articles || articles.length === 0) {
        logger.debug(`[CommandeModel] Aucun article trouvé pour la commande ${commandeId}`);
        return;
      }
      
      // Mettre à jour le stock de chaque produit
      for (const article of articles) {
        const quantite = increment ? -article.quantite : article.quantite;
        
        // Si l'article a des variants sélectionnés, mettre à jour le stock du variant
        if (article.variants_selectionnes && Object.keys(article.variants_selectionnes).length > 0) {
          logger.debug(`[CommandeModel] Mise à jour du stock avec variants pour produit ${article.produit_id}:`, article.variants_selectionnes);
          await ProduitModel.updateStockWithVariants(article.produit_id, quantite, article.variants_selectionnes);
        } else {
          // Sinon, mettre à jour le stock global
          logger.debug(`[CommandeModel] Mise à jour du stock global pour produit ${article.produit_id}`);
          await ProduitModel.updateStock(article.produit_id, quantite);
        }
      }
      
      logger.debug(`[CommandeModel] Stock mis à jour pour tous les produits de la commande ${commandeId}`);
    } catch (error) {
      logger.error(`[CommandeModel] Exception dans updateProductsStock:`, error);
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
      const { data: commandeActuelle, error: getError } = await supabaseAdmin
        .from('commandes')
        .select('statut')
        .eq('id', id)
        .single();
      
      if (getError) {
        logger.error(`[CommandeModel] Erreur lors de la récupération de la commande: ${getError.message}`);
        throw new Error(`Erreur lors de la récupération de la commande: ${getError.message}`);
      }
      
      if (!commandeActuelle) {
        logger.error(`[CommandeModel] Commande non trouvée: ${id}`);
        throw new Error(`Commande non trouvée: ${id}`);
      }
      
      const statutActuel = commandeActuelle.statut;
      logger.debug(`[CommandeModel] Statut actuel de la commande ${id}: ${statutActuel}`);
      
      // Déterminer les champs à mettre à jour en fonction du statut
      const updateFields: any = {
        statut,
        date_modification: new Date()
      };
      
      // Ajouter les dates spécifiques en fonction du statut
      if (statut === 'confirmee') {
        updateFields.date_confirmation = new Date();
      } else if (statut === 'expedie') {
        updateFields.date_expedition = new Date();
      } else if (statut === 'livree') {
        updateFields.date_livraison = new Date();
      }
      
      // Mettre à jour la commande
      const { data, error } = await supabaseAdmin
        .from('commandes')
        .update(updateFields)
        .eq('id', id)
        .select(`
          *,
          boutique:boutiques(id, nom, telephone, adresse)
        `)
        .single();
      
      if (error) {
        logger.error(`[CommandeModel] Erreur lors de la mise à jour du statut: ${error.message}`);
        throw new Error(`Erreur lors de la mise à jour du statut de la commande: ${error.message}`);
      }
      
      // Mettre à jour le stock en fonction du changement de statut
      if (statut === 'confirmee' && statutActuel !== 'confirmee') {
        // Décrémenter le stock lors de la confirmation
        logger.debug(`[CommandeModel] Décrémentation du stock pour la commande ${id} confirmée`);
        await this.updateProductsStock(id, false); // false = décrémenter
      } else if ((statut === 'annulee' || statut === 'remboursee') && 
                 (statutActuel === 'confirmee' || statutActuel === 'en_preparation' || statutActuel === 'expedie')) {
        // Incrémenter le stock lors de l'annulation ou du remboursement d'une commande confirmée
        logger.debug(`[CommandeModel] Incrémentation du stock pour la commande ${id} annulée/remboursée`);
        await this.updateProductsStock(id, true); // true = incrémenter
      }
      
      logger.debug(`[CommandeModel] Statut de la commande ${id} mis à jour: ${statutActuel} -> ${statut}`);
      return data;
    } catch (error) {
      logger.error(`[CommandeModel] Exception dans updateCommandeStatus:`, error);
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
    const updateData: any = {
      statut_paiement: statutPaiement,
      date_modification: new Date()
    };

    if (methodePaiement) {
      updateData.methode_paiement = methodePaiement;
    }
    
    const { data, error } = await supabaseAdmin
      .from('commandes')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Erreur lors de la mise à jour du statut de paiement: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère une commande par son ID
   * @param id ID de la commande
   */
  static async getCommandeById(id: number): Promise<Commande | null> {
    const { data, error } = await supabaseAdmin
      .from('commandes')
      .select(`
        *,
        boutique:boutique_id(*),
        articles:commande_articles(*),
        transactions:transactions(*)
      `)
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération de la commande: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère une commande par son numéro
   * @param numeroCommande Numéro de la commande
   */
  static async getCommandeByNumero(numeroCommande: string): Promise<Commande | null> {
    const { data, error } = await supabaseAdmin
      .from('commandes')
      .select(`
        *,
        boutique:boutique_id(*),
        articles:commande_articles(*),
        transactions:transactions(*)
      `)
      .eq('numero_commande', numeroCommande)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération de la commande: ${error.message}`);
    }
    
    return data;
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
    const { count, error: countError } = await supabaseAdmin
      .from('commandes')
      .select('*', { count: 'exact', head: true })
      .eq('boutique_id', boutiqueId);
    
    if (countError) {
      throw new Error(`Erreur lors du comptage des commandes: ${countError.message}`);
    }
    
    // Récupérer les commandes avec pagination
    const { data, error } = await supabaseAdmin
      .from('commandes')
      .select(`
        *,
        boutique:boutique_id(*)
      `)
      .eq('boutique_id', boutiqueId)
      .order('date_commande', { ascending: false })
      .range(offset, offset + limite - 1);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des commandes: ${error.message}`);
    }
    
    return {
      commandes: data || [],
      total: count || 0
    };
  }

  /**
   * Calcule les totaux d'une commande
   * @param commandeId ID de la commande
   */
  static async calculateCommandeTotals(commandeId: number): Promise<{ sous_total: number, total: number }> {
    logger.debug('[CommandeModel] Début de calculateCommandeTotals pour commandeId:', commandeId);
    
    try {
      // Récupérer les articles de la commande
      logger.debug('[CommandeModel] Récupération des articles de la commande...');
      const { data: articles, error } = await supabaseAdmin
        .from('commande_articles')
        .select('*')
        .eq('commande_id', commandeId);
      
      if (error) {
        logger.error('[CommandeModel] ERREUR lors de la récupération des articles:', error);
        throw new Error(`Erreur lors de la récupération des articles: ${error.message}`);
      }
      
      logger.debug(`[CommandeModel] ${articles?.length || 0} articles trouvés pour la commande`);
      
      // Calculer le sous-total
      const sousTotal = articles?.reduce((sum, article) => {
        return sum + (article.prix_unitaire * article.quantite);
      }, 0) || 0;
      logger.debug('[CommandeModel] Sous-total calculé:', sousTotal);
      
      // Récupérer la commande pour les frais de livraison, taxes et remises
      logger.debug('[CommandeModel] Récupération des frais de la commande...');
      const { data: commande, error: commandeError } = await supabaseAdmin
        .from('commandes')
        .select('frais_livraison, taxes, remise')
        .eq('id', commandeId)
        .single();
      
      if (commandeError) {
        logger.error('[CommandeModel] ERREUR lors de la récupération de la commande:', commandeError);
        throw new Error(`Erreur lors de la récupération de la commande: ${commandeError.message}`);
      }
      
      logger.debug('[CommandeModel] Frais de la commande:', JSON.stringify(commande, null, 2));
      
      // Calculer le total
      const fraisLivraison = commande?.frais_livraison || 0;
      const taxes = commande?.taxes || 0;
      const remise = commande?.remise || 0;
      
      const total = sousTotal + fraisLivraison + taxes - remise;
      logger.debug('[CommandeModel] Total calculé:', total);
      
      return { sous_total: sousTotal, total };
    } catch (error) {
      logger.error('[CommandeModel] Exception dans calculateCommandeTotals:', error);
      throw error;
    }
  }

  /**
   * Met à jour les totaux d'une commande
   * @param commandeId ID de la commande
   */
  static async updateCommandeTotals(commandeId: number): Promise<Commande> {
    logger.debug('[CommandeModel] Début de updateCommandeTotals pour commandeId:', commandeId);
    
    try {
      // Calculer les totaux
      logger.debug('[CommandeModel] Calcul des totaux...');
      const { sous_total, total } = await this.calculateCommandeTotals(commandeId);
      logger.debug('[CommandeModel] Totaux calculés:', { sous_total, total });
      
      // Mettre à jour la commande
      logger.debug('[CommandeModel] Mise à jour de la commande avec les totaux...');
      const { data, error } = await supabaseAdmin
        .from('commandes')
        .update({
          sous_total,
          total,
          date_modification: new Date()
        })
        .eq('id', commandeId)
        .select()
        .single();
      
      if (error) {
        logger.error('[CommandeModel] ERREUR lors de la mise à jour des totaux:', error);
        throw new Error(`Erreur lors de la mise à jour des totaux: ${error.message}`);
      }
      
      logger.debug('[CommandeModel] Commande mise à jour avec succès:', JSON.stringify(data, null, 2));
      return data;
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
      // Récupérer les articles de la commande avec les informations du produit
      const { data: articles, error } = await supabaseAdmin
        .from('commande_articles')
        .select(`
          *,
          produit:produit_id(*)
        `)
        .eq('commande_id', commandeId);
      
      if (error) {
        logger.error('[CommandeModel] Erreur lors de la récupération des articles:', error);
        throw new Error(`Erreur lors de la récupération des articles: ${error.message}`);
      }
      
      logger.debug(`[CommandeModel] ${articles?.length || 0} articles trouvés`);
      return articles || [];
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
      const { error } = await supabaseAdmin.rpc('recalculer_montant_paye_commande', {
        p_commande_id: commandeId
      });

      if (error) {
        logger.error('[CommandeModel] Erreur lors du recalcul du montant payé:', error);
        throw new Error(`Erreur lors du recalcul du montant payé: ${error.message}`);
      }

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
    try {
      const commande = await this.getCommandeById(commandeId);
      if (!commande) {
        throw new Error('Commande non trouvée');
      }

      return commande.montant_paye >= commande.total;
    } catch (error) {
      logger.error('[CommandeModel] Exception dans isCommandeEntierementPayee:', error);
      throw error;
    }
  }

  /**
   * Récupère le montant déjà payé pour une commande
   * @param commandeId ID de la commande
   */
  static async getMontantPaye(commandeId: number): Promise<number> {
    try {
      const commande = await this.getCommandeById(commandeId);
      if (!commande) {
        throw new Error('Commande non trouvée');
      }

      return commande.montant_paye || 0;
    } catch (error) {
      logger.error('[CommandeModel] Exception dans getMontantPaye:', error);
      throw error;
    }
  }

  /**
   * Calcule le montant restant à payer pour une commande
   * @param commandeId ID de la commande
   */
  static async getMontantRestant(commandeId: number): Promise<number> {
    try {
      const commande = await this.getCommandeById(commandeId);
      if (!commande) {
        throw new Error('Commande non trouvée');
      }

      return Math.max(0, commande.total - commande.montant_paye);
    } catch (error) {
      logger.error('[CommandeModel] Exception dans getMontantRestant:', error);
      throw error;
    }
  }

  /**
   * Annule les commandes orphelines (statut 'en_attente' de plus de X heures sans aucune transaction)
   * @param delaiHeures Délai en heures avant de considérer une commande comme orpheline (défaut: 1 heure)
   */
  static async annulerCommandesOrphelines(delaiHeures: number = 1): Promise<{ nbAnnulees: number }> {
    logger.debug(`[CommandeModel] Début de la recherche des commandes orphelines (seuil: ${delaiHeures}h)...`);
    try {
      const dateLimite = new Date(Date.now() - delaiHeures * 60 * 60 * 1000).toISOString();

      // Récupérer les commandes en attente créées avant la date limite, avec leurs transactions
      const { data: commandes, error } = await supabaseAdmin
        .from('commandes')
        .select('id, numero_commande, date_commande, transactions(id)')
        .eq('statut', 'en_attente')
        .lt('date_commande', dateLimite);

      if (error) {
        logger.error('[CommandeModel] Erreur lors de la récupération des commandes en attente:', error);
        throw new Error(`Erreur lors de la récupération des commandes: ${error.message}`);
      }

      if (!commandes || commandes.length === 0) {
        logger.debug('[CommandeModel] Aucune commande en attente trouvée avant le seuil.');
        return { nbAnnulees: 0 };
      }

      // Filtrer les commandes qui n'ont aucune transaction associée
      const orphelineIds: number[] = [];
      const orphelineNumeros: string[] = [];

      for (const cmd of commandes) {
        const txs = cmd.transactions as any[];
        if (!txs || txs.length === 0) {
          orphelineIds.push(cmd.id);
          orphelineNumeros.push(cmd.numero_commande || cmd.id.toString());
        }
      }

      if (orphelineIds.length === 0) {
        logger.debug('[CommandeModel] Toutes les commandes en attente ont au moins une transaction associée.');
        return { nbAnnulees: 0 };
      }

      logger.debug(`[CommandeModel] Commandes orphelines trouvées (${orphelineIds.length}):`, orphelineNumeros.join(', '));

      // Mettre à jour ces commandes au statut 'annulee'
      const { error: updateError } = await supabaseAdmin
        .from('commandes')
        .update({
          statut: 'annulee',
          date_modification: new Date()
        })
        .in('id', orphelineIds);

      if (updateError) {
        logger.error('[CommandeModel] Erreur lors de l\'annulation en masse des commandes orphelines:', updateError);
        throw new Error(`Erreur lors de l'annulation des commandes: ${updateError.message}`);
      }

      logger.debug(`[CommandeModel] Succès: ${orphelineIds.length} commandes orphelines annulées.`);
      return { nbAnnulees: orphelineIds.length };
    } catch (error) {
      logger.error('[CommandeModel] Exception dans annulerCommandesOrphelines:', error);
      throw error;
    }
  }
}

