import { query } from '../config/database';
import { Produit } from '../lib/database-types';
import { logger } from '../utils/logger';

/**
 * Jointures de la boutique et de la catégorie, sous forme d'objets JSON.
 * Reproduit les relations `boutique:boutique_id(*)` et `categorie:categorie_id(*)`
 * de l'ancien client.
 */
const JOINTURES = `
  (SELECT row_to_json(b) FROM boutiques b WHERE b.id = p.boutique_id) AS boutique,
  (SELECT row_to_json(c) FROM categories c WHERE c.id = p.categorie_id) AS categorie`;

/**
 * Colonnes autorisées pour le tri des listes paginées.
 * Le nom de colonne étant interpolé dans le SQL, toute valeur hors de
 * cette liste est rejetée au profit du tri par défaut.
 */
const COLONNES_TRI = [
  'id',
  'nom',
  'slug',
  'prix',
  'quantite_stock',
  'note_moyenne',
  'nombre_avis',
  'nombre_vues',
  'nombre_ventes',
  'statut',
  'date_creation',
  'date_modification'
] as const;

/**
 * Colonnes modifiables via les méthodes de création et de mise à jour.
 */
const COLONNES_AUTORISEES = [
  'nom',
  'slug',
  'description',
  'description_courte',
  'prix',
  'prix_original',
  'sku',
  'boutique_id',
  'categorie_id',
  'images',
  'image_principale',
  'variants',
  'en_stock',
  'quantite_stock',
  'poids',
  'dimensions',
  'tags',
  'note_moyenne',
  'nombre_avis',
  'nombre_vues',
  'nombre_ventes',
  'est_nouveau',
  'est_en_promotion',
  'est_featured',
  'statut'
] as const;

/** Colonnes de type JSON, à sérialiser avant envoi */
const COLONNES_JSON = ['images', 'variants', 'dimensions', 'tags'];

/**
 * Ne conserve que les champs correspondant à une colonne autorisée.
 * @param donnees Données fournies par l'appelant
 */
const filtrerColonnes = (donnees: Record<string, unknown>): Array<[string, unknown]> =>
  Object.entries(donnees).filter(([colonne]) =>
    (COLONNES_AUTORISEES as readonly string[]).includes(colonne)
  );

/**
 * Prépare la valeur d'une colonne pour l'envoi en base : les colonnes JSON
 * sont sérialisées, les autres passent telles quelles.
 * @param colonne Nom de la colonne
 * @param valeur Valeur fournie
 */
const preparerValeur = (colonne: string, valeur: unknown): unknown => {
  if (!COLONNES_JSON.includes(colonne)) {
    return valeur;
  }

  return valeur === null || valeur === undefined ? null : JSON.stringify(valeur);
};

/**
 * Construit le placeholder d'une colonne, avec le cast requis par son type.
 * @param colonne Nom de la colonne
 * @param position Position du paramètre dans la requête
 */
const placeholder = (colonne: string, position: number): string => {
  if (COLONNES_JSON.includes(colonne)) {
    return `$${position}::json`;
  }

  return colonne === 'statut' ? `$${position}::statut_produit` : `$${position}`;
};

export class ProduitModel {
  /**
   * Transforme un produit pour ajouter prix_promo si nécessaire
   * Si le produit a un prix_original, cela signifie qu'il est en promotion:
   * - prix_original contient le prix normal
   * - prix contient le prix promotionnel (prix affiché)
   * - on ajoute prix_promo (= prix actuel) pour le frontend
   */
  private static transformProduitForResponse(produit: any): any {
    if (!produit) return null;
    
    // Si le produit a un prix_original, il est en promotion
    if (produit.prix_original !== null && produit.prix_original !== undefined) {
      return {
        ...produit,
        prix_promo: produit.prix,        // Le prix actuel est le prix promo
        prix: produit.prix_original       // Restaurer le prix normal pour le frontend
      };
    }
    
    // Sinon, retourner tel quel
    return produit;
  }
  
  /**
   * Transforme un tableau de produits
   */
  private static transformProduitsForResponse(produits: any[]): any[] {
    return produits.map(p => this.transformProduitForResponse(p));
  }

