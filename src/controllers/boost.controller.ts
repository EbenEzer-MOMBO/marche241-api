import { Request, Response } from 'express';
import { BoostModel } from '../models/boost.model';
import { BoostService } from '../services/boost.service';
import { listerForfaits, listerForfaitsPourVendeur } from '../config/forfaits-boost.config';
import { logger } from '../utils/logger';
import { StatutBoost } from '../lib/database-types';

export class BoostController {
  /**
   * Liste les forfaits de boost disponibles. Le budget Meta réel (marge interne) n'est
   * exposé qu'aux appels admin-scopés.
   */
  static async getForfaits(req: Request, res: Response): Promise<void> {
    try {
      const forfaits = req.isAdmin ? listerForfaits() : listerForfaitsPourVendeur();
      res.status(200).json({ success: true, forfaits });
    } catch (error: any) {
      logger.error('[BoostController] ERREUR getForfaits:', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des forfaits', error: error.message });
    }
  }

  /**
   * Crée un boost pour une boutique (statut initial en_attente_paiement).
   * Le front enchaîne ensuite avec les endpoints génériques /transactions puis /paiements/*.
   */
  static async creerBoost(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = (req as any).validatedBody || req.body;
      const { boutique_id, forfait_code, zones } = validatedData;

      if (!req.vendeur) {
        res.status(401).json({ success: false, message: 'Authentification requise' });
        return;
      }

      const boost = await BoostService.creerBoost(boutique_id, req.vendeur.id, forfait_code, zones);

      res.status(201).json({ success: true, message: 'Boost créé avec succès', boost });
    } catch (error: any) {
      logger.error('[BoostController] ERREUR creerBoost:', error);
      res.status(400).json({ success: false, message: error.message || 'Erreur lors de la création du boost' });
    }
  }

  /**
   * Liste paginée des boosts d'une boutique (vendeur-scopé, ownership vérifiée par isBoutiqueOwner)
   */
  static async listerBoostsBoutique(req: Request, res: Response): Promise<void> {
    try {
      const boutiqueId = parseInt(req.params.boutiqueId);
      if (isNaN(boutiqueId)) {
        res.status(400).json({ success: false, message: 'ID de boutique invalide' });
        return;
      }

      const query = (req as any).validatedQuery || req.query;
      const page = parseInt(query.page as string) || 1;
      const limite = parseInt(query.limite as string) || 10;

      const resultat = await BoostModel.getBoostsByBoutiqueId(boutiqueId, page, limite);

      res.status(200).json({ success: true, ...resultat });
    } catch (error: any) {
      logger.error('[BoostController] ERREUR listerBoostsBoutique:', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des boosts', error: error.message });
    }
  }

  /**
   * Détail d'un boost, avec vérification d'appartenance (vendeur propriétaire ou admin)
   */
  static async getBoostDetail(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'ID de boost invalide' });
        return;
      }

      const boost = await BoostModel.getBoostById(id);
      if (!boost) {
        res.status(404).json({ success: false, message: 'Boost non trouvé' });
        return;
      }

      if (!req.isAdmin && boost.vendeur_id !== req.vendeur?.id) {
        res.status(403).json({ success: false, message: 'Accès refusé, vous n\'êtes pas propriétaire de ce boost' });
        return;
      }

      const { BoostEvenementModel, BoostStatModel } = await import('../models/boost.model');
      const [evenements, stats] = await Promise.all([
        BoostEvenementModel.listerParBoost(id),
        BoostStatModel.getSerieParBoost(id)
      ]);

      res.status(200).json({ success: true, boost, evenements, stats });
    } catch (error: any) {
      logger.error('[BoostController] ERREUR getBoostDetail:', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération du boost', error: error.message });
    }
  }

  /**
   * Liste paginée et filtrée de tous les boosts (admin-scopé)
   */
  static async listerTousBoosts(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limite = parseInt(req.query.limite as string) || 20;
      const statut = req.query.statut as StatutBoost | undefined;
      const boutique_id = req.query.boutique_id ? parseInt(req.query.boutique_id as string) : undefined;

      const resultat = await BoostModel.getAllBoosts(page, limite, { statut, boutique_id });

      res.status(200).json({ success: true, ...resultat });
    } catch (error: any) {
      logger.error('[BoostController] ERREUR listerTousBoosts:', error);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des boosts', error: error.message });
    }
  }

  static async pauseBoost(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'ID de boost invalide' });
        return;
      }

      const boost = await BoostService.pauseAdmin(id);
      res.status(200).json({ success: true, message: 'Boost mis en pause', boost });
    } catch (error: any) {
      logger.error('[BoostController] ERREUR pauseBoost:', error);
      res.status(400).json({ success: false, message: error.message || 'Erreur lors de la mise en pause du boost' });
    }
  }

  static async reprendreBoost(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        res.status(400).json({ success: false, message: 'ID de boost invalide' });
        return;
      }

      const boost = await BoostService.reprendreAdmin(id);
      res.status(200).json({ success: true, message: 'Boost relancé', boost });
    } catch (error: any) {
      logger.error('[BoostController] ERREUR reprendreBoost:', error);
      res.status(400).json({ success: false, message: error.message || 'Erreur lors de la relance du boost' });
    }
  }
}
