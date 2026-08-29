import { Request, Response } from 'express';
import { EmailService } from '../services/email.service';
import { logger } from '../utils/logger';

export class EmailController {
  static async envoyerBoutiqueBadgeVerifie(req: Request, res: Response): Promise<void> {
    try {
      const { email, boutiqueNom, boutiqueSlug } = req.body as {
        email: string;
        boutiqueNom: string;
        boutiqueSlug: string;
      };

      await EmailService.envoyerBoutiqueBadgeVerifie(email, boutiqueNom, boutiqueSlug);

      res.status(200).json({
        success: true,
        message: 'Email de badge vérifié envoyé',
      });
    } catch (error: any) {
      logger.error('[EmailController] Échec envoi email badge vérifié:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email de badge vérifié',
        error: error.message,
      });
    }
  }
}