  /**
   * Met à jour le stock d'un produit
   * @param produitId ID du produit
   * @param quantite Quantité à décrémenter (valeur positive pour décrémenter, négative pour incrémenter)
   * @returns Le produit mis à jour
   */
  static async updateStock(produitId: number, quantite: number): Promise<Produit> {
    logger.debug(`[ProduitModel] Mise à jour du stock pour le produit ${produitId}, quantité: ${quantite}`);
    
    try {
      // Récupérer le produit actuel pour vérifier le stock disponible
      const { rows: produits } = await query<{ quantite_stock: number; nombre_ventes: number }>(
        `SELECT quantite_stock, nombre_ventes FROM produits WHERE id = $1`,
        [produitId]
      );

      if (!produits[0]) {
        logger.error(`[ProduitModel] Produit non trouvé: ${produitId}`);
        throw new Error(`Produit non trouvé: ${produitId}`);
      }

      const stockActuel = produits[0].quantite_stock ?? 0;

      // Vérifier si le stock est suffisant
      const nouveauStock = stockActuel - quantite;
      if (nouveauStock < 0) {
        logger.error(`[ProduitModel] Stock insuffisant pour le produit ${produitId}: ${stockActuel} < ${quantite}`);
        throw new Error(`Stock insuffisant pour le produit ${produitId}`);
      }

      // Le décrément est appliqué par la base, et la condition sur le stock
      // rejouée dans la requête : deux ventes concurrentes ne peuvent pas
      // faire passer le stock sous zéro
      const affectations = [
        'quantite_stock = quantite_stock - $1',
        'en_stock = (quantite_stock - $1) > 0',
        'date_modification = NOW()'
      ];

      // Incrémenter nombre_ventes seulement lors d'une vente (quantite > 0)
      if (quantite > 0) {
        affectations.push('nombre_ventes = COALESCE(nombre_ventes, 0) + $1');
      }

      const { rows } = await query<Produit>(
        `UPDATE produits SET ${affectations.join(', ')}
         WHERE id = $2 AND quantite_stock - $1 >= 0
         RETURNING *`,
        [quantite, produitId]
      );

      if (!rows[0]) {
        logger.error(`[ProduitModel] Stock insuffisant pour le produit ${produitId} (mise à jour concurrente)`);
        throw new Error(`Stock insuffisant pour le produit ${produitId}`);
      }

      logger.debug(`[ProduitModel] Stock mis à jour pour le produit ${produitId}: ${stockActuel} -> ${nouveauStock}`);

      return rows[0];
    } catch (error) {
      logger.error(`[ProduitModel] Exception dans updateStock:`, error);
      throw error;
    }
  }

  /**
   * Met à jour le stock d'un produit avec variants
   * @param produitId ID du produit
   * @param quantite Quantité à décrémenter
   * @param variantsSelectionnes Variants sélectionnés 
   *   - Nouveau format: { variant: { nom: "Rouge", ... }, options: { ... } }
   *   - Ancien format: { "Couleur": "Rouge", "Taille": "M" }
   * @returns Le produit mis à jour
   */
  /**
   * Extrait la taille ou pointure du nom du variant
   * @example "Marron - Taille XL" => "XL"
   * @example "Noir - Pointure 42" => "42"
   */
  private static extraireTaille(nomVariant: string): string | null {
    if (nomVariant.includes(' - Taille ')) {
      const parts = nomVariant.split(' - Taille ');
      return parts[1]?.trim() || null;
    }
    if (nomVariant.includes(' - Pointure ')) {
      const parts = nomVariant.split(' - Pointure ');
      return parts[1]?.trim() || null;
    }
    return null;
  }

  /**
   * Trouve un variant par son ID dans le tableau des variants
   */
  private static trouverVariantParId(variants: any[], variantId: string): any | null {
    for (const variant of variants) {
      if (variant.id === variantId) {
        return variant;
      }
    }
    return null;
  }

  /**
   * Recalcule le stock total de tous les variants
   */
  private static recalculerStockTotal(variantsData: any): number {
    let total = 0;

    // Service : pas de stock par variant
    if (variantsData?.type === 'service') {
      return total;
    }
    
    if (!variantsData?.variants || !Array.isArray(variantsData.variants)) {
      return total;
    }

    for (const variant of variantsData.variants) {
      // Vêtements : tailles
      if (variant.tailles && Array.isArray(variant.tailles)) {
        for (const taille of variant.tailles) {
          total += taille.stock || 0;
        }
      }
      // Chaussures : pointures
      else if (variant.pointures && Array.isArray(variant.pointures)) {
        for (const pointure of variant.pointures) {
          total += pointure.stock || 0;
        }
      }
      // Événement / générique : stock direct sur le variant (billets, attributs)
      else if (typeof variant.stock === 'number') {
        total += variant.stock;
      }
      // Ancien format avec quantite
      else if (typeof variant.quantite === 'number') {
        total += variant.quantite;
      }
    }

    return total;
  }

