import { Request, Response, NextFunction } from 'express';
import axios from 'axios';

/**
 * Middleware pour valider le captcha Cloudflare Turnstile
 * Peut être activé ou désactivé globalement via les variables d'environnement.
 */
export const validateTurnstile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const isEnabled = process.env.TURNSTILE_ENABLED === 'true';
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Si le captcha n'est pas activé ou s'il manque la clé secrète, on ignore la validation
  if (!isEnabled || !secretKey) {
    return next();
  }

  // Le token peut être envoyé dans les headers ou dans le body de la requête
  const token = req.headers['x-cf-token'] || req.body.turnstileToken || req.body['cf-turnstile-response'];

  if (!token || typeof token !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Validation de sécurité requise (Captcha absent).',
      code: 'CAPTCHA_REQUIRED'
    });
    return;
  }

  try {
    // Valider le jeton avec l'API Cloudflare Turnstile
    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        secret: secretKey,
        response: token,
        remoteip: req.ip
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 5000 // 5 secondes de timeout maximum pour ne pas bloquer l'API
      }
    );

    const { success, 'error-codes': errorCodes } = response.data;

    if (!success) {
      console.warn('[Captcha] Échec de validation Turnstile:', errorCodes);
      res.status(403).json({
        success: false,
        message: 'La validation de sécurité a échoué. Veuillez réessayer.',
        code: 'CAPTCHA_INVALID',
        details: errorCodes
      });
      return;
    }

    // Si validation réussie, passer au middleware suivant
    next();
  } catch (error: any) {
    console.error('[Captcha] Erreur lors de la communication avec Cloudflare Turnstile:', error.message);
    
    // En cas d'erreur de communication avec les serveurs de Cloudflare (timeout, panne externe),
    // on autorise la requête (fail-open) pour ne pas bloquer les utilisateurs légitimes de la plateforme.
    next();
  }
};
