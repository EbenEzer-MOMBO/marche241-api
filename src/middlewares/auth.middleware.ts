import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { VendeurModel } from '../models/vendeur.model';
import { Vendeur } from '../lib/database-types';

// Étendre l'interface Request pour inclure le vendeur authentifié
declare global {
  namespace Express {
    interface Request {
      vendeur?: Vendeur;
      user?: Vendeur; // Alias pour compatibilité
      isAdmin?: boolean;
    }
  }
}

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('[AuthMiddleware] Headers reçus:', req.headers.authorization);
    
    // Vérifier si le token est présent dans les headers
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.log('[AuthMiddleware] Aucun header Authorization trouvé');
      return res.status(401).json({
        success: false,
        message: 'Accès non autorisé, token manquant'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log('[AuthMiddleware] Format Bearer incorrect:', authHeader);
      return res.status(401).json({
        success: false,
        message: 'Format de token invalide. Utilisez: Bearer <token>'
      });
    }

    // Extraire le token
    const token = authHeader.split(' ')[1];
    console.log('[AuthMiddleware] Token extrait:', token ? 'Présent' : 'Absent');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token manquant après Bearer'
      });
    }

    try {
      // Vérifier la présence de JWT_SECRET
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error('[AuthMiddleware] JWT_SECRET non défini dans les variables d\'environnement');
        return res.status(500).json({
          success: false,
          message: 'Configuration serveur incorrecte'
        });
      }

      console.log('[AuthMiddleware] Vérification du token avec JWT_SECRET');
      
      // Vérifier et décoder le token
      const decoded = jwt.verify(token, jwtSecret) as any;
      console.log('[AuthMiddleware] Token décodé:', { id: decoded.id, email: decoded.email || 'N/A' });

      // Récupérer le vendeur à partir de l'ID dans le token
      const vendeur = await VendeurModel.getVendeurById(decoded.id);
      
      if (!vendeur) {
        console.log('[AuthMiddleware] Vendeur non trouvé pour ID:', decoded.id);
        return res.status(401).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
      }

      console.log('[AuthMiddleware] Vendeur trouvé:', { id: vendeur.id, email: vendeur.email || 'N/A', statut: vendeur.statut });

      // Vérifier si le vendeur est actif
      if (vendeur.statut !== 'actif') {
        console.log('[AuthMiddleware] Vendeur inactif:', vendeur.statut);
        return res.status(401).json({
          success: false,
          message: 'Compte vendeur inactif ou en attente de vérification'
        });
      }

      // Ajouter le vendeur à la requête (deux propriétés pour compatibilité)
      req.vendeur = vendeur;
      req.user = vendeur; // Alias pour compatibilité avec le contrôleur
      
      // Vérifier si le vendeur est admin (à implémenter selon vos besoins)
      req.isAdmin = false; // Par défaut, pas admin
      
      console.log('[AuthMiddleware] Authentification réussie pour:', vendeur.email || vendeur.telephone);
      next();
    } catch (jwtError: any) {
      console.error('[AuthMiddleware] Erreur JWT:', jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Token invalide ou expiré',
        error: jwtError.message
      });
    }
  } catch (error: any) {
    console.error('[AuthMiddleware] Erreur générale:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur',
      error: error.message
    });
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
