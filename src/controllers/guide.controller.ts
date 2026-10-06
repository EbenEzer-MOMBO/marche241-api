import { Request, Response } from 'express';
import { VendeurGuideModel } from '../models/vendeur-guide.model';
import { logger } from '../utils/logger';

const corps = (req: Request) => (req as any).validatedBody ?? req.body;
const params = (req: Request) => (req as any).validatedParams ?? req.params;

/** Visites guidées du vendeur connecté (terminées ou passées). */
export class GuideController {
  static async lister(req: Request, res: Response): Promise<void> {
    try {
      const lignes = await VendeurGuideModel.lister(req.vendeur!.id);
      res.json({
        success: true,
        guides: Object.fromEntries(lignes.map((l) => [l.guide, { statut: l.statut, date_modification: l.date_modification }]))
      });
    } catch (err: any) {
      logger.error('[GuideController] lister :', err?.message);
      res.status(500).json({ success: false, message: 'Erreur lors de la lecture des visites guidées' });
    }
  }

  static async enregistrer(req: Request, res: Response): Promise<void> {
    try {
      const ligne = await VendeurGuideModel.enregistrer(req.vendeur!.id, params(req).guide, corps(req).statut);
      res.json({ success: true, guide: { guide: ligne.guide, statut: ligne.statut, date_modification: ligne.date_modification } });
    } catch (err: any) {
      logger.error('[GuideController] enregistrer :', err?.message);
      res.status(500).json({ success: false, message: "Erreur lors de l'enregistrement de la visite guidée" });
    }
  }
}