  /**
   * Enregistre les variants recalculés et la quantité totale correspondante.
   * @param produitId ID du produit
   * @param variants Variants mis à jour, tels qu'ils seront stockés
   * @param quantiteTotale Stock total recalculé à partir des variants
   * @param quantite Quantité vendue (positive) ou restituée (négative)
   */
  private static async enregistrerVariants(
    produitId: number,
    variants: unknown,
    quantiteTotale: number,
    quantite: number
  ): Promise<Produit> {
    const affectations = [
      'variants = $1::json',
      'quantite_stock = $2',
      'en_stock = $2 > 0',
      'date_modification = NOW()'
    ];

    // Incrémenter nombre_ventes seulement lors d'une vente (quantite > 0)
    if (quantite > 0) {
      affectations.push('nombre_ventes = COALESCE(nombre_ventes, 0) + $4');
    }

    const params: unknown[] = [JSON.stringify(variants), quantiteTotale, produitId];
    if (quantite > 0) {
      params.push(quantite);
    }

    const { rows } = await query<Produit>(
      `UPDATE produits SET ${affectations.join(', ')} WHERE id = $3 RETURNING *`,
      params
    );

    if (!rows[0]) {
      throw new Error(`Erreur lors de la mise à jour du stock: produit ${produitId} introuvable`);
    }

    return rows[0];
  }

