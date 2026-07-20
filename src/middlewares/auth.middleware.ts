import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { VendeurModel } from '../models/vendeur.model';
import { Vendeur } from '../lib/database-types';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      vendeur?: Vendeur;
      user?: Vendeur;
      isAdmin?: boolean;
    }
  }
}

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Accès non autorisé, token manquant'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Format de token invalide. Utilisez: Bearer <token>'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token manquant après Bearer'
      });
    }

    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        logger.error('[AuthMiddleware] JWT_SECRET non défini');
        return res.status(500).json({
          success: false,
          message: 'Configuration serveur incorrecte'
        });
      }

      const decoded = jwt.verify(token, jwtSecret) as { id: number };
      const vendeur = await VendeurModel.getVendeurById(decoded.id);

      if (!vendeur) {
        return res.status(401).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
      }

      if (vendeur.statut !== 'actif') {
        return res.status(401).json({
          success: false,
          message: 'Compte vendeur inactif ou en attente de vérification'
        });
      }

      req.vendeur = vendeur;
      req.user = vendeur;

      const allowedAdminIds = (process.env.ALLOWED_ADMIN_IDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((id) => !Number.isNaN(id));
      req.isAdmin = allowedAdminIds.includes(vendeur.id);

      next();
    } catch (jwtError: any) {
      logger.warn('[AuthMiddleware] Token invalide ou expiré');
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré',
        error: jwtError.message
      });
    }
  } catch (error: any) {
    logger.error('[AuthMiddleware] Erreur interne:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur',
      error: error.message
    });
  }
};

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.vendeur || !req.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé, privilèges administrateur requis'
    });
  }
  next();
};

export const isSelfVendeur = (req: Request, res: Response, next: NextFunction) => {
  if (!req.vendeur) {
    return res.status(401).json({
      success: false,
      message: 'Authentification requise'
    });
  }

  const targetId = parseInt(req.params.id);
  if (isNaN(targetId)) {
    return res.status(400).json({
      success: false,
      message: 'ID de vendeur invalide'
    });
  }

  if (targetId !== req.vendeur.id && !req.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé, vous ne pouvez modifier que votre propre profil'
    });
  }

  next();
};

export const isBoutiqueOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.vendeur) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    let boutiqueId: number;
    if (req.params.id) {
      boutiqueId = parseInt(req.params.id);
    } else if (req.params.boutiqueId) {
      boutiqueId = parseInt(req.params.boutiqueId);
    } else if (req.body && req.body.boutique_id) {
      boutiqueId = parseInt(req.body.boutique_id);
    } else {
      return res.status(400).json({
        success: false,
        message: 'ID de boutique manquant'
      });
    }

    if (isNaN(boutiqueId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de boutique invalide'
      });
    }

    const { BoutiqueModel } = require('../models/boutique.model');
    const boutique = await BoutiqueModel.getBoutiqueById(boutiqueId);

    if (!boutique) {
      return res.status(404).json({
        success: false,
        message: 'Boutique non trouvée'
      });
    }

    if (boutique.vendeur_id !== req.vendeur.id && !req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé, vous n\'êtes pas propriétaire de cette boutique'
      });
    }

    (req as any).boutique = boutique;
    next();
  } catch (error) {
    next(error);
  }
};

export const isCommandeOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.vendeur) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    const { CommandeModel } = require('../models/commande.model');
    let commande;

    if (req.params.numero) {
      commande = await CommandeModel.getCommandeByNumero(req.params.numero);
    } else {
      const rawId = req.params.id || req.params.commandeId;
      const commandeId = parseInt(rawId);
      if (isNaN(commandeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID de commande invalide'
        });
      }
      commande = await CommandeModel.getCommandeById(commandeId);
    }

    if (!commande) {
      return res.status(404).json({
        success: false,
        message: 'Commande non trouvée'
      });
    }

    const { BoutiqueModel } = require('../models/boutique.model');
    const boutique = await BoutiqueModel.getBoutiqueById(commande.boutique_id);

    if (!boutique) {
      return res.status(404).json({
        success: false,
        message: 'Boutique associée à la commande non trouvée'
      });
    }

    if (boutique.vendeur_id !== req.vendeur.id && !req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé, vous n\'êtes pas propriétaire de la boutique associée à cette commande'
      });
    }

    (req as any).commande = commande;
    next();
  } catch (error) {
    next(error);
  }
};

export const isCommuneOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.vendeur) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }

    if (req.method === 'POST' && req.body.boutique_id) {
      const boutiqueId = parseInt(req.body.boutique_id);
      if (isNaN(boutiqueId)) {
        return res.status(400).json({
          success: false,
          message: 'ID de boutique invalide'
        });
      }

      const { BoutiqueModel } = require('../models/boutique.model');
      const boutique = await BoutiqueModel.getBoutiqueById(boutiqueId);
      if (!boutique) {
        return res.status(404).json({
          success: false,
          message: 'Boutique non trouvée'
        });
      }

      if (boutique.vendeur_id !== req.vendeur.id && !req.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Accès refusé, vous n\'êtes pas propriétaire de cette boutique'
        });
      }

      return next();
    }

    const communeId = parseInt(req.params.id);
    if (isNaN(communeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de commune invalide'
      });
    }

    const { supabaseAdmin } = require('../config/supabase');
    const { data: commune, error } = await supabaseAdmin
      .from('communes_livraison')
      .select('boutique_id')
      .eq('id', communeId)
      .single();

    if (error || !commune) {
      return res.status(404).json({
        success: false,
        message: 'Commune non trouvée'
      });
    }

    const { BoutiqueModel } = require('../models/boutique.model');
    const boutique = await BoutiqueModel.getBoutiqueById(commune.boutique_id);
    if (!boutique) {
      return res.status(404).json({
        success: false,
        message: 'Boutique associée non trouvée'
      });
    }

    if (boutique.vendeur_id !== req.vendeur.id && !req.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé, vous n\'êtes pas propriétaire de cette boutique'
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
