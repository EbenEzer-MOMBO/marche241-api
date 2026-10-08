import { Request, Response } from 'express';
import { BoutiqueModel } from '../models/boutique.model';
import { ProduitModel } from '../models/produit.model';
import { VueModel, TypeEntiteVue } from '../models/vue.model';
import { logger } from '../utils/logger';
import {
  detecterAppareil,
  detecterSource,
  doitEnregistrerLaVue,
  getClientIp
} from '../utils/view-tracking';

export class VueController {
  /**
   * POST /api/v1/vues
   * Enregistre une vue réelle (navigateur), robots et propriétaire exclus.
   */
  static async enregistrer(req: Request, res: Response): Promise<void> {
    try {
      const typeEntite = req.body.type_entite as TypeEntiteVue;
      const entiteId = Number(req.body.entite_id);
      const referrer = typeof req.body.referrer === 'string' ? req.body.referrer : undefined;
      const utmSource = typeof req.body.utm_source === 'string' ? req.body.utm_source : undefined;

      const proprietaire = await proprietaireDeLEntite(typeEntite, entiteId);
      if (!proprietaire) {
        res.status(404).json({
          success: false,
          message: 'Entité introuvable'
        });
        return;
      }

      const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

      if (!doitEnregistrerLaVue(req, proprietaire.vendeurId)) {
        res.status(202).json({ success: true, enregistree: false });
        return;
      }

      const source = detecterSource(referrer, utmSource);
      const appareil = detecterAppareil(userAgent);
      const enregistree = await VueModel.enregistrerVue(
        typeEntite,
        entiteId,
        getClientIp(req),
        userAgent,
        referrer,
        source,
        appareil
      );

      res.status(202).json({ success: true, enregistree });
    } catch (error: any) {
      logger.error('[VueController] Erreur enregistrement vue:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'enregistrement de la vue',
        error: error.message
      });
    }
  }
}

async function proprietaireDeLEntite(
  typeEntite: TypeEntiteVue,
  entiteId: number
): Promise<{ vendeurId: number } | null> {
  if (typeEntite === 'boutique') {
    const boutique = await BoutiqueModel.getBoutiqueById(entiteId);
    if (!boutique) {
      return null;
    }
    return { vendeurId: boutique.vendeur_id };
  }

  const produit = await ProduitModel.getProduitById(entiteId) as {
    boutique?: { vendeur_id?: number };
  } | null;
  const vendeurId = produit?.boutique?.vendeur_id;
  if (!produit || vendeurId == null) {
    return null;
  }
  return { vendeurId };
}
