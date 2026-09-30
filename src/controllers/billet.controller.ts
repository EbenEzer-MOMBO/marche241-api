import { Request, Response } from 'express';
import { BilletService } from '../services/billet.service';
import { BilletModel } from '../models/billet.model';
import { ProduitModel } from '../models/produit.model';
import { CommandeModel } from '../models/commande.model';
import { HtmlToPdfService } from '../services/htmltopdf.service';
import { logger } from '../utils/logger';

/**
 * Charge le produit et vérifie que l'appelant est le vendeur propriétaire
 * de la boutique (ou l'admin via clé de service). Répond 404/403 sinon.
 */
async function chargerProduitAutorise(req: Request, res: Response, produitId: number) {
  const produit: any = await ProduitModel.getProduitById(produitId);
  if (!produit) {
    res.status(404).json({ success: false, message: 'Produit non trouvé' });
    return null;
  }

  const estProprietaire = !!(req.vendeur && produit.boutique && produit.boutique.vendeur_id === req.vendeur.id);
  if (!estProprietaire && !req.isAdmin) {
    res.status(403).json({ success: false, message: 'Accès non autorisé à ce produit' });
    return null;
  }

  return produit;
}

export class BilletController {
  static async participantsParProduit(req: Request, res: Response): Promise<void> {
    try {
      const produitId = parseInt(String(req.params.id), 10);
      if (Number.isNaN(produitId)) {
        res.status(400).json({ success: false, message: 'ID de produit invalide' });
        return;
      }

      const produit = await chargerProduitAutorise(req, res, produitId);
      if (!produit) {
        return;
      }

      const [participants, stats, ventesParType] = await Promise.all([
        BilletModel.findParticipantsByProduit(produitId),
        BilletModel.statsProduit(produitId),
        BilletModel.ventesParType(produitId)
      ]);

      res.json({ success: true, participants, stats: { ...stats, ventes_par_type: ventesParType } });
    } catch (error: any) {
      logger.error('[BilletController] Participants produit:', error.message);
      res.status(500).json({ success: false, message: 'Erreur lors de la récupération des participants' });
    }
  }

  static async marquerScan(req: Request, res: Response): Promise<void> {
    try {
      const billetId = parseInt(String(req.params.id), 10);
      const billet = await BilletModel.findById(billetId);
      if (!billet) {
        res.status(404).json({ success: false, message: 'Billet introuvable' });
        return;
      }

      const produit = await chargerProduitAutorise(req, res, billet.produit_id);
      if (!produit) {
        return;
      }

      const misAJour = await BilletModel.setScanne(billetId, req.body.scanne === true);
      res.json({ success: true, billet: misAJour });
    } catch (error: any) {
      logger.error('[BilletController] Scan billet:', error.message);
      res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du billet' });
    }
  }

  static async renvoyerEmail(req: Request, res: Response): Promise<void> {
    try {
      const commandeId = parseInt(String(req.params.commandeId), 10);
      const billets = await BilletModel.findByCommandeId(commandeId);
      if (billets.length === 0) {
        res.status(404).json({ success: false, message: 'Aucun billet pour cette commande' });
        return;
      }

      const produit = await chargerProduitAutorise(req, res, billets[0].produit_id);
      if (!produit) {
        return;
      }

      const commande = await CommandeModel.getCommandeById(commandeId);
      if (!commande) {
        res.status(404).json({ success: false, message: 'Commande introuvable' });
        return;
      }
      if (!commande.client_email) {
        res.status(400).json({ success: false, message: "Cette commande n'a pas d'adresse email" });
        return;
      }

      await BilletService.envoyerEmailBillets(commande, billets);
      res.json({ success: true, message: `Billets renvoyés à ${commande.client_email}` });
    } catch (error: any) {
      logger.error('[BilletController] Renvoi email billets:', error.message);
      res.status(500).json({ success: false, message: "Erreur lors de l'envoi de l'email" });
    }
  }

  static async detailsParJeton(req: Request, res: Response): Promise<void> {
    const jeton = String(req.params.jeton || '').trim();
    if (!/^[a-f0-9]{48}$/i.test(jeton)) {
      res.status(404).json({ success: false, message: 'Billets introuvables' });
      return;
    }

    const payload = await BilletService.payloadPdfParJeton(jeton);
    if (!payload) {
      res.status(404).json({ success: false, message: 'Billets introuvables' });
      return;
    }

    res.json({ success: true, data: payload });
  }

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
