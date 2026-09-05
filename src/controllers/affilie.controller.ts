import { Request, Response } from 'express';
import { AffilieModel } from '../models/affilie.model';
import { AffilieCodeConnexionModel } from '../models/affilie-code-connexion.model';
import { CommissionModel } from '../models/commission.model';
import { CreateAffilieData } from '../lib/database-types';
import { EmailService } from '../services/email.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { generateAffilieToken } from '../utils/jwt.affilie.utils';
import { logger } from '../utils/logger';

export class AffilieController {
  /**
   * Inscription d'un affilié : nom, email, WhatsApp, pays. Génère le code de
   * tracking et envoie la notification de bienvenue (email + WhatsApp).
   */
  static async inscrireAffilie(req: Request, res: Response): Promise<void> {
    try {
      const { nom, email, telephone, pays } = req.body as CreateAffilieData;

      const existant = await AffilieModel.getByEmailOuTelephone(email, telephone);
      if (existant) {
        res.status(409).json({
          success: false,
          message:
            existant.email === email
              ? 'Un compte affilié avec cette adresse email existe déjà'
              : 'Un compte affilié avec ce numéro de téléphone existe déjà'
        });
        return;
      }

      const affilie = await AffilieModel.create({ nom, email, telephone, pays });

      const frontendUrl = process.env.FRONTEND_URL || 'https://marche241.ga';
      const lienPrincipal = `${frontendUrl}/?ref=${affilie.code}`;

      try {
        await EmailService.envoyerAffilieBienvenue(email, nom, affilie.code);
      } catch (emailError) {
        logger.error("[AffilieController] Échec de l'envoi de l'email de bienvenue affilié:", emailError);
      }

      try {
        await WhatsAppService.notifyAffiliateWelcome(telephone, { nom, code: affilie.code, lienPrincipal });
      } catch (whatsappError) {
        logger.error('[AffilieController] Échec de la notification WhatsApp de bienvenue affilié:', whatsappError);
      }

      res.status(201).json({
        success: true,
        message: 'Inscription réussie',
        affilie,
        lien_principal: lienPrincipal
      });
    } catch (error: any) {
      logger.error('[AffilieController] Erreur lors de l\'inscription:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Erreur lors de l\'inscription'
      });
    }
  }

  /**
   * Résout un code affilié sans exposer de donnée personnelle — utilisé pour
   * la validation en direct côté front (checkout, page d'inscription).
   */
  static async resoudreCode(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.params;
      const affilie = await AffilieModel.getByCode(code);

      res.status(200).json({
        success: true,
        valide: Boolean(affilie && affilie.statut === 'actif')
      });
    } catch (error: any) {
      logger.error('[AffilieController] Erreur lors de la résolution du code:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la résolution du code'
      });
    }
  }

  /**
   * Profil + résumé (solde dû, total versé, commandes livrées) de l'affilié
   * authentifié — alimente l'accueil du mini dashboard.
   */
  static async getProfilEtSolde(req: Request, res: Response): Promise<void> {
    try {
      const affilie = req.affilie!;
      const resume = await CommissionModel.getResumeAffilie(affilie.id);

      res.status(200).json({
        success: true,
        affilie,
        resume
      });
    } catch (error: any) {
      logger.error('[AffilieController] Erreur lors de la récupération du profil:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du profil'
      });
    }
  }

  /**
   * Met à jour le profil de l'affilié authentifié (WhatsApp/email/pays) —
   * le taux de commission n'est jamais modifiable depuis cet endpoint.
   */
  static async updateProfil(req: Request, res: Response): Promise<void> {
    try {
      const affilie = req.affilie!;
      const { nom, email, telephone, pays } = req.body;

      const affilieMisAJour = await AffilieModel.updateProfil(affilie.id, { nom, email, telephone, pays });

      res.status(200).json({
        success: true,
        message: 'Profil mis à jour avec succès',
        affilie: affilieMisAJour
      });
    } catch (error: any) {
      logger.error('[AffilieController] Erreur lors de la mise à jour du profil:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Erreur lors de la mise à jour du profil'
      });
    }
  }

  /**
   * Historique paginé des commissions de l'affilié authentifié
   */
  static async getHistoriqueCommissions(req: Request, res: Response): Promise<void> {
    try {
      const affilie = req.affilie!;
      const page = parseInt(req.query.page as string) || 1;
      const limite = parseInt(req.query.limite as string) || 10;

      const resultat = await CommissionModel.getAllByAffilie(affilie.id, { page, limite });

      res.status(200).json({
        success: true,
        ...resultat
      });
    } catch (error: any) {
      logger.error('[AffilieController] Erreur lors de la récupération des commissions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des commissions'
      });
    }
  }

  /**
   * Demande un code OTP de connexion par email. Réponse générique dans tous
   * les cas (email inconnu, compte inactif, ou délai anti-spam non respecté)
   * pour ne jamais confirmer explicitement l'inexistence d'un compte.
   */
  static async demanderCodeConnexion(req: Request, res: Response): Promise<void> {
    const messageGenerique = {
      success: true,
      message: 'Si cet email est associé à un compte affilié, un code a été envoyé.'
    };

    try {
      const { email } = req.body as { email: string };
      const affilie = await AffilieModel.getByEmail(email);

      if (!affilie || affilie.statut !== 'actif') {
        res.status(200).json(messageGenerique);
        return;
      }

      const code = await AffilieCodeConnexionModel.genererCode(affilie.id);
      if (code) {
        try {
          await EmailService.envoyerAffilieCodeConnexion(affilie.email, code);
        } catch (emailError) {
          logger.error("[AffilieController] Échec de l'envoi du code de connexion:", emailError);
        }
      }

      res.status(200).json(messageGenerique);
    } catch (error: any) {
      logger.error('[AffilieController] Erreur lors de la demande de code:', error);
      res.status(200).json(messageGenerique);
    }
  }

  /**
   * Vérifie le code OTP et émet un token JWT de session (~30 jours).
   */
  static async verifierCodeConnexion(req: Request, res: Response): Promise<void> {
    try {
      const { email, code } = req.body as { email: string; code: string };
      const affilie = await AffilieModel.getByEmail(email);

      if (!affilie) {
        res.status(404).json({ success: false, message: 'Aucun compte affilié trouvé avec cette adresse email' });
        return;
      }

      if (affilie.statut !== 'actif') {
        res.status(403).json({ success: false, message: 'Ce compte affilié a été désactivé' });
        return;
      }

      const resultat = await AffilieCodeConnexionModel.verifierCode(affilie.id, code);
      if (!resultat.valide) {
        const messages: Record<string, string> = {
          expire: 'Ce code a expiré, veuillez en demander un nouveau',
          bloque: 'Trop de tentatives incorrectes, veuillez demander un nouveau code',
          invalide: 'Code invalide'
        };
        res.status(400).json({ success: false, message: messages[resultat.motif || 'invalide'] });
        return;
      }

      const token = generateAffilieToken(affilie);

      res.status(200).json({
        success: true,
        message: 'Connexion réussie',
        affilie,
        token
      });
    } catch (error: any) {
      logger.error('[AffilieController] Erreur lors de la vérification du code:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du code'
      });
    }
  }
}
