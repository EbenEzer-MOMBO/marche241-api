import { Request, Response, NextFunction } from 'express';
import { AffilieModel } from '../models/affilie.model';
import { Affilie } from '../lib/database-types';
import { verifyAffilieToken } from '../utils/jwt.affilie.utils';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      affilie?: Affilie;
    }
  }
}

/**
 * Authentifie un affilié pour les endpoints du mini dashboard, via le JWT émis
 * par /affilies/connexion/verifier. Refuse l'accès si le compte a été
 * désactivé après l'émission du token.
 */
export const authAffilie = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Accès non autorisé, token manquant' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAffilieToken(token);

    if (!decoded) {
      res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
      return;
    }

    const affilie = await AffilieModel.getById(decoded.id);
    if (!affilie) {
      res.status(401).json({ success: false, message: 'Affilié non trouvé' });
      return;
    }

    if (affilie.statut !== 'actif') {
      res.status(403).json({ success: false, message: 'Compte affilié désactivé' });
      return;
    }

    req.affilie = affilie;
    next();
  } catch (error) {
    logger.error('[AuthAffilieMiddleware] Erreur interne:', error);
    res.status(500).json({ success: false, message: 'Erreur interne du serveur' });
  }
};
