import { Request, Response, NextFunction } from 'express';
import { auth as jwtAuth } from './auth.middleware';

/**
 * Accepte soit un JWT vendeur valide (via `auth`), soit une clé de service
 * statique transmise par le panneau admin interne (header x-service-key).
 * Dans le second cas, req.isAdmin=true et req.vendeur/req.user restent
 * undefined — les contrôleurs doivent gérer ce cas (cf. produit.controller.ts,
 * upload.controller.ts).
 *
 * Si ADMIN_SERVICE_KEY n'est pas configurée, retombe systématiquement sur le
 * JWT vendeur classique (aucun changement de comportement).
 */
export const authOrServiceKey = (req: Request, res: Response, next: NextFunction): void => {
  const serviceKey = process.env.ADMIN_SERVICE_KEY;
  const providedKey = req.headers['x-service-key'] as string | undefined;

  if (serviceKey && providedKey && providedKey === serviceKey) {
    req.isAdmin = true;
    next();
    return;
  }

  jwtAuth(req, res, next);
};
