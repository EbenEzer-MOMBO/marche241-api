import { supabaseAdmin } from '../config/supabase';
import { Produit } from '../lib/database-types';

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
    console.log(`[ProduitModel] Mise à jour du stock pour le produit ${produitId}, quantité: ${quantite}`);
    
    try {
      // Récupérer le produit actuel pour vérifier le stock disponible
      const { data: produit, error: produitError } = await supabaseAdmin
        .from('produits')
        .select('stock')
        .eq('id', produitId)
        .single();
      
      if (produitError) {
        console.error(`[ProduitModel] Erreur lors de la récupération du produit: ${produitError.message}`);
        throw new Error(`Erreur lors de la récupération du produit: ${produitError.message}`);
      }
      
      if (!produit) {
        console.error(`[ProduitModel] Produit non trouvé: ${produitId}`);
        throw new Error(`Produit non trouvé: ${produitId}`);
      }
      
      // Vérifier si le stock est suffisant
      const nouveauStock = produit.stock - quantite;
      if (nouveauStock < 0) {
        console.error(`[ProduitModel] Stock insuffisant pour le produit ${produitId}: ${produit.stock} < ${quantite}`);
        throw new Error(`Stock insuffisant pour le produit ${produitId}`);
      }
      
      // Mettre à jour le stock
      const { data: produitMisAJour, error: updateError } = await supabaseAdmin
        .from('produits')
        .update({
          stock: nouveauStock,
          date_modification: new Date()
        })
        .eq('id', produitId)
        .select()
        .single();
      
      if (updateError) {
        console.error(`[ProduitModel] Erreur lors de la mise à jour du stock: ${updateError.message}`);
        throw new Error(`Erreur lors de la mise à jour du stock: ${updateError.message}`);
      }
      
      console.log(`[ProduitModel] Stock mis à jour pour le produit ${produitId}: ${produit.stock} -> ${nouveauStock}`);
      return produitMisAJour;
    } catch (error) {
      console.error(`[ProduitModel] Exception dans updateStock:`, error);
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
  static async updateStockWithVariants(produitId: number, quantite: number, variantsSelectionnes: any): Promise<Produit> {
    console.log(`[ProduitModel] Mise à jour du stock avec variants pour le produit ${produitId}`, {
      quantite,
      variantsSelectionnes
    });
    
    try {
      // Récupérer le produit avec ses variants
      const { data: produit, error: produitError } = await supabaseAdmin
        .from('produits')
        .select('id, variants, quantite_stock')
        .eq('id', produitId)
        .single();
      
      if (produitError || !produit) {
        console.error(`[ProduitModel] Erreur lors de la récupération du produit: ${produitError?.message}`);
        throw new Error(`Produit non trouvé: ${produitId}`);
      }

      if (!produit.variants) {
        console.log(`[ProduitModel] Produit sans variants, mise à jour du stock global`);
        return await this.updateStock(produitId, quantite);
      }

      console.log(`[ProduitModel] Variants actuels:`, JSON.stringify(produit.variants, null, 2));

      const variantsData = produit.variants as any;
      let variantTrouve = false;
      let nouveauxVariantsData: any;

      // Détecter le nouveau format: { variants: [...], options: [...] }
      if (variantsData.variants && Array.isArray(variantsData.variants)) {
        console.log(`[ProduitModel] Nouveau format détecté`);
        
        // Nouveau format
        nouveauxVariantsData = { ...variantsData };
        const nouveauxVariants = [...variantsData.variants];
        
        // Extraire le nom du variant sélectionné
        const nomVariantSelectionne = variantsSelectionnes.variant?.nom || null;
        
        if (nomVariantSelectionne) {
          console.log(`[ProduitModel] Recherche du variant: ${nomVariantSelectionne}`);
          
          for (let i = 0; i < nouveauxVariants.length; i++) {
            if (nouveauxVariants[i].nom === nomVariantSelectionne) {
              const quantiteActuelle = nouveauxVariants[i].quantite || 0;
              const nouvelleQuantite = quantiteActuelle - quantite;
              
              if (nouvelleQuantite < 0) {
                console.error(`[ProduitModel] Stock insuffisant pour le variant ${nomVariantSelectionne}`);
                throw new Error(`Stock insuffisant pour le variant ${nomVariantSelectionne} (disponible: ${quantiteActuelle}, demandé: ${quantite})`);
              }
              
              nouveauxVariants[i].quantite = nouvelleQuantite;
              console.log(`[ProduitModel] Stock du variant ${nomVariantSelectionne} mis à jour: ${quantiteActuelle} -> ${nouvelleQuantite}`);
              variantTrouve = true;
              break;
            }
          }
        }
        
        nouveauxVariantsData.variants = nouveauxVariants;
        
        // Calculer la quantité totale
        const quantiteTotale = nouveauxVariants.reduce((sum, v) => sum + (v.quantite || 0), 0);
        console.log(`[ProduitModel] Nouvelle quantité totale calculée: ${quantiteTotale}`);
        
        // Mettre à jour le produit
        const { data: produitMisAJour, error: updateError } = await supabaseAdmin
          .from('produits')
          .update({
            variants: nouveauxVariantsData,
            quantite_stock: quantiteTotale,
            en_stock: quantiteTotale > 0,
            date_modification: new Date()
          })
          .eq('id', produitId)
          .select()
          .single();
        
        if (updateError) {
          console.error(`[ProduitModel] Erreur lors de la mise à jour: ${updateError.message}`);
          throw new Error(`Erreur lors de la mise à jour du stock: ${updateError.message}`);
        }

        console.log(`[ProduitModel] Stock avec variants mis à jour avec succès (nouveau format)`);
        return produitMisAJour;
        
      } else if (Array.isArray(variantsData)) {
        // Ancien format: [{ "nom": "Type", "options": ["A", "B"], "quantites": [8, 4] }]
        console.log(`[ProduitModel] Ancien format détecté`);
        
        let nouveauxVariants = [...variantsData];

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
                  console.error(`[ProduitModel] Stock insuffisant pour le variant ${nomVariant}:${valeurSelectionnee}`);
                  throw new Error(`Stock insuffisant pour le variant ${nomVariant}: ${valeurSelectionnee} (disponible: ${quantiteActuelle}, demandé: ${quantite})`);
                }
                
                nouveauxVariants[i].quantites[indexOption] = nouvelleQuantite;
                console.log(`[ProduitModel] Stock du variant ${nomVariant}:${valeurSelectionnee} mis à jour: ${quantiteActuelle} -> ${nouvelleQuantite}`);
                variantTrouve = true;
              }
            }
          }
        }

        // Calculer la nouvelle quantité totale en stock
        let quantiteTotale = 0;
        for (const variant of nouveauxVariants) {
          if (variant.quantites && Array.isArray(variant.quantites)) {
            quantiteTotale += variant.quantites.reduce((sum: number, q: number) => sum + (q || 0), 0);
          }
        }

        console.log(`[ProduitModel] Nouvelle quantité totale calculée: ${quantiteTotale}`);

        // Mettre à jour le produit avec les nouveaux variants et la quantité totale
        const { data: produitMisAJour, error: updateError } = await supabaseAdmin
          .from('produits')
          .update({
            variants: nouveauxVariants,
            quantite_stock: quantiteTotale,
            en_stock: quantiteTotale > 0,
            date_modification: new Date()
          })
          .eq('id', produitId)
          .select()
          .single();
        
        if (updateError) {
          console.error(`[ProduitModel] Erreur lors de la mise à jour: ${updateError.message}`);
          throw new Error(`Erreur lors de la mise à jour du stock: ${updateError.message}`);
        }

        console.log(`[ProduitModel] Stock avec variants mis à jour avec succès (ancien format)`);
        return produitMisAJour;
      }

      if (!variantTrouve) {
        console.warn(`[ProduitModel] Aucun variant correspondant trouvé, mise à jour du stock global`);
        return await this.updateStock(produitId, quantite);
      }

      throw new Error('Format de variants non reconnu');
    } catch (error) {
      console.error(`[ProduitModel] Exception dans updateStockWithVariants:`, error);
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
    const { count, error: countError } = await supabaseAdmin
      .from('produits')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      throw new Error(`Erreur lors du comptage des produits: ${countError.message}`);
    }
    
    // Récupérer les produits avec pagination
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .order(tri_par, { ascending: ordre === 'ASC' })
      .range(offset, offset + limite - 1);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des produits: ${error.message}`);
    }
    
    return {
      produits: data || [],
      total: count || 0
    };
  }

  /**
   * Récupère un produit par son ID
   */
  static async getProduitById(id: number): Promise<Produit | null> {
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .eq('id', id)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération du produit: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère un produit par son slug
   */
  static async getProduitBySlug(slug: string): Promise<Produit | null> {
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .eq('slug', slug)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw new Error(`Erreur lors de la récupération du produit: ${error.message}`);
    }
    
    return data;
  }

  /**
   * Récupère les produits par catégorie
   */
  static async getProduitsByCategorie(categorieId: number, limite: number = 10): Promise<Produit[]> {
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .eq('categorie_id', categorieId)
      .eq('statut', 'actif')
      .order('note_moyenne', { ascending: false })
      .limit(limite);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des produits par catégorie: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Récupère les produits les plus importants par catégorie
   * Les produits sont triés par note moyenne et nombre de ventes
   * Ne renvoie que les catégories avec des produits, limité à 3 catégories maximum
   * @param limite Nombre de produits à récupérer par catégorie
   * @param boutiqueId ID de la boutique (optionnel)
   */
  static async getTopProduitsByCategories(limite: number = 4, boutiqueId?: number): Promise<{ [key: string]: any }> {
    console.log('[ProduitModel] Début getTopProduitsByCategories - limite:', limite, 'boutiqueId:', boutiqueId);
    // Récupérer toutes les catégories
    console.log('[ProduitModel] Récupération des catégories...');
    
    // D'abord, vérifions si la boutique a des produits et dans quelles catégories
    let categoriesAvecProduits;
    if (boutiqueId) {
      console.log(`[ProduitModel] Recherche des catégories avec des produits pour la boutique ${boutiqueId}`);
      const { data: produitsBoutique, error: produitError } = await supabaseAdmin
        .from('produits')
        .select('categorie_id')
        .eq('boutique_id', boutiqueId)
        .eq('statut', 'actif');

      if (produitError) {
        console.error('[ProduitModel] Erreur lors de la recherche des produits:', produitError.message);
      } else {
        categoriesAvecProduits = new Set(produitsBoutique?.map(p => p.categorie_id));
        console.log('[ProduitModel] Catégories avec des produits:', Array.from(categoriesAvecProduits));
      }
    }

    // Récupérer les catégories
    let { data: categories, error: categoriesError } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('statut', 'active')
      .order('ordre_affichage', { ascending: true });
    
    console.log('[ProduitModel] Toutes les catégories trouvées:', categories?.map(c => ({ id: c.id, nom: c.nom, statut: c.statut })));
    
    // Si on a une boutique spécifique, filtrer les catégories qui ont des produits
    if (boutiqueId && categoriesAvecProduits && categories) {
      const categoriesFiltrees = categories.filter(c => categoriesAvecProduits.has(c.id));
      console.log('[ProduitModel] Catégories filtrées avec des produits:', categoriesFiltrees.map(c => ({ id: c.id, nom: c.nom })));
      categories = categoriesFiltrees;
    }

    if (categoriesError) {
      throw new Error(`Erreur lors de la récupération des catégories: ${categoriesError.message}`);
    }
    
    if (!categories || categories.length === 0) {
      return {};
    }
    
    // Récupérer les produits pour chaque catégorie
    const result: { [key: string]: any } = {};
    
    for (const categorie of categories) {
      // Construire la requête
      console.log(`[ProduitModel] Construction de la requête pour catégorie ${categorie.id} (${categorie.nom})`);
      let query = supabaseAdmin
        .from('produits')
        .select(`
          *,
          boutique:boutique_id(id, nom, slug, logo),
          categorie:categorie_id(id, nom, slug)
        `)
        .eq('categorie_id', categorie.id)
        .eq('statut', 'actif');

      // Ajouter le filtre par boutique si spécifié
      if (boutiqueId) {
        console.log(`[ProduitModel] Ajout du filtre boutique_id = ${boutiqueId}`);
        query = query.eq('boutique_id', boutiqueId);
      }

      // Ajouter le tri et la limite
      query = query
        .order('note_moyenne', { ascending: false })
        .order('nombre_ventes', { ascending: false })
        .limit(limite);
      
      
      // Exécuter la requête
      const { data: produits, error: produitsError } = await query;
      
      console.log(`[ProduitModel] Résultats pour catégorie ${categorie.id} (${categorie.nom}):`, {
        produits: produits ? produits.length : 0,
        error: produitsError?.message || 'aucun'
      });

      if (produitsError) {
        console.error(`[ProduitModel] Erreur lors de la récupération des produits pour la catégorie ${categorie.id}: ${produitsError.message}`);
        continue;
      }
      
      // Ne pas inclure les catégories sans produits
      if (produits && produits.length > 0) {
        console.log(`[ProduitModel] Ajout de la catégorie ${categorie.nom} avec ${produits.length} produits`);
        result[categorie.slug] = {
          categorie,
          produits: produits
        };
      } else {
        console.log(`[ProduitModel] Catégorie ${categorie.nom} ignorée car aucun produit trouvé`);
      }
    }
    
    console.log('[ProduitModel] Résultat final:', {
      nombreCategories: Object.keys(result).length,
      categories: Object.keys(result).map(slug => ({
        slug,
        nom: result[slug].categorie.nom,
        nombreProduits: result[slug].produits.length
      }))
    });
    return result;
  }

  /**
   * Crée un nouveau produit
   */
  static async createProduit(produitData: any): Promise<Produit> {
    console.log('[ProduitModel] Début createProduit avec les données:', {
      nom: produitData.nom,
      slug: produitData.slug,
      prix: produitData.prix,
      prix_promo: produitData.prix_promo,
      boutique_id: produitData.boutique_id
    });
    console.log('[ProduitModel] Données complètes reçues:', JSON.stringify(produitData, null, 2));
    
    // Vérifier si le slug existe déjà
    const existingProduit = await this.getProduitBySlug(produitData.slug);
    if (existingProduit) {
      console.log('[ProduitModel] Erreur: Un produit avec ce slug existe déjà:', produitData.slug);
      throw new Error('Un produit avec ce slug existe déjà');
    }
    
    console.log('[ProduitModel] Slug disponible, préparation des données du produit');

    // Gérer la conversion de en_stock (si c'est un nombre, le convertir en quantite_stock)
    let quantiteStock = produitData.stock || 0;
    let enStock = false;
    
    if (typeof produitData.en_stock === 'number') {
      console.log('[ProduitModel] en_stock est un nombre:', produitData.en_stock, '- conversion en quantite_stock');
      quantiteStock = produitData.en_stock;
      enStock = produitData.en_stock > 0;
    } else if (typeof produitData.en_stock === 'boolean') {
      enStock = produitData.en_stock;
    }
    
    // Gérer les variants avec le nouveau format
    let variantsData = produitData.variants;
    if (variantsData && Array.isArray(variantsData)) {
      console.log('[ProduitModel] Traitement des variants:', JSON.stringify(variantsData));
      
      // Calculer la quantité totale depuis les variants si disponible
      let totalQuantiteVariants = 0;
      variantsData.forEach((variant: any) => {
        if (variant.quantites && Array.isArray(variant.quantites)) {
          totalQuantiteVariants += variant.quantites.reduce((sum: number, q: number) => sum + (q || 0), 0);
        }
      });
      
      if (totalQuantiteVariants > 0) {
        console.log('[ProduitModel] Quantité totale calculée depuis les variants:', totalQuantiteVariants);
        quantiteStock = totalQuantiteVariants;
        enStock = true;
      }
    }

    // Gérer la logique des prix : si prix_promo existe, c'est le prix actif
    let prixFinal = produitData.prix;
    let prixOriginal = produitData.prix_original;
    
    if (produitData.prix_promo !== undefined && produitData.prix_promo !== null) {
      console.log('[ProduitModel] Prix promotionnel détecté:', produitData.prix_promo);
      // Le prix_promo devient le prix affiché/actif
      prixOriginal = produitData.prix; // Sauvegarder le prix normal
      prixFinal = produitData.prix_promo; // Le prix promo devient le prix actif
      console.log('[ProduitModel] Conversion: prix_original =', prixOriginal, ', prix =', prixFinal);
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

    console.log('[ProduitModel] Données finales à insérer:', {
      ...produitWithDefaults,
      variants: variantsData ? 'Présent' : 'Absent'
    });
    console.log('[ProduitModel] Tentative d\'insertion du produit dans la base de données');
    
    const { data, error } = await supabaseAdmin
      .from('produits')
      .insert(produitWithDefaults)
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .single();

    if (error) {
      console.log('[ProduitModel] Erreur lors de l\'insertion du produit:', error.message);
      throw new Error(`Erreur lors de la création du produit: ${error.message}`);
    }
    
    console.log('[ProduitModel] Produit créé avec succès, ID:', data.id);

    return data as Produit;
  }

  /**
   * Met à jour un produit existant
   */
  static async updateProduit(id: number, produitData: any): Promise<Produit> {
    console.log('[ProduitModel] Début updateProduit pour le produit ID:', id);
    console.log('[ProduitModel] Données reçues:', produitData);
    
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
        console.log('[ProduitModel] Mise à jour avec prix promotionnel:', updatedData.prix_promo);
        // Si on modifie le prix, il devient prix_original
        if (updatedData.prix !== undefined) {
          updatedData.prix_original = updatedData.prix; // Le nouveau prix devient prix_original
        } else {
          // Si prix n'est pas fourni, utiliser l'ancien prix_original ou le prix actuel
          updatedData.prix_original = existingProduit.prix_original || existingProduit.prix;
        }
        updatedData.prix = updatedData.prix_promo; // Le prix_promo devient le prix actif
        console.log('[ProduitModel] Conversion update: prix_original =', updatedData.prix_original, ', prix =', updatedData.prix);
      } else {
        // prix_promo est null ou vide : supprimer la promotion
        console.log('[ProduitModel] Suppression de la promotion (prix_promo = null)');
        updatedData.prix_original = null;
        // Si un nouveau prix est fourni, l'utiliser, sinon restaurer l'ancien prix_original
        if (updatedData.prix === undefined) {
          updatedData.prix = existingProduit.prix_original || existingProduit.prix;
          console.log('[ProduitModel] Restauration du prix original:', updatedData.prix);
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
    
    console.log('[ProduitModel] Données après transformation:', updatedData);

    const { data, error } = await supabaseAdmin
      .from('produits')
      .update(updatedData)
      .eq('id', id)
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .single();

    if (error) {
      console.log('[ProduitModel] Erreur lors de la mise à jour:', error.message);
      throw new Error(`Erreur lors de la mise à jour du produit: ${error.message}`);
    }

    console.log('[ProduitModel] Produit mis à jour avec succès');
    return data as Produit;
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
    const { data: commandes } = await supabaseAdmin
      .from('commande_produits')
      .select('id')
      .eq('produit_id', id);

    if (commandes && commandes.length > 0) {
      throw new Error('Impossible de supprimer un produit qui a des commandes associées');
    }

    const { error } = await supabaseAdmin
      .from('produits')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Erreur lors de la suppression du produit: ${error.message}`);
    }
  }

  /**
   * Récupère les produits les plus vus d'une boutique
   */
  static async getTopVuesProduitsByBoutique(boutiqueId: number, limite: number = 5): Promise<Produit[]> {
    console.log(`[ProduitModel] Récupération des ${limite} produits les plus vus pour la boutique ${boutiqueId}`);
    
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(id, nom, slug, logo),
        categorie:categorie_id(id, nom, slug)
      `)
      .eq('boutique_id', boutiqueId)
      .eq('statut', 'actif')
      .order('nombre_vues', { ascending: false })
      .limit(limite);
    
    if (error) {
      console.error(`[ProduitModel] Erreur lors de la récupération des produits les plus vus:`, error.message);
      throw new Error(`Erreur lors de la récupération des produits les plus vus: ${error.message}`);
    }
    
    console.log(`[ProduitModel] ${data?.length || 0} produits trouvés`);
    return this.transformProduitsForResponse(data || []);
  }

  /**
   * Récupère tous les produits d'une boutique avec pagination
   */
  static async getProduitsByBoutique(boutiqueId: number, page: number = 1, limite: number = 10, tri_par: string = 'date_creation', ordre: 'ASC' | 'DESC' = 'DESC'): Promise<{ produits: Produit[], total: number }> {
    // Calculer l'offset pour la pagination
    const offset = (page - 1) * limite;
    
    // Récupérer le nombre total de produits pour cette boutique
    const { count, error: countError } = await supabaseAdmin
      .from('produits')
      .select('*', { count: 'exact', head: true })
      .eq('boutique_id', boutiqueId);
    
    if (countError) {
      throw new Error(`Erreur lors du comptage des produits: ${countError.message}`);
    }
    
    // Récupérer les produits avec pagination
    const { data, error } = await supabaseAdmin
      .from('produits')
      .select(`
        *,
        boutique:boutique_id(*),
        categorie:categorie_id(*)
      `)
      .eq('boutique_id', boutiqueId)
      .order(tri_par, { ascending: ordre === 'ASC' })
      .range(offset, offset + limite - 1);
    
    if (error) {
      throw new Error(`Erreur lors de la récupération des produits de la boutique: ${error.message}`);
    }
    
    return {
      produits: data || [],
      total: count || 0
    };
  }
}
