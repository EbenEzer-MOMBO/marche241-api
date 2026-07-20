import { Request, Response, NextFunction } from 'express';

/**
 * Exige CRON_SECRET_KEY (obligatoire) via ?key= ou header x-cron-key.
 */
export const requireCronSecret = (req: Request, res: Response, next: NextFunction): void => {
  const cronKey = process.env.CRON_SECRET_KEY;

  if (!cronKey) {
    console.error('[requireCronSecret] CRON_SECRET_KEY non configurée');
    res.status(500).json({
      success: false,
      message: 'Configuration serveur incorrecte: CRON_SECRET_KEY manquante'
    });
    return;
  }

  const providedKey =
    (req.query.key as string | undefined) ||
    (req.headers['x-cron-key'] as string | undefined);

  if (!providedKey || providedKey !== cronKey) {
    console.log('[requireCronSecret] Clé invalide ou manquante');
    res.status(401).json({
      success: false,
      message: 'Clé d\'authentification invalide'
    });
    return;
  }

  next();
};
