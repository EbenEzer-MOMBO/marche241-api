import { Request, Response } from 'express';
import { BoutiqueModel } from '../models/boutique.model';
import { VendeurModel } from '../models/vendeur.model';
import { VendeurPasskeyModel } from '../models/vendeur-passkey.model';
import { PasskeyService } from '../services/passkey.service';
import { generateToken } from '../utils/jwt.utils';
import { logger } from '../utils/logger';

export class PasskeyController {
  static async registerOptions(req: Request, res: Response): Promise<void> {
    try {
      const vendeur = req.vendeur;
      if (!vendeur) {
        res.status(401).json({ success: false, message: 'Non authentifié' });
        return;
      }

      const options = await PasskeyService.createRegistrationOptions(vendeur);
      res.status(200).json({ success: true, options });
    } catch (error: any) {
      logger.error('[passkey] registerOptions:', error);
      res.status(500).json({
        success: false,
        message: 'Impossible de préparer l\'enregistrement de la clé d\'accès',
        error: error.message
      });
    }
  }

  static async registerVerify(req: Request, res: Response): Promise<void> {
    try {
      const vendeur = req.vendeur;
      if (!vendeur) {
        res.status(401).json({ success: false, message: 'Non authentifié' });
        return;
      }

      const { response, device_name } = req.body;
      if (!response) {
        res.status(400).json({ success: false, message: 'Réponse WebAuthn manquante' });
        return;
      }

      const passkey = await PasskeyService.verifyRegistration(vendeur, response, device_name);
      res.status(201).json({
        success: true,
        message: 'Clé d\'accès enregistrée',
        passkey
      });
    } catch (error: any) {
      logger.error('[passkey] registerVerify:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Enregistrement de la clé d\'accès impossible'
      });
    }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const vendeur = req.vendeur;
      if (!vendeur) {
        res.status(401).json({ success: false, message: 'Non authentifié' });
        return;
      }

      const passkeys = await VendeurPasskeyModel.listByVendeurId(vendeur.id);
      res.status(200).json({
        success: true,
        passkeys: passkeys.map((item) => ({
          id: item.id,
          device_name: item.device_name,
          created_at: item.created_at
        }))
      });
    } catch (error: any) {
      logger.error('[passkey] list:', error);
      res.status(500).json({
        success: false,
        message: 'Impossible de lister les clés d\'accès',
        error: error.message
      });
    }
  }

  static async revoke(req: Request, res: Response): Promise<void> {
    try {
      const vendeur = req.vendeur;
      if (!vendeur) {
        res.status(401).json({ success: false, message: 'Non authentifié' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ success: false, message: 'Identifiant invalide' });
        return;
      }

      const deleted = await VendeurPasskeyModel.deleteForVendeur(id, vendeur.id);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Clé d\'accès introuvable' });
        return;
      }

      res.status(200).json({ success: true, message: 'Clé d\'accès révoquée' });
    } catch (error: any) {
      logger.error('[passkey] revoke:', error);
      res.status(500).json({
        success: false,
        message: 'Impossible de révoquer la clé d\'accès',
        error: error.message
      });
    }
  }

  static async loginOptions(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ success: false, message: 'L\'adresse email est obligatoire' });
        return;
      }

      const vendeur = await VendeurModel.getVendeurByEmail(email);
      if (!vendeur) {
        res.status(404).json({
          success: false,
          message: 'Aucune clé d\'accès disponible pour ce compte. Utilisez le code email.'
        });
        return;
      }

      const options = await PasskeyService.createAuthenticationOptions(vendeur);
      res.status(200).json({ success: true, options });
    } catch (error: any) {
      logger.error('[passkey] loginOptions:', error);
      const status = error.message?.includes('Aucune clé') ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Impossible de préparer la connexion par clé d\'accès'
      });
    }
  }

  static async loginVerify(req: Request, res: Response): Promise<void> {
    try {
      const { response } = req.body;
      if (!response) {
        res.status(400).json({ success: false, message: 'Réponse WebAuthn manquante' });
        return;
      }

      const vendeurId = await PasskeyService.verifyAuthentication(response);
      const vendeur = await VendeurModel.getVendeurById(vendeurId);
      if (!vendeur) {
        res.status(404).json({ success: false, message: 'Vendeur non trouvé' });
        return;
      }

      const token = generateToken(vendeur);
      const boutiques = await BoutiqueModel.getBoutiquesByVendeurId(vendeur.id);

      res.status(200).json({
        success: true,
        message: 'Connexion réussie',
        vendeur,
        token,
        hasBoutique: boutiques.length > 0,
        boutique: boutiques[0] ?? undefined
      });
    } catch (error: any) {
      logger.error('[passkey] loginVerify:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Connexion par clé d\'accès impossible'
      });
    }
  }
}