  static async updateStockWithVariants(produitId: number, quantite: number, variantsSelectionnes: any): Promise<Produit> {
    logger.debug(`[ProduitModel] Mise à jour du stock avec variants pour le produit ${produitId}`, {
      quantite,
      variantsSelectionnes
    });
    
    try {
      // Récupérer le produit avec ses variants
      const { rows: produits } = await query<{
        id: number; variants: unknown; quantite_stock: number; nombre_ventes: number;
      }>(
        `SELECT id, variants, quantite_stock, nombre_ventes FROM produits WHERE id = $1`,
        [produitId]
      );

      const produit = produits[0];

      if (!produit) {
        logger.error(`[ProduitModel] Produit non trouvé: ${produitId}`);
        throw new Error(`Produit non trouvé: ${produitId}`);
      }

      if (!produit.variants) {
        logger.debug(`[ProduitModel] Produit sans variants, mise à jour du stock global`);
        return await this.updateStock(produitId, quantite);
      }

      logger.debug(`[ProduitModel] Variants actuels:`, JSON.stringify(produit.variants, null, 2));

      const variantsData = produit.variants as any;
      let variantTrouve = false;
      let nouveauxVariantsData: any;

      // ========================================
      // NOUVEAU FORMAT MODERNE: { type: "vetements"|"chaussures"|"electronique"|..., variants: [...] }
      // ========================================
      if (variantsData.type && variantsData.variants && Array.isArray(variantsData.variants)) {
        logger.debug(`[ProduitModel] Format moderne détecté, type: ${variantsData.type}`);

        // Service : pas de variants billets/tailles — stock global produit
        if (variantsData.type === 'service') {
          logger.debug(`[ProduitModel] Type service: mise à jour du stock global`);
          return await this.updateStock(produitId, quantite);
        }
        
        nouveauxVariantsData = JSON.parse(JSON.stringify(variantsData)); // Deep clone
        
        // Extraire les infos du variant sélectionné
        const variantSelectionne = variantsSelectionnes.variant;
        const variantId = variantSelectionne?.id || null;
        const variantNom = variantSelectionne?.nom || null;
        
        if (!variantId) {
          logger.warn(`[ProduitModel] Pas d'ID de variant dans la sélection, recherche par nom`);
        }
        
        logger.debug(`[ProduitModel] Recherche du variant: ID=${variantId}, Nom=${variantNom}`);
        
        // Trouver le variant par son ID
        const variant = this.trouverVariantParId(nouveauxVariantsData.variants, variantId);
        
        if (!variant) {
          logger.error(`[ProduitModel] Variant non trouvé: ${variantId}`);
          throw new Error(`Variant non trouvé: ${variantId}`);
        }
        
        logger.debug(`[ProduitModel] Variant trouvé:`, JSON.stringify(variant, null, 2));
        
        // Cas 1 : Vêtements ou Chaussures (avec tailles)
        if ((variantsData.type === 'vetements' || variantsData.type === 'chaussures') && variant.tailles) {
          const tailleRecherchee = this.extraireTaille(variantNom);
          
          if (!tailleRecherchee) {
            logger.error(`[ProduitModel] Impossible d'extraire la taille du nom: ${variantNom}`);
            throw new Error(`Impossible d'extraire la taille du variant: ${variantNom}`);
          }
          
          logger.debug(`[ProduitModel] Taille recherchée: ${tailleRecherchee}`);
          
          // Trouver la taille dans le variant
          let tailleTrouvee = false;
          for (const tailleObj of variant.tailles) {
            if (tailleObj.taille === tailleRecherchee) {
              const stockActuel = tailleObj.stock || 0;
              const nouveauStock = stockActuel - quantite;
              
              if (nouveauStock < 0) {
                logger.error(`[ProduitModel] Stock insuffisant pour ${variantNom}`);
                throw new Error(`Stock insuffisant pour ${variantNom} (disponible: ${stockActuel}, demandé: ${quantite})`);
              }
              
              tailleObj.stock = nouveauStock;
              logger.debug(`[ProduitModel] Stock de la taille ${tailleRecherchee} mis à jour: ${stockActuel} -> ${nouveauStock}`);
              tailleTrouvee = true;
              variantTrouve = true;
              break;
            }
          }
          
          if (!tailleTrouvee) {
            logger.error(`[ProduitModel] Taille non trouvée: ${tailleRecherchee}`);
            throw new Error(`Taille non trouvée: ${tailleRecherchee}`);
          }
        }
        // Cas 2 : Produits Génériques (sans tailles, stock direct sur le variant)
        else if (typeof variant.stock === 'number') {
          const stockActuel = variant.stock;
          const nouveauStock = stockActuel - quantite;
          
          if (nouveauStock < 0) {
            logger.error(`[ProduitModel] Stock insuffisant pour le variant ${variantNom || variantId}`);
            throw new Error(`Stock insuffisant pour le variant ${variantNom || variantId} (disponible: ${stockActuel}, demandé: ${quantite})`);
          }
          
          variant.stock = nouveauStock;
          logger.debug(`[ProduitModel] Stock du variant ${variantNom || variantId} mis à jour: ${stockActuel} -> ${nouveauStock}`);
          variantTrouve = true;
        }
        // Cas 3 : Ancien format avec "quantite" au lieu de "stock"
        else if (typeof variant.quantite === 'number') {
          const stockActuel = variant.quantite;
          const nouveauStock = stockActuel - quantite;
          
          if (nouveauStock < 0) {
            logger.error(`[ProduitModel] Stock insuffisant pour le variant ${variantNom || variantId}`);
            throw new Error(`Stock insuffisant pour le variant ${variantNom || variantId} (disponible: ${stockActuel}, demandé: ${quantite})`);
          }
          
          variant.quantite = nouveauStock;
          logger.debug(`[ProduitModel] Stock du variant ${variantNom || variantId} mis à jour: ${stockActuel} -> ${nouveauStock}`);
          variantTrouve = true;
        }
        
        if (variantTrouve) {
          // Recalculer le stock total
          const quantiteTotale = this.recalculerStockTotal(nouveauxVariantsData);
          logger.debug(`[ProduitModel] Nouvelle quantité totale calculée: ${quantiteTotale}`);
          
          const produitMisAJour = await this.enregistrerVariants(
            produitId, nouveauxVariantsData, quantiteTotale, quantite
          );

          logger.debug(`[ProduitModel] Stock avec variants mis à jour avec succès (format moderne)`);

          return produitMisAJour;
        }
      }
      
      // ========================================
      // FORMAT INTERMÉDIAIRE: { variants: [...], options: [...] } sans "type"
      // ========================================
      else if (variantsData.variants && Array.isArray(variantsData.variants) && !variantsData.type) {
        logger.debug(`[ProduitModel] Format intermédiaire détecté (variants sans type)`);
        
        nouveauxVariantsData = JSON.parse(JSON.stringify(variantsData));
        const nouveauxVariants = nouveauxVariantsData.variants;
        
        // Extraire le nom du variant sélectionné
        const nomVariantSelectionne = variantsSelectionnes.variant?.nom || null;
        
        if (nomVariantSelectionne) {
          logger.debug(`[ProduitModel] Recherche du variant par nom: ${nomVariantSelectionne}`);
          
          for (let i = 0; i < nouveauxVariants.length; i++) {
            if (nouveauxVariants[i].nom === nomVariantSelectionne) {
              const quantiteActuelle = nouveauxVariants[i].quantite || 0;
              const nouvelleQuantite = quantiteActuelle - quantite;
              
              if (nouvelleQuantite < 0) {
                logger.error(`[ProduitModel] Stock insuffisant pour le variant ${nomVariantSelectionne}`);
                throw new Error(`Stock insuffisant pour le variant ${nomVariantSelectionne} (disponible: ${quantiteActuelle}, demandé: ${quantite})`);
              }
              
              nouveauxVariants[i].quantite = nouvelleQuantite;
              logger.debug(`[ProduitModel] Stock du variant ${nomVariantSelectionne} mis à jour: ${quantiteActuelle} -> ${nouvelleQuantite}`);
              variantTrouve = true;
              break;
            }
          }
        }
        
        if (variantTrouve) {
          // Calculer la quantité totale
          const quantiteTotale = nouveauxVariants.reduce((sum: number, v: any) => sum + (v.quantite || 0), 0);
          logger.debug(`[ProduitModel] Nouvelle quantité totale calculée: ${quantiteTotale}`);
          
          const produitMisAJour = await this.enregistrerVariants(
            produitId, nouveauxVariantsData, quantiteTotale, quantite
          );

          logger.debug(`[ProduitModel] Stock avec variants mis à jour avec succès (format intermédiaire)`);

          return produitMisAJour;
        }
      }
      
      // ========================================
      // ANCIEN FORMAT: [{ "nom": "Type", "options": ["A", "B"], "quantites": [8, 4] }]
      // ========================================
      else if (Array.isArray(variantsData)) {
        logger.debug(`[ProduitModel] Ancien format détecté (tableau)`);
        
        let nouveauxVariants = JSON.parse(JSON.stringify(variantsData));

        for (let i = 0; i < nouveauxVariants.length; i++) {
          const variant = nouveauxVariants[i];
          
          if (variant.nom && variant.options && variant.quantites) {
            const nomVariant = variant.nom;
            const valeurSelectionnee = variantsSelectionnes[nomVariant];
            
            if (valeurSelectionnee) {
              const indexOption = variant.options.indexOf(valeurSelectionnee);
              
              if (indexOption !== -1) {
                const quantiteActuelle = variant.quantites[indexOption] || 0;
                const nouvelleQuantite = quantiteActuelle - quantite;
                
                if (nouvelleQuantite < 0) {
                  logger.error(`[ProduitModel] Stock insuffisant pour le variant ${nomVariant}:${valeurSelectionnee}`);
                  throw new Error(`Stock insuffisant pour le variant ${nomVariant}: ${valeurSelectionnee} (disponible: ${quantiteActuelle}, demandé: ${quantite})`);
                }
                
                nouveauxVariants[i].quantites[indexOption] = nouvelleQuantite;
                logger.debug(`[ProduitModel] Stock du variant ${nomVariant}:${valeurSelectionnee} mis à jour: ${quantiteActuelle} -> ${nouvelleQuantite}`);
                variantTrouve = true;
              }
            }
          }
        }

        if (variantTrouve) {
          // Calculer la nouvelle quantité totale en stock
          let quantiteTotale = 0;
          for (const variant of nouveauxVariants) {
            if (variant.quantites && Array.isArray(variant.quantites)) {
              quantiteTotale += variant.quantites.reduce((sum: number, q: number) => sum + (q || 0), 0);
            }
          }

          logger.debug(`[ProduitModel] Nouvelle quantité totale calculée: ${quantiteTotale}`);

          // L'ancien format stocke directement le tableau de variants
          const produitMisAJour = await this.enregistrerVariants(
            produitId, nouveauxVariants, quantiteTotale, quantite
          );

          logger.debug(`[ProduitModel] Stock avec variants mis à jour avec succès (ancien format)`);

          return produitMisAJour;
        }
      }

      if (!variantTrouve) {
        logger.warn(`[ProduitModel] Aucun variant correspondant trouvé, mise à jour du stock global`);
        return await this.updateStock(produitId, quantite);
      }

      throw new Error('Format de variants non reconnu');
    } catch (error) {
      logger.error(`[ProduitModel] Exception dans updateStockWithVariants:`, error);
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
    const { rows: total } = await query<{ count: string }>(`SELECT COUNT(*) AS count FROM produits`);

    // N'accepter que des valeurs connues : elles sont interpolées dans le SQL
    const colonneTri = (COLONNES_TRI as readonly string[]).includes(tri_par) ? tri_par : 'date_creation';
    const sensTri = ordre === 'ASC' ? 'ASC' : 'DESC';

    // Récupérer les produits avec pagination
    const { rows } = await query<Produit>(
      `SELECT p.*, ${JOINTURES}
       FROM produits p
       ORDER BY ${colonneTri} ${sensTri}
       LIMIT $1 OFFSET $2`,
      [limite, offset]
    );

    return {
      produits: rows,
      total: Number(total[0].count)
    };
  }

  /**
   * Récupère un produit par son ID
   */
  static async getProduitById(id: number): Promise<Produit | null> {
    const { rows } = await query<Produit>(
      `SELECT p.*, ${JOINTURES} FROM produits p WHERE p.id = $1`,
      [id]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère un produit par son slug
   */
  static async getProduitBySlug(slug: string): Promise<Produit | null> {
    const { rows } = await query<Produit>(
      `SELECT p.*, ${JOINTURES} FROM produits p WHERE p.slug = $1`,
      [slug]
    );

    return rows[0] ?? null;
  }

  /**
   * Récupère les produits par catégorie
   */
  static async getProduitsByCategorie(categorieId: number, limite: number = 10): Promise<Produit[]> {
    const { rows } = await query<Produit>(
      `SELECT p.*, ${JOINTURES}
       FROM produits p
       WHERE p.categorie_id = $1 AND p.statut = 'actif'
       ORDER BY p.note_moyenne DESC
       LIMIT $2`,
      [categorieId, limite]
    );

    return rows;
  }

  /**
   * Récupère les produits les plus importants par catégorie
   * Les produits sont triés par stock (en stock d'abord), note moyenne et nombre de ventes
   * Ne renvoie que les catégories avec des produits, limité à 3 catégories maximum
   * @param limite Nombre de produits à récupérer par catégorie
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getTopProduitsByCategories(limite: number = 4, boutiqueId?: number): Promise<{ [key: string]: any }> {
    let categoriesAvecProduits: Set<number> | undefined;
    if (boutiqueId) {
      const { rows: produitsBoutique } = await query<{ categorie_id: number }>(
        `SELECT DISTINCT categorie_id FROM produits WHERE boutique_id = $1 AND statut = 'actif'`,
        [boutiqueId]
      );

      categoriesAvecProduits = new Set(produitsBoutique.map(p => p.categorie_id));
    }

    const { rows: toutesCategories } = await query<{ id: number; slug: string }>(
      `SELECT * FROM categories WHERE statut = 'active' ORDER BY ordre_affichage ASC`
    );

    let categories = toutesCategories;
    if (boutiqueId && categoriesAvecProduits) {
      categories = categories.filter(c => categoriesAvecProduits!.has(c.id));
    }

    if (categories.length === 0) {
      return {};
    }

    const categorieIds = categories.map(c => c.id);
    const params: unknown[] = [categorieIds];
    const filtreBoutique = boutiqueId ? `AND p.boutique_id = $2` : '';

    if (boutiqueId) {
      params.push(boutiqueId);
    }

    const { rows: allProduits } = await query<Produit & { categorie_id: number }>(
      `SELECT p.*,
              (SELECT row_to_json(b) FROM (
                 SELECT b.id, b.nom, b.slug, b.logo FROM boutiques b WHERE b.id = p.boutique_id
               ) b) AS boutique,
              (SELECT row_to_json(c) FROM (
                 SELECT c.id, c.nom, c.slug FROM categories c WHERE c.id = p.categorie_id
               ) c) AS categorie
       FROM produits p
       WHERE p.categorie_id = ANY($1) AND p.statut = 'actif' ${filtreBoutique}
       ORDER BY
         CASE WHEN p.en_stock IS TRUE THEN 0 ELSE 1 END,
         p.note_moyenne DESC,
         p.nombre_ventes DESC`,
      params
    );

    const produitsParCategorie = new Map<number, any[]>();
    for (const produit of allProduits) {
      const list = produitsParCategorie.get(produit.categorie_id) || [];
      if (list.length < limite) {
        list.push(produit);
        produitsParCategorie.set(produit.categorie_id, list);
      }
    }

    const result: { [key: string]: any } = {};
    for (const categorie of categories) {
      const produits = produitsParCategorie.get(categorie.id) || [];
      if (produits.length > 0) {
        result[categorie.slug] = {
          categorie,
          produits
        };
      }
    }

    return result;
  }

  /**
   * Crée un nouveau produit
   */
  static async createProduit(produitData: any): Promise<Produit> {
    logger.debug('[ProduitModel] Début createProduit avec les données:', {
      nom: produitData.nom,
      slug: produitData.slug,
      prix: produitData.prix,
      prix_promo: produitData.prix_promo,
      boutique_id: produitData.boutique_id
    });
    logger.debug('[ProduitModel] Données complètes reçues:', JSON.stringify(produitData, null, 2));
    
    // Vérifier si le slug existe déjà
    const existingProduit = await this.getProduitBySlug(produitData.slug);
    if (existingProduit) {
      logger.debug('[ProduitModel] Erreur: Un produit avec ce slug existe déjà:', produitData.slug);
      throw new Error('Un produit avec ce slug existe déjà');
    }
    
    logger.debug('[ProduitModel] Slug disponible, préparation des données du produit');

    // Gérer la conversion de en_stock (si c'est un nombre, le convertir en quantite_stock)
    let quantiteStock = produitData.stock || 0;
    let enStock = false;
    
    if (typeof produitData.en_stock === 'number') {
      logger.debug('[ProduitModel] en_stock est un nombre:', produitData.en_stock, '- conversion en quantite_stock');
      quantiteStock = produitData.en_stock;
      enStock = produitData.en_stock > 0;
    } else if (typeof produitData.en_stock === 'boolean') {
      enStock = produitData.en_stock;
    }
    
    // Gérer les variants avec le nouveau format
    let variantsData = produitData.variants;
    if (variantsData && Array.isArray(variantsData)) {
      logger.debug('[ProduitModel] Traitement des variants:', JSON.stringify(variantsData));
      
      // Calculer la quantité totale depuis les variants si disponible
      let totalQuantiteVariants = 0;
      variantsData.forEach((variant: any) => {
        if (variant.quantites && Array.isArray(variant.quantites)) {
          totalQuantiteVariants += variant.quantites.reduce((sum: number, q: number) => sum + (q || 0), 0);
        }
      });
      
      if (totalQuantiteVariants > 0) {
        logger.debug('[ProduitModel] Quantité totale calculée depuis les variants:', totalQuantiteVariants);
        quantiteStock = totalQuantiteVariants;
        enStock = true;
      }
    }

    // Gérer la logique des prix : si prix_promo existe, c'est le prix actif
    let prixFinal = produitData.prix;
    let prixOriginal = produitData.prix_original;
    
    if (produitData.prix_promo !== undefined && produitData.prix_promo !== null) {
      logger.debug('[ProduitModel] Prix promotionnel détecté:', produitData.prix_promo);
      // Le prix_promo devient le prix affiché/actif
      prixOriginal = produitData.prix; // Sauvegarder le prix normal
      prixFinal = produitData.prix_promo; // Le prix promo devient le prix actif
      logger.debug('[ProduitModel] Conversion: prix_original =', prixOriginal, ', prix =', prixFinal);
    }

    // Préparer les données avec les valeurs par défaut
    const produitWithDefaults = {
      ...produitData,
      prix: prixFinal,
      prix_original: prixOriginal,
      statut: produitData.statut || 'actif',
      en_stock: enStock,
      quantite_stock: quantiteStock,
      note_moyenne: 0,
      nombre_ventes: 0,
      nombre_avis: 0,
      date_creation: new Date().toISOString(),
      date_modification: new Date().toISOString()
    };
    
    // Supprimer prix_promo des données à insérer (pas une colonne de la base)
    delete produitWithDefaults.prix_promo;

    logger.debug('[ProduitModel] Données finales à insérer:', {
      ...produitWithDefaults,
      variants: variantsData ? 'Présent' : 'Absent'
    });
    logger.debug('[ProduitModel] Tentative d\'insertion du produit dans la base de données');
    
    const champs = filtrerColonnes(produitWithDefaults);

    if (champs.length === 0) {
      throw new Error('Erreur lors de la création du produit: aucune donnée fournie');
    }

    const colonnes = champs.map(([colonne]) => colonne);
    const placeholders = champs.map(([colonne], i) => placeholder(colonne, i + 1));

    const { rows } = await query<{ id: number }>(
      `INSERT INTO produits (${colonnes.join(', ')}, date_creation, date_modification)
       VALUES (${placeholders.join(', ')}, NOW(), NOW())
       RETURNING id`,
      champs.map(([colonne, valeur]) => preparerValeur(colonne, valeur))
    );

    logger.debug('[ProduitModel] Produit créé avec succès, ID:', rows[0].id);

    return this.getProduitById(rows[0].id) as Promise<Produit>;
  }

  /**
   * Met à jour un produit existant
   */
  static async updateProduit(id: number, produitData: any): Promise<Produit> {
    logger.debug('[ProduitModel] Début updateProduit pour le produit ID:', id);
    logger.debug('[ProduitModel] Données reçues:', produitData);
    
    // Vérifier si le produit existe
    const existingProduit = await this.getProduitById(id);
    if (!existingProduit) {
      throw new Error('Produit non trouvé');
    }

    // Si le slug est modifié, vérifier qu'il n'existe pas déjà
    if (produitData.slug && produitData.slug !== existingProduit.slug) {
      const slugExists = await this.getProduitBySlug(produitData.slug);
      if (slugExists) {
        throw new Error('Un produit avec ce slug existe déjà');
      }
    }

    // Préparer les données de mise à jour
    const updatedData: any = {
      ...produitData,
      date_modification: new Date().toISOString()
    };
    
    // Gérer la logique des prix : si prix_promo existe et n'est pas null, c'est le prix actif
    if (updatedData.prix_promo !== undefined) {
      if (updatedData.prix_promo !== null && updatedData.prix_promo !== '') {
        logger.debug('[ProduitModel] Mise à jour avec prix promotionnel:', updatedData.prix_promo);
        // Si on modifie le prix, il devient prix_original
        if (updatedData.prix !== undefined) {
          updatedData.prix_original = updatedData.prix; // Le nouveau prix devient prix_original
        } else {
          // Si prix n'est pas fourni, utiliser l'ancien prix_original ou le prix actuel
          updatedData.prix_original = existingProduit.prix_original || existingProduit.prix;
        }
        updatedData.prix = updatedData.prix_promo; // Le prix_promo devient le prix actif
        logger.debug('[ProduitModel] Conversion update: prix_original =', updatedData.prix_original, ', prix =', updatedData.prix);
      } else {
        // prix_promo est null ou vide : supprimer la promotion
        logger.debug('[ProduitModel] Suppression de la promotion (prix_promo = null)');
        updatedData.prix_original = null;
        // Si un nouveau prix est fourni, l'utiliser, sinon restaurer l'ancien prix_original
        if (updatedData.prix === undefined) {
          updatedData.prix = existingProduit.prix_original || existingProduit.prix;
          logger.debug('[ProduitModel] Restauration du prix original:', updatedData.prix);
        }
      }
      
      // Supprimer prix_promo des données à mettre à jour (pas une colonne de la base)
      delete updatedData.prix_promo;
    }
    
    // Si le champ stock est présent, le convertir en quantite_stock
    if (produitData.stock !== undefined) {
      updatedData.quantite_stock = produitData.stock;
      delete updatedData.stock;
    }
    
    // Si en_stock est un nombre, le convertir en quantite_stock et définir en_stock comme boolean
    if (typeof updatedData.en_stock === 'number') {
      updatedData.quantite_stock = updatedData.en_stock;
      updatedData.en_stock = updatedData.en_stock > 0;
    }
    
    logger.debug('[ProduitModel] Données après transformation:', updatedData);

    const champs = filtrerColonnes(updatedData);

    if (champs.length === 0) {
      const { rows } = await query<{ id: number }>(
        `UPDATE produits SET date_modification = NOW() WHERE id = $1 RETURNING id`,
        [id]
      );

      if (!rows[0]) {
        throw new Error('Erreur lors de la mise à jour du produit: produit introuvable');
      }

      return this.getProduitById(id) as Promise<Produit>;
    }

    const affectations = champs.map(([colonne], i) => `${colonne} = ${placeholder(colonne, i + 1)}`);

    const { rows } = await query<{ id: number }>(
      `UPDATE produits SET ${affectations.join(', ')}, date_modification = NOW()
       WHERE id = $${champs.length + 1}
       RETURNING id`,
      [...champs.map(([colonne, valeur]) => preparerValeur(colonne, valeur)), id]
    );

    if (!rows[0]) {
      throw new Error('Erreur lors de la mise à jour du produit: produit introuvable');
    }

    logger.debug('[ProduitModel] Produit mis à jour avec succès');

    return this.getProduitById(id) as Promise<Produit>;
  }

  /**
   * Supprime un produit
   */
  static async deleteProduit(id: number): Promise<void> {
    // Vérifier si le produit existe
    const existingProduit = await this.getProduitById(id);
    if (!existingProduit) {
      throw new Error('Produit non trouvé');
    }

    // Vérifier s'il y a des commandes associées
    const { rows: commandes } = await query<{ id: number }>(
      `SELECT id FROM commande_articles WHERE produit_id = $1 LIMIT 1`,
      [id]
    );

    if (commandes.length > 0) {
      throw new Error('Impossible de supprimer un produit qui a des commandes associées');
    }

    await query(`DELETE FROM produits WHERE id = $1`, [id]);
  }

  /**
   * Récupère les produits les plus vus d'une boutique
   */
  static async getTopVuesProduitsByBoutique(boutiqueId: number, limite: number = 5): Promise<Produit[]> {
    logger.debug(`[ProduitModel] Récupération des ${limite} produits les plus vus pour la boutique ${boutiqueId}`);
    
    const { rows } = await query<Produit>(
      `SELECT p.*,
              (SELECT row_to_json(b) FROM (
                 SELECT b.id, b.nom, b.slug, b.logo FROM boutiques b WHERE b.id = p.boutique_id
               ) b) AS boutique,
              (SELECT row_to_json(c) FROM (
                 SELECT c.id, c.nom, c.slug FROM categories c WHERE c.id = p.categorie_id
               ) c) AS categorie
       FROM produits p
       WHERE p.boutique_id = $1 AND p.statut = 'actif'
       ORDER BY p.nombre_vues DESC
       LIMIT $2`,
      [boutiqueId, limite]
    );

    logger.debug(`[ProduitModel] ${rows.length} produits trouvés`);

    return this.transformProduitsForResponse(rows);
  }

  /**
   * Récupère tous les produits d'une boutique avec pagination
   */
  static async getProduitsByBoutique(boutiqueId: number, page: number = 1, limite: number = 10, tri_par: string = 'date_creation', ordre: 'ASC' | 'DESC' = 'DESC'): Promise<{ produits: Produit[], total: number }> {
    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;
    
    // Récupérer le nombre total de produits pour cette boutique
    const { rows: total } = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM produits WHERE boutique_id = $1`,
      [boutiqueId]
    );

    // N'accepter que des valeurs connues : elles sont interpolées dans le SQL
    const colonneTri = (COLONNES_TRI as readonly string[]).includes(tri_par) ? tri_par : 'date_creation';
    const sensTri = ordre === 'ASC' ? 'ASC' : 'DESC';

    // Récupérer les produits avec pagination
    const { rows: data } = await query<Produit>(
      `SELECT p.*, ${JOINTURES}
       FROM produits p
       WHERE p.boutique_id = $1
       ORDER BY ${colonneTri} ${sensTri}
       LIMIT $2 OFFSET $3`,
      [boutiqueId, limite, offset]
    );

    const count = Number(total[0].count);

    return {
      produits: data || [],
      total: count || 0
    };
  }
}
