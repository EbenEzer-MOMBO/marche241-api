import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { VendeurModel } from '../models/vendeur.model';
import { Vendeur } from '../lib/database-types';

// Étendre l'interface Request pour inclure le vendeur authentifié
declare global {
  namespace Express {
    interface Request {
      vendeur?: Vendeur;
      isAdmin?: boolean;
    }
  }
}

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Vérifier si le token est présent dans les headers
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Accès non autorisé, token manquant'
      });
    }

    // Extraire le token
    const token = authHeader.split(' ')[1];

    try {
      // Vérifier et décoder le token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret') as any;

      // Récupérer le vendeur à partir de l'ID dans le token
      const vendeur = await VendeurModel.getVendeurById(decoded.id);
      
      if (!vendeur) {
        return res.status(401).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
      }

      // Vérifier si le vendeur est actif
      if (vendeur.statut !== 'actif') {
        return res.status(401).json({
          success: false,
          message: 'Compte vendeur inactif ou en attente de vérification'
        });
      }

      // Ajouter le vendeur à la requête
      req.vendeur = vendeur;
      
      // Vérifier si le vendeur est admin (à implémenter selon vos besoins)
      req.isAdmin = false; // Par défaut, pas admin
      
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré'
      });
    }
  } catch (error) {
    next(error);
  }
};

// Middleware pour vérifier si l'utilisateur est admin
export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.vendeur || !req.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé, privilèges administrateur requis'
    });
  }
  
  next();
};

// Middleware pour vérifier si l'utilisateur est propriétaire de la boutique
export const isBoutiqueOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.vendeur) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }
    
    const boutiqueId = parseInt(req.params.id);
    
    if (isNaN(boutiqueId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de boutique invalide'
      });
    }
    
    // Importer le modèle de boutique ici pour éviter les dépendances circulaires
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
    
    next();
  } catch (error) {
    next(error);
  }
};
