import { Request, Response } from 'express';
import { ProduitModel } from '../models/produit.model';
import { VueModel } from '../models/vue.model';
import { BoutiqueModel } from '../models/boutique.model';
import { logger } from '../utils/logger';
import { doitEnregistrerLaVue, getClientIp } from '../utils/view-tracking';
import { FiltresListeProduits } from '../models/produit.model';
import { BilletModel } from '../models/billet.model';
import { VendeurModel } from '../models/vendeur.model';
import { CategorieModel } from '../models/categorie.model';
import { EmailService } from '../services/email.service';
import {
  ErreurModificationEvenement,
  isProduitEvenement,
  MESSAGE_PUBLICATION_RESERVEE_ADMIN,
  statutCreationEvenementVendeur,
  transitionStatutEvenementVendeurAutorisee,
  verifierDatesEvenement,
  verifierModificationEvenement
} from '../utils/produit-evenement';
import { notifier } from '../services/telegram.service';

/** Notification Telegram de l'équipe : un produit (événement) attend la validation (sans attente). */
function notifierProduitAValider(produit: { id: number; nom: string; boutique_id: number }): void {
  void (async () => {
    const boutique = await BoutiqueModel.getBoutiqueById(produit.boutique_id).catch(() => null);
    await notifier('produit_a_valider', {
      titre: 'Produit en attente de validation',
      lignes: [produit.nom, `Boutique : ${boutique?.nom ?? `#${produit.boutique_id}`}`],
      lien: '/evenements'
    });
  })().catch(() => undefined);
}

export type ActionModerationEvenement = 'publier' | 'depublier' | 'refuser';

const STATUT_APRES_MODERATION: Record<ActionModerationEvenement, string> = {
  publier: 'actif',
  depublier: 'inactif',
  refuser: 'brouillon'
};

const MESSAGE_APRES_MODERATION: Record<ActionModerationEvenement, string> = {
  publier: 'Événement publié',
  depublier: 'Événement dépublié',
  refuser: 'Publication refusée, l’événement est repassé en brouillon'
};

/**
 * Même définition que la liste publique (CONDITION_EVENEMENT) : variants.type = 'evenement'
 * ou catégorie globale « evenements ». Sert à soumettre tout événement à la modération.
 */
async function estEvenementModere(produit: { variants?: unknown; categorie_id?: number | null }): Promise<boolean> {
  if (isProduitEvenement(produit)) return true;
  if (!produit.categorie_id) return false;
  const categorie = await CategorieModel.getCategorieById(Number(produit.categorie_id));
  return categorie?.slug === 'evenements';
}

/** Email au vendeur après publication ou refus ; un échec d'envoi ne bloque pas la modération. */
function notifierModerationEvenement(produit: any, action: ActionModerationEvenement, motif?: string): void {
  if (action === 'depublier') return;

  void (async () => {
    const vendeurId = produit.boutique?.vendeur_id;
    const boutiqueSlug = produit.boutique?.slug;
    const vendeur = vendeurId ? await VendeurModel.getVendeurById(vendeurId) : null;
    if (!vendeur?.email || !boutiqueSlug) {
      logger.warn(`[ProduitController] Pas d'email vendeur pour notifier la modération de l'événement ${produit.id}`);
      return;
    }

    if (action === 'publier') {
      const dateDebut = produit.variants?.meta?.date_debut;
      const date = dateDebut ? new Date(dateDebut) : null;
      await EmailService.envoyerEvenementPublie(vendeur.email, {
        evenementNom: produit.nom,
        boutiqueSlug,
        produitId: produit.id,
        dateEvenement:
          date && !Number.isNaN(date.getTime())
            ? date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : undefined
      });
    } else {
      await EmailService.envoyerEvenementRefuse(vendeur.email, {
        evenementNom: produit.nom,
        motif: motif?.trim() || 'Informations à compléter',
        boutiqueSlug,
        produitId: produit.id
      });
    }
  })().catch((error) => {
    logger.error(`[ProduitController] Échec email de modération de l'événement ${produit.id}:`, error);
  });
}

/** Réponse 400 au format VALIDATION_ERROR (docs/ERREURS_VALIDATION.md) pour les règles événement. */
function repondreErreursEvenement(res: Response, erreurs: ErreurModificationEvenement[]): void {
  res.status(400).json({
    success: false,
    code: 'VALIDATION_ERROR',
    message: erreurs.map((e) => e.message).join(' · '),
    errors: erreurs
  });
}

function extraireFiltresListe(query: Record<string, unknown>): FiltresListeProduits {
  const q = typeof query.q === 'string' ? query.q : undefined;
  const prixMin = query.prix_min !== undefined ? Number(query.prix_min) : undefined;
  const prixMax = query.prix_max !== undefined ? Number(query.prix_max) : undefined;
  const communeId = query.commune_id !== undefined ? Number(query.commune_id) : undefined;
  const categorieId = query.categorie_id !== undefined ? Number(query.categorie_id) : undefined;
  const typeVente = query.type_vente === 'evenement' || query.type_vente === 'autre' ? query.type_vente : undefined;

  return {
    q,
    prix_min: prixMin !== undefined && !Number.isNaN(prixMin) ? prixMin : undefined,
    prix_max: prixMax !== undefined && !Number.isNaN(prixMax) ? prixMax : undefined,
    commune_id: communeId !== undefined && !Number.isNaN(communeId) ? communeId : undefined,
    categorie_id: categorieId !== undefined && !Number.isNaN(categorieId) ? categorieId : undefined,
    type_vente: typeVente
  };
}

/**
 * Un produit désactivé ne doit rester visible que pour le vendeur propriétaire
 * de sa boutique (accès admin), jamais pour un visiteur public.
 */
function estProprietaireDuProduit(req: Request, produit: any): boolean {
  return !!(req.vendeur && produit.boutique && produit.boutique.vendeur_id === req.vendeur.id);
}

function vendeurIdDuProduit(produit: { boutique?: { vendeur_id?: number } }): number | undefined {
  return produit.boutique?.vendeur_id;
}

function enregistrerVueProduit(req: Request, produit: { id: number }): void {
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || undefined;
  const referer = req.headers['referer'] || undefined;

  VueModel.enregistrerVue('produit', produit.id, clientIp, userAgent, referer)
    .then((nouvelleVue) => {
      if (nouvelleVue) {
        logger.debug(`[ProduitController] Nouvelle vue enregistrée pour produit ${produit.id}`);
      }
    })
    .catch((err) => logger.error('[ProduitController] Erreur tracking vue produit:', err));
}

export class ProduitController {
  /**
   * Récupère tous les produits avec pagination
   */
  static async getAllProduits(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      const page = parseInt(query.page as string) || 1;
      const limite = parseInt(query.limite as string) || 10;
      const tri_par = (query.tri_par as string) || 'date_creation';
      const ordre = ((query.ordre as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
      
      const filtres = extraireFiltresListe(query);
      const { produits, total } = await ProduitModel.getAllProduits(page, limite, tri_par, ordre, true, filtres);
      
      res.status(200).json({
        success: true,
        donnees: produits,
        total,
        page,
        limite,
        total_pages: Math.ceil(total / limite)
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits',
        error: error.message
      });
    }
  }

  /**
   * Récupère un produit par son ID
   */
  static async getProduitById(req: Request, res: Response): Promise<void> {
    try {
      const idOrSlug = req.params.id;
      let produit;
      
      // Vérifier si l'ID est un nombre ou une chaîne
      const id = parseInt(idOrSlug);
      
      if (!isNaN(id)) {
        // Si c'est un nombre, rechercher par ID
        produit = await ProduitModel.getProduitById(id);
      } else {
        // Sinon, rechercher par slug
        produit = await ProduitModel.getProduitBySlug(idOrSlug);
      }
      
      if (!produit || (produit.statut !== 'actif' && !estProprietaireDuProduit(req, produit))) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      if (doitEnregistrerLaVue(req, vendeurIdDuProduit(produit))) {
        enregistrerVueProduit(req, produit);
      }

      res.status(200).json({
        success: true,
        produit
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du produit',
        error: error.message
      });
    }
  }

  /**
   * Récupère un produit par son slug
   */
  static async getProduitBySlug(req: Request, res: Response): Promise<void> {
    try {
      const { slug } = req.params;
      
      const produit = await ProduitModel.getProduitBySlug(slug);

      if (!produit || (produit.statut !== 'actif' && !estProprietaireDuProduit(req, produit))) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      if (doitEnregistrerLaVue(req, vendeurIdDuProduit(produit))) {
        enregistrerVueProduit(req, produit);
      }

      res.status(200).json({
        success: true,
        produit
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du produit',
        error: error.message
      });
    }
  }

  /**
   * Récupère les produits par catégorie
   */
  static async getProduitsByCategorie(req: Request, res: Response): Promise<void> {
    try {
      const categorieId = parseInt(req.params.categorieId);
      
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      const limite = parseInt(query.limite as string) || 10;
      
      if (isNaN(categorieId)) {
        res.status(400).json({
          success: false,
          message: 'ID de catégorie invalide'
        });
        return;
      }
      
      const produits = await ProduitModel.getProduitsByCategorie(categorieId, limite);
      
      res.status(200).json({
        success: true,
        produits
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits par catégorie',
        error: error.message
      });
    }
  }

  /**
   * Récupère les produits les plus importants par catégorie
   */
  static async getTopProduitsByCategories(req: Request, res: Response): Promise<void> {
    try {
      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      const limite = parseInt(query.limite as string) || 4;
      const boutiqueId = query.boutique_id ? parseInt(query.boutique_id as string) : undefined;
      
      // Vérifier si boutiqueId est un nombre valide
      if (query.boutique_id && isNaN(boutiqueId as number)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      const produitsByCategories = await ProduitModel.getTopProduitsByCategories(limite, boutiqueId);
      
      res.status(200).json({
        success: true,
        categories: produitsByCategories
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits par catégorie',
        error: error.message
      });
    }
  }

  /**
   * Crée un nouveau produit
   */
  static async createProduit(req: Request, res: Response): Promise<void> {
    try {
      logger.debug('[ProduitController] Début createProduit');
      logger.debug('[ProduitController] Headers:', req.headers);
      logger.debug('[ProduitController] Body:', req.body);
      
      const produitData = req.body;

      // Vérifier que l'utilisateur est authentifié (vendeur JWT ou requête de service admin)
      const user = (req as any).user;
      const isAdmin = (req as any).isAdmin;
      if (!user && !isAdmin) {
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Validation des champs requis
      logger.debug('[ProduitController] Vérification des champs requis:', {
        nom: !!produitData.nom,
        slug: !!produitData.slug,
        prix: !!produitData.prix,
        boutique_id: !!produitData.boutique_id
      });

      if (!produitData.nom || !produitData.slug || !produitData.prix || !produitData.boutique_id) {
        res.status(400).json({
          success: false,
          message: 'Les champs nom, slug, prix et boutique_id sont obligatoires'
        });
        return;
      }

      // Vérifier que l'utilisateur est propriétaire de la boutique (sauf requête de service admin)
      if (!isAdmin) {
        const isOwner = await BoutiqueModel.isOwnedByVendeur(produitData.boutique_id, user.id);
        if (!isOwner) {
          res.status(403).json({
            success: false,
            message: 'Vous n\'êtes pas autorisé à créer des produits pour cette boutique'
          });
          return;
        }
      }

      if (isProduitEvenement(produitData)) {
        const erreurs = verifierDatesEvenement(produitData.variants, { creation: true });
        if (erreurs.length > 0) {
          repondreErreursEvenement(res, erreurs);
          return;
        }
      }

      // La mise en ligne d'un événement est validée par l'équipe Marché 241
      if (!isAdmin && (await estEvenementModere(produitData))) {
        produitData.statut = statutCreationEvenementVendeur(produitData.statut);
      }

      logger.debug('[ProduitController] Tentative de création du produit avec les données:', {
        nom: produitData.nom,
        slug: produitData.slug,
        prix: produitData.prix,
        boutique_id: produitData.boutique_id,
        // Autres champs non sensibles
        categorie_id: produitData.categorie_id,
        description: produitData.description ? 'Présent' : 'Absent'
      });
      
      const produit = await ProduitModel.createProduit(produitData);
      logger.debug('[ProduitController] Produit créé avec succès:', produit.id);
      if (produit.statut === 'en_attente_validation') notifierProduitAValider(produit);
      
      res.status(201).json({
        success: true,
        message: 'Produit créé avec succès',
        produit
      });
    } catch (error: any) {
      if (error.message.includes('slug existe déjà')) {
        res.status(409).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la création du produit',
          error: error.message
        });
      }
    }
  }

  /**
   * Met à jour un produit existant
   */
  static async updateProduit(req: Request, res: Response): Promise<void> {
    try {
      logger.debug('[ProduitController] Début updateProduit');
      logger.debug('[ProduitController] Params:', req.params);
      const id = parseInt(req.params.id);
      logger.debug('[ProduitController] ID extrait:', id);
      
      if (isNaN(id)) {
        logger.debug('[ProduitController] ID de produit invalide:', req.params.id);
        res.status(400).json({
          success: false,
          message: 'ID de produit invalide'
        });
        return;
      }

      const produitData = req.body;

      // Vérifier que l'utilisateur est authentifié (vendeur JWT ou requête de service admin)
      const user = (req as any).user;
      const isAdmin = (req as any).isAdmin;
      logger.debug('[ProduitController] Utilisateur extrait:', user ? user.email || user.id : user);
      if (!user && !isAdmin) {
        logger.debug('[ProduitController] Authentification requise');
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Récupérer le produit existant pour vérifier les permissions
      const existingProduit = await ProduitModel.getProduitById(id);
      logger.debug('[ProduitController] Produit existant:', existingProduit ? existingProduit.id : existingProduit);
      if (!existingProduit) {
        logger.debug('[ProduitController] Produit non trouvé pour l\'ID:', id);
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      // Vérifier que l'utilisateur est propriétaire de la boutique du produit (sauf requête de service admin)
      if (!isAdmin) {
        const isOwner = await BoutiqueModel.isOwnedByVendeur(existingProduit.boutique_id, user.id);
        if (!isOwner) {
          res.status(403).json({
            success: false,
            message: 'Vous n\'êtes pas autorisé à modifier ce produit'
          });
          return;
        }
      }

      if (!isAdmin) {
        const etaitEvenement = await estEvenementModere(existingProduit);
        const seraEvenement = await estEvenementModere({
          variants: produitData.variants !== undefined ? produitData.variants : existingProduit.variants,
          categorie_id: produitData.categorie_id !== undefined ? produitData.categorie_id : existingProduit.categorie_id
        });

        if (!etaitEvenement && seraEvenement) {
          // Un produit qui devient un événement repasse par la modération, comme à la création
          produitData.statut = statutCreationEvenementVendeur(produitData.statut);
        } else if (
          etaitEvenement &&
          !transitionStatutEvenementVendeurAutorisee(existingProduit.statut, produitData.statut)
        ) {
          res.status(403).json({
            success: false,
            code: 'PUBLICATION_RESERVEE_ADMIN',
            message: MESSAGE_PUBLICATION_RESERVEE_ADMIN
          });
          return;
        }
      }

      if (isProduitEvenement(existingProduit)) {
        const ventesParType = await BilletModel.ventesParType(id);
        const erreurs = [
          ...verifierModificationEvenement(existingProduit, produitData, ventesParType),
          ...(produitData.variants !== undefined
            ? verifierDatesEvenement(produitData.variants, { creation: false })
            : [])
        ];
        if (erreurs.length > 0) {
          repondreErreursEvenement(res, erreurs);
          return;
        }
      }

      logger.debug('[ProduitController] Données envoyées à updateProduit:', produitData);
      const produit = await ProduitModel.updateProduit(id, produitData);
      logger.debug('[ProduitController] Produit mis à jour avec succès:', produit.id);
      if (produit.statut === 'en_attente_validation' && existingProduit.statut !== 'en_attente_validation') {
        notifierProduitAValider(produit);
      }
      
      res.status(200).json({
        success: true,
        message: 'Produit mis à jour avec succès',
        produit
      });
    } catch (error: any) {
      logger.debug('[ProduitController] Erreur dans updateProduit:', error.message);
      if (error.message.includes('slug existe déjà')) {
        res.status(409).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('non trouvé')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la mise à jour du produit',
          error: error.message
        });
      }
    }
  }

  /**
   * Publie, dépublie ou refuse un événement (équipe Marché 241 uniquement, clé de service).
   * Le vendeur propriétaire est prévenu par email à la publication et au refus.
   */
  static async modererEvenement(req: Request, res: Response): Promise<void> {
    try {
      if (!(req as any).isAdmin) {
        res.status(403).json({
          success: false,
          code: 'PUBLICATION_RESERVEE_ADMIN',
          message: 'Action réservée à l’équipe Marché 241'
        });
        return;
      }

      const id = parseInt(req.params.id);
      const { action, motif } = req.body as { action: ActionModerationEvenement; motif?: string };

      const existingProduit = await ProduitModel.getProduitById(id);
      if (!existingProduit || !(await estEvenementModere(existingProduit))) {
        res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
        return;
      }

      const produit = await ProduitModel.updateProduit(id, { statut: STATUT_APRES_MODERATION[action] } as any);
      notifierModerationEvenement(existingProduit, action, motif);

      res.status(200).json({
        success: true,
        message: MESSAGE_APRES_MODERATION[action],
        produit
      });
    } catch (error: any) {
      logger.error('[ProduitController] Erreur dans modererEvenement:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modération de l’événement',
        error: error.message
      });
    }
  }

  /**
   * Supprime un produit
   */
  static async deleteProduit(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de produit invalide'
        });
        return;
      }

      // Vérifier que l'utilisateur est authentifié
      const user = (req as any).user;
      if (!user) {
        res.status(401).json({
          success: false,
          message: 'Authentification requise'
        });
        return;
      }

      // Récupérer le produit existant pour vérifier les permissions
      const existingProduit = await ProduitModel.getProduitById(id);
      if (!existingProduit) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      // Vérifier que l'utilisateur est propriétaire de la boutique du produit
      const isOwner = await BoutiqueModel.isOwnedByVendeur(existingProduit.boutique_id, user.id);
      if (!isOwner && !(req as any).isAdmin) {
        res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à supprimer ce produit'
        });
        return;
      }

      await ProduitModel.deleteProduit(id);
      
      res.status(200).json({
        success: true,
        message: 'Produit supprimé avec succès'
      });
    } catch (error: any) {
      if (error.message.includes('non trouvé')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
      } else if (error.message.includes('commandes associées')) {
        res.status(400).json({
          success: false,
          message: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la suppression du produit',
          error: error.message
        });
      }
    }
  }

  /**
   * Récupère tous les produits d'une boutique
   */
  static async getProduitsByBoutique(req: Request, res: Response): Promise<void> {
    try {
      logger.debug('[ProduitController] Params:', req.params);
      logger.debug('[ProduitController] Query:', req.query);
      
      const boutiqueId = parseInt(req.params.boutiqueId);
      
      if (isNaN(boutiqueId)) {
        logger.debug('[ProduitController] ID de boutique invalide:', req.params.boutiqueId);
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }

      // Utiliser validatedQuery s'il existe, sinon utiliser query
      const query = (req as any).validatedQuery || req.query;
      
      const page = parseInt(query.page as string) || 1;
      const limite = parseInt(query.limite as string) || 10;
      const tri_par = (query.tri_par as string) || 'date_creation';
      const ordre = ((query.ordre as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
      
      logger.debug('[ProduitController] Recherche des produits pour boutique:', boutiqueId);
      logger.debug('[ProduitController] Paramètres pagination:', { page, limite, tri_par, ordre });

      // Le vendeur propriétaire de la boutique voit aussi ses produits inactifs/brouillons ;
      // tout autre appelant (visiteur public, ou vendeur d'une autre boutique) ne voit que les produits actifs.
      const boutique = await BoutiqueModel.getBoutiqueById(boutiqueId);
      const estProprietaire = !!(req.vendeur && boutique && boutique.vendeur_id === req.vendeur.id);

      const filtres = extraireFiltresListe(query);
      const { produits, total } = await ProduitModel.getProduitsByBoutique(
        boutiqueId,
        page,
        limite,
        tri_par,
        ordre,
        !estProprietaire,
        filtres
      );
      
      logger.debug('[ProduitController] Nombre de produits trouvés:', produits.length);
      logger.debug('[ProduitController] Total de produits pour cette boutique:', total);
      
      res.status(200).json({
        success: true,
        donnees: produits,
        total,
        page,
        limite,
        total_pages: Math.ceil(total / limite)
      });
    } catch (error: any) {
      logger.error('[ProduitController] ERREUR:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Récupère les statistiques de vues d'un produit
   */
  static async getProduitStats(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de produit invalide'
        });
        return;
      }
      
      // Vérifier si le produit existe
      const produit = await ProduitModel.getProduitById(id);
      if (!produit) {
        res.status(404).json({
          success: false,
          message: 'Produit non trouvé'
        });
        return;
      }

      // Récupérer les statistiques de vues
      const statsVues = await VueModel.getStatsVues('produit', id);

      res.status(200).json({
        success: true,
        produit_id: id,
        nom_produit: produit.nom,
        statistiques: {
          nombre_vues_total: produit.nombre_vues || 0,
          ...statsVues
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message
      });
    }
  }
}
