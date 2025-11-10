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
      console.log('[isBoutiqueOwner] Pas de vendeur authentifié');
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }
    
    // Récupérer l'ID de la boutique depuis les params ou le body
    let boutiqueId: number;
    
    if (req.params.id) {
      // Pour les routes PUT/DELETE/PATCH avec :id dans l'URL
      boutiqueId = parseInt(req.params.id);
    } else if (req.params.boutiqueId) {
      // Pour les routes GET avec :boutiqueId dans l'URL
      boutiqueId = parseInt(req.params.boutiqueId);
    } else if (req.body && req.body.boutique_id) {
      // Pour les routes POST avec boutique_id dans le body
      boutiqueId = parseInt(req.body.boutique_id);
    } else {
      console.log('[isBoutiqueOwner] Aucun ID de boutique trouvé dans params ou body');
      console.log('[isBoutiqueOwner] req.params:', req.params);
      console.log('[isBoutiqueOwner] req.body:', req.body);
      return res.status(400).json({
        success: false,
        message: 'ID de boutique manquant'
      });
    }
    
    console.log('[isBoutiqueOwner] Vérification pour boutique_id:', boutiqueId, 'vendeur_id:', req.vendeur.id);
    
    if (isNaN(boutiqueId)) {
      console.log('[isBoutiqueOwner] ID de boutique invalide:', boutiqueId);
      return res.status(400).json({
        success: false,
        message: 'ID de boutique invalide'
      });
    }
    
    // Importer le modèle de boutique ici pour éviter les dépendances circulaires
    const { BoutiqueModel } = require('../models/boutique.model');
    
    const boutique = await BoutiqueModel.getBoutiqueById(boutiqueId);
    
    if (!boutique) {
      console.log('[isBoutiqueOwner] Boutique non trouvée:', boutiqueId);
      return res.status(404).json({
        success: false,
        message: 'Boutique non trouvée'
      });
    }
    
    console.log('[isBoutiqueOwner] Boutique trouvée - vendeur_id boutique:', boutique.vendeur_id, 'vendeur_id requête:', req.vendeur.id);
    
    if (boutique.vendeur_id !== req.vendeur.id && !req.isAdmin) {
      console.log('[isBoutiqueOwner] Accès refusé - pas le propriétaire');
      return res.status(403).json({
        success: false,
        message: 'Accès refusé, vous n\'êtes pas propriétaire de cette boutique'
      });
    }
    
    console.log('[isBoutiqueOwner] Vérification réussie');
    next();
  } catch (error) {
    console.error('[isBoutiqueOwner] Erreur:', error);
    next(error);
  }
};

// Middleware pour vérifier si l'utilisateur est propriétaire de la boutique associée à une commune
export const isCommuneOwner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.vendeur) {
      console.log('[isCommuneOwner] Pas de vendeur authentifié');
      return res.status(401).json({
        success: false,
        message: 'Authentification requise'
      });
    }
    
    // Pour POST: récupérer boutique_id depuis le body
    if (req.method === 'POST' && req.body.boutique_id) {
      const boutiqueId = parseInt(req.body.boutique_id);
      console.log('[isCommuneOwner] POST - Vérification pour boutique_id:', boutiqueId);
      
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
        console.log('[isCommuneOwner] Accès refusé - pas le propriétaire de la boutique');
        return res.status(403).json({
          success: false,
          message: 'Accès refusé, vous n\'êtes pas propriétaire de cette boutique'
        });
      }
      
      console.log('[isCommuneOwner] Vérification réussie pour POST');
      return next();
    }
    
    // Pour PUT/PATCH/DELETE: récupérer la commune et vérifier sa boutique
    const communeId = parseInt(req.params.id);
    
    if (isNaN(communeId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de commune invalide'
      });
    }
    
    console.log('[isCommuneOwner] Vérification pour commune_id:', communeId, 'vendeur_id:', req.vendeur.id);
    
    // Récupérer la commune pour obtenir son boutique_id
    const { supabaseAdmin } = require('../config/supabase');
    const { data: commune, error } = await supabaseAdmin
      .from('communes_livraison')
      .select('boutique_id')
      .eq('id', communeId)
      .single();
    
    if (error || !commune) {
      console.log('[isCommuneOwner] Commune non trouvée:', communeId);
      return res.status(404).json({
        success: false,
        message: 'Commune non trouvée'
      });
    }
    
    console.log('[isCommuneOwner] Commune trouvée - boutique_id:', commune.boutique_id);
    
    // Vérifier que le vendeur possède la boutique de cette commune
    const { BoutiqueModel } = require('../models/boutique.model');
    const boutique = await BoutiqueModel.getBoutiqueById(commune.boutique_id);
    
    if (!boutique) {
      return res.status(404).json({
        success: false,
        message: 'Boutique associée non trouvée'
      });
    }
    
    console.log('[isCommuneOwner] Boutique trouvée - vendeur_id boutique:', boutique.vendeur_id, 'vendeur_id requête:', req.vendeur.id);
    
    if (boutique.vendeur_id !== req.vendeur.id && !req.isAdmin) {
      console.log('[isCommuneOwner] Accès refusé - pas le propriétaire de la boutique');
      return res.status(403).json({
        success: false,
        message: 'Accès refusé, vous n\'êtes pas propriétaire de cette boutique'
      });
    }
    
    console.log('[isCommuneOwner] Vérification réussie');
    next();
  } catch (error) {
    console.error('[isCommuneOwner] Erreur:', error);
    next(error);
  }
};
