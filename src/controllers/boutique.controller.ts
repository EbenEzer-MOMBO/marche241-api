import { Request, Response } from 'express';
import { BoutiqueModel } from '../models/boutique.model';
import { ProduitModel } from '../models/produit.model';
import { VueModel } from '../models/vue.model';
import { VendeurModel } from '../models/vendeur.model';
import { CreateBoutiqueData, Boutique, StatutBoutique } from '../lib/database-types';
import { logger } from '../utils/logger';
import { EmailService } from '../services/email.service';

/**
 * Utilitaire pour extraire l'IP réelle du client
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

export class BoutiqueController {
  /**
   * Récupère toutes les boutiques avec pagination
   */
  static async getAllBoutiques(req: Request, res: Response): Promise<void> {
    try {
      
      const page = parseInt(req.query.page as string) || 1;
      const limite = parseInt(req.query.limite as string) || 10;
      const tri_par = req.query.tri_par as string || 'date_creation';
      const ordre = (req.query.ordre as 'ASC' | 'DESC') || 'DESC';


      const boutiques = await BoutiqueModel.getAllBoutiques({
        page,
        limite,
        tri_par,
        ordre
      });


      res.status(200).json(boutiques);
    } catch (error: any) {
      logger.error('[BoutiqueController] ERREUR:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des boutiques',
        error: error.message
      });
    }
  }

  /**
   * Récupère une boutique par son ID ou son slug
   */
  static async getBoutiqueById(req: Request, res: Response): Promise<void> {
    try {
      const idOrSlug = req.params.id;
      
      let boutique;
      
      // Vérifier si l'ID est un nombre ou une chaîne
      const id = parseInt(idOrSlug);
      
      if (!isNaN(id)) {
        // Si c'est un nombre, rechercher par ID
        boutique = await BoutiqueModel.getBoutiqueById(id);
      } else {
        // Sinon, rechercher par slug
        boutique = await BoutiqueModel.getBoutiqueBySlug(idOrSlug);
      }
      
      if (!boutique) {
        res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
        return;
      }


      // Enregistrer la vue (en arrière-plan, ne pas bloquer la réponse)
      const clientIp = getClientIp(req);
      const userAgent = req.headers['user-agent'] || undefined;
      const referer = req.headers['referer'] || undefined;
      
      VueModel.enregistrerVue('boutique', boutique.id, clientIp, userAgent, referer)
        .catch(err => logger.error('[BoutiqueController] Erreur tracking vue:', err));

      res.status(200).json({
        success: true,
        boutique
      });
    } catch (error: any) {
      logger.error('[BoutiqueController] ERREUR:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Récupère une boutique par son slug
   */
  static async getBoutiqueBySlug(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params.slug;
      
      if (!slug) {
        res.status(400).json({
          success: false,
          message: 'Slug de boutique invalide'
        });
        return;
      }

      const boutique = await BoutiqueModel.getBoutiqueBySlug(slug);
      
      if (!boutique) {
        res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
        return;
      }

      // Enregistrer la vue (en arrière-plan)
      const clientIp = getClientIp(req);
      const userAgent = req.headers['user-agent'] || undefined;
      const referer = req.headers['referer'] || undefined;
      
      VueModel.enregistrerVue('boutique', boutique.id, clientIp, userAgent, referer)
        .catch(err => logger.error('[BoutiqueController] Erreur tracking vue:', err));

      res.status(200).json({
        success: true,
        boutique
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Récupère toutes les boutiques d'un vendeur
   */
  static async getBoutiquesByVendeurId(req: Request, res: Response): Promise<void> {
    try {
      const vendeurId = parseInt(req.params.vendeurId);
      
      if (isNaN(vendeurId)) {
        res.status(400).json({
          success: false,
          message: 'ID de vendeur invalide'
        });
        return;
      }

      const boutiques = await BoutiqueModel.getBoutiquesByVendeurId(vendeurId);

      res.status(200).json({
        success: true,
        boutiques
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des boutiques du vendeur',
        error: error.message
      });
    }
  }

  /**
   * Crée une nouvelle boutique
   */
  static async createBoutique(req: Request, res: Response): Promise<void> {
    try {
      const boutiqueData: CreateBoutiqueData = req.body;
      
      
      // Récupérer le vendeur_id depuis le token JWT si authentifié
      if (req.user && req.user.id) {
        boutiqueData.vendeur_id = req.user.id;
      }
      
      // Vérifier que les champs obligatoires sont présents
      if (!boutiqueData.nom || !boutiqueData.vendeur_id) {
        res.status(400).json({
          success: false,
          message: 'Les champs nom et vendeur_id sont obligatoires'
        });
        return;
      }
      
      
      // Générer un slug si non fourni
      if (!boutiqueData.slug) {
        boutiqueData.slug = boutiqueData.nom
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
      
      // Vérifier si le slug existe déjà
      const slugExists = await BoutiqueModel.slugExists(boutiqueData.slug);
      
      if (slugExists) {
        res.status(400).json({
          success: false,
          message: 'Ce slug est déjà utilisé par une autre boutique'
        });
        return;
      }

      const nouvelleBoutique = await BoutiqueModel.createBoutique(boutiqueData);

      res.status(201).json({
        success: true,
        message: 'Boutique créée avec succès',
        boutique: nouvelleBoutique
      });
    } catch (error: any) {
      logger.error('[createBoutique] Erreur:', error);
      logger.error('[createBoutique] Stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Met à jour une boutique existante
   */
  static async updateBoutique(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const boutiqueData: Partial<Boutique> = req.body;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      // Vérifier si la boutique existe
      const existingBoutique = await BoutiqueModel.getBoutiqueById(id);
      if (!existingBoutique) {
        res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
        return;
      }
      
      // Vérifier si le slug existe déjà (si fourni)
      if (boutiqueData.slug && boutiqueData.slug !== existingBoutique.slug) {
        const slugExists = await BoutiqueModel.slugExists(boutiqueData.slug, id);
        if (slugExists) {
          res.status(400).json({
            success: false,
            message: 'Ce slug est déjà utilisé par une autre boutique'
          });
          return;
        }
      }

      const boutiqueMiseAJour = await BoutiqueModel.updateBoutique(id, boutiqueData);

      res.status(200).json({
        success: true,
        message: 'Boutique mise à jour avec succès',
        boutique: boutiqueMiseAJour
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Supprime une boutique
   */
  static async deleteBoutique(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      // Vérifier si la boutique existe
      const existingBoutique = await BoutiqueModel.getBoutiqueById(id);
      if (!existingBoutique) {
        res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
        return;
      }

      await BoutiqueModel.deleteBoutique(id);

      res.status(200).json({
        success: true,
        message: 'Boutique supprimée avec succès'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Met à jour le statut d'une boutique
   */
  static async updateBoutiqueStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const { statut } = req.body;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      // Vérifier si le statut est valide
      const statutsValides: StatutBoutique[] = ['active', 'inactive', 'en_attente', 'suspendue'];
      if (!statut || !statutsValides.includes(statut as StatutBoutique)) {
        res.status(400).json({
          success: false,
          message: 'Statut de boutique invalide',
          statutsValides
        });
        return;
      }
      
      // Vérifier si la boutique existe
      const existingBoutique = await BoutiqueModel.getBoutiqueById(id);
      if (!existingBoutique) {
        res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
        return;
      }

      const ancienStatut = existingBoutique.statut;
      const boutiqueMiseAJour = await BoutiqueModel.updateBoutiqueStatus(id, statut);

      // Notifier le vendeur par email du changement de statut de sa boutique
      try {
        const vendeur = await VendeurModel.getVendeurById(existingBoutique.vendeur_id);
        if (vendeur?.email) {
          if (statut === 'active' && ancienStatut !== 'active') {
            await EmailService.envoyerBoutiqueActivee(vendeur.email, existingBoutique.nom, existingBoutique.slug);
          } else if (statut === 'suspendue') {
            await EmailService.envoyerBoutiqueSuspendue(vendeur.email, existingBoutique.nom, 'Produits ou informations non conformes signalés');
          } else if (statut === 'en_attente' && ancienStatut === 'active') {
            await EmailService.envoyerBoutiqueRemiseEnAttente(vendeur.email, existingBoutique.nom, 'Informations de la boutique modifiées');
          }
        }
      } catch (emailError: any) {
        logger.error('[BoutiqueController] Erreur lors de l\'envoi de l\'email de changement de statut:', emailError);
      }

      res.status(200).json({
        success: true,
        message: `Statut de la boutique mis à jour vers "${statut}"`,
        boutique: boutiqueMiseAJour
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut de la boutique',
        error: error.message
      });
    }
  }

  /**
   * Récupère les statistiques de vues d'une boutique
   */
  static async getBoutiqueStats(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      // Vérifier si la boutique existe
      const boutique = await BoutiqueModel.getBoutiqueById(id);
      if (!boutique) {
        res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
        return;
      }

      // Récupérer les statistiques de vues
      const statsVues = await VueModel.getStatsVues('boutique', id);

      res.status(200).json({
        success: true,
        boutique_id: id,
        nom_boutique: boutique.nom,
        statistiques: {
          nombre_vues_total: boutique.nombre_vues || 0,
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

  /**
   * Récupère les produits les plus vus d'une boutique
   */
  static async getTopVuesProduits(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const limite = parseInt(req.query.limite as string) || 5;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
        return;
      }
      
      // Vérifier si la boutique existe
      const boutique = await BoutiqueModel.getBoutiqueById(id);
      if (!boutique) {
        res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
        return;
      }

      // Récupérer les produits les plus vus
      const produits = await ProduitModel.getTopVuesProduitsByBoutique(id, limite);

      res.status(200).json({
        success: true,
        boutique_id: id,
        nom_boutique: boutique.nom,
        limite,
        produits
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des produits les plus vus',
        error: error.message
      });
    }
  }
}
