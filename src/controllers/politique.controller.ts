import { Request, Response } from 'express';
import { PolitiqueModel } from '../models/politique.model';

export class PolitiqueController {
  /**
   * Récupère la politique de confidentialité publique
   * @route GET /api/v1/politique-confidentialite
   * @access Public
   */
  static async getPolitique(req: Request, res: Response): Promise<void> {
    try {
      const politique = await PolitiqueModel.getPolitique();

      if (!politique) {
        res.status(404).json({
          success: false,
          message: 'Politique de confidentialité introuvable',
        });
        return;
      }

      res.status(200).json({
        success: true,
        politique,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la politique de confidentialité',
        error: error.message,
      });
    }
  }
}
