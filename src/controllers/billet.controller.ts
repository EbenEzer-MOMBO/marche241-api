import { Request, Response } from 'express';
import { BilletService } from '../services/billet.service';
import { HtmlToPdfService } from '../services/htmltopdf.service';
import { logger } from '../utils/logger';

export class BilletController {
  static async telechargerParJeton(req: Request, res: Response): Promise<void> {
    const jeton = String(req.params.jeton || '').trim();
    if (!/^[a-f0-9]{48}$/i.test(jeton)) {
      res.status(404).json({ success: false, message: 'Billets introuvables' });
      return;
    }

    try {
      const payload = await BilletService.payloadPdfParJeton(jeton);
      if (!payload) {
        res.status(404).json({ success: false, message: 'Billets introuvables' });
        return;
      }

      const pdf = await HtmlToPdfService.generateBilletsPdf(payload);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="billets-marche241.pdf"');
      res.setHeader('Content-Length', pdf.length);
      res.send(pdf);
    } catch (error: any) {
      logger.error('[BilletController] Génération PDF:', error.message);
      res.status(502).json({ success: false, message: 'Impossible de générer les billets pour le moment' });
    }
  }
}
