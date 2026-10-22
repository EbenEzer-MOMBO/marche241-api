import { Request, Response } from 'express';
import { ProduitModel } from '../models/produit.model';
import { BilletScanModel } from '../models/billet-scan.model';
import { ScannerService } from '../services/scanner.service';
import { isProduitEvenement } from '../utils/produit-evenement';
import { logger } from '../utils/logger';

/**
 * Charge l'événement et vérifie que l'appelant en est le vendeur (ou l'admin via
 * clé de service si `adminAutorise`). Répond 404/403 sinon.
 */
async function chargerEvenementAutorise(req: Request, res: Response, produitId: number, adminAutorise = false) {
  const produit: any = await ProduitModel.getProduitById(produitId);
  if (!produit || !isProduitEvenement(produit)) {
    res.status(404).json({ success: false, message: 'Événement non trouvé' });
    return null;
  }

  const estProprietaire = !!(req.vendeur && produit.boutique && produit.boutique.vendeur_id === req.vendeur.id);
  if (!estProprietaire && !(adminAutorise && req.isAdmin)) {
    res.status(403).json({ success: false, message: 'Accès non autorisé à cet événement' });
    return null;
  }

  return produit;
}

export class ScannerController {
  static async evenements(req: Request, res: Response): Promise<void> {
    try {
      const evenements = await ScannerService.evenements(req.vendeur!.id);
      res.json({ success: true, evenements });
    } catch (error: any) {
      logger.error('[ScannerController] Événements:', error.message);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des événements' });
    }
  }

  static async billets(req: Request, res: Response): Promise<void> {
    try {
      const produit = await chargerEvenementAutorise(req, res, Number(req.params.produitId));
      if (!produit) return;

      const { depuis } = ((req as any).validatedQuery || {}) as { depuis?: Date };
      const cache = await ScannerService.billetsCache(produit, depuis);
      res.json({ success: true, ...cache });
    } catch (error: any) {
      logger.error('[ScannerController] Cache billets:', error.message);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des billets' });
    }
  }

  static async scanner(req: Request, res: Response): Promise<void> {
    try {
      const corps = (req as any).validatedBody as {
        produit_id: number;
        qr?: string;
        billet_id?: number;
        appareil_id?: string;
      };
      const produit = await chargerEvenementAutorise(req, res, corps.produit_id);
      if (!produit) return;

      const resultat = await ScannerService.controler({
        produit,
        vendeurId: req.vendeur!.id,
        mode: corps.billet_id !== undefined ? 'manuel' : 'qr',
        source: 'en_ligne',
        appareilId: corps.appareil_id,
        qr: corps.qr,
        billetId: corps.billet_id
      });
      // Un refus métier reste une réponse 200 : le scanner l'affiche, ce n'est pas une erreur technique
      res.json(resultat);
    } catch (error: any) {
      logger.error('[ScannerController] Scan:', error.message);
      res.status(500).json({ success: false, message: 'Erreur lors du contrôle du billet' });
    }
  }

  static async scannerLot(req: Request, res: Response): Promise<void> {
    try {
      const corps = (req as any).validatedBody as {
        produit_id: number;
        appareil_id?: string;
        scans: Array<{ id_local: string; qr?: string; billet_id?: number; scanne_a: Date }>;
      };
      const produit = await chargerEvenementAutorise(req, res, corps.produit_id);
      if (!produit) return;

      const resultats = [];
      // Séquentiel : l'ordre de la file de l'appareil est conservé
      for (const scan of corps.scans) {
        const resultat = await ScannerService.controler({
          produit,
          vendeurId: req.vendeur!.id,
          mode: scan.billet_id !== undefined ? 'manuel' : 'qr',
          source: 'hors_ligne',
          appareilId: corps.appareil_id,
          scanneA: scan.scanne_a,
          qr: scan.qr,
          billetId: scan.billet_id
        });
        resultats.push({ id_local: scan.id_local, ...resultat });
      }

      res.json({ success: true, resultats });
    } catch (error: any) {
      logger.error('[ScannerController] Lot de scans:', error.message);
      res.status(500).json({ success: false, message: 'Erreur lors de la synchronisation des scans' });
    }
  }

  /** Journal des contrôles d'un événement (vendeur propriétaire ou back-office). */
  static async journal(req: Request, res: Response): Promise<void> {
    try {
      const produit = await chargerEvenementAutorise(req, res, Number(req.params.id), true);
      if (!produit) return;

      const { page = 1, limite = 50, resultat } = ((req as any).validatedQuery || {}) as {
        page?: number;
        limite?: number;
        resultat?: any;
      };
      const journal = await BilletScanModel.journalProduit(produit.id, { page, limite, resultat });
      res.json({ success: true, ...journal, page, limite });
    } catch (error: any) {
      logger.error('[ScannerController] Journal des scans:', error.message);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération du journal' });
    }
  }
}
