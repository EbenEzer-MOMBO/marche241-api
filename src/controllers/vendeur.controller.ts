import { Request, Response } from 'express';
import { VendeurModel } from '../models/vendeur.model';
import { DemandeCodeVerification, VerificationCode, ConnexionVendeur, CreateVendeurData, Vendeur, StatutVendeur } from '../lib/database-types';
import { EmailService } from '../services/email.service';
import jwt from 'jsonwebtoken';
import { generateToken } from '../utils/jwt.utils';

export class VendeurController {
  /**
   * Récupère tous les vendeurs avec pagination
   */
  static async getAllVendeurs(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limite = parseInt(req.query.limite as string) || 10;
      const tri_par = req.query.tri_par as string || 'date_creation';
      const ordre = (req.query.ordre as 'ASC' | 'DESC') || 'DESC';

      const vendeurs = await VendeurModel.getAllVendeurs({
        page,
        limite,
        tri_par,
        ordre
      });

      res.status(200).json(vendeurs);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des vendeurs',
        error: error.message
      });
    }
  }

  /**
   * Récupère un vendeur par son ID
   */
  static async getVendeurById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de vendeur invalide'
        });
        return;
      }

      const vendeur = await VendeurModel.getVendeurById(id);
      
      if (!vendeur) {
        res.status(404).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
        return;
      }

      res.status(200).json({
        success: true,
        vendeur
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du vendeur',
        error: error.message
      });
    }
  }

  /**
   * Inscription complète d'un vendeur avec envoi du code de vérification
   */
  static async inscrireVendeur(req: Request, res: Response): Promise<void> {
    try {
      const { email, nom, telephone, ville } = req.body as CreateVendeurData;
      
      // Validation basique de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          message: 'L\'adresse email n\'est pas valide'
        });
        return;
      }
      
      // Créer le vendeur et générer le code
      const { vendeur, code } = await VendeurModel.inscrireVendeur({
        email,
        nom,
        telephone,
        ville
      });
      
      // Envoyer le code par email
      try {
        await EmailService.envoyerCodeVerification(email, code, nom);
        
        res.status(201).json({
          success: true,
          message: 'Compte créé avec succès. Un code de vérification a été envoyé par email.',
          vendeur: {
            id: vendeur.id,
            email: vendeur.email,
            nom: vendeur.nom,
            telephone: vendeur.telephone,
            ville: vendeur.ville,
            statut: vendeur.statut,
            date_creation: vendeur.date_creation
          },
          // En développement, on peut renvoyer le code pour faciliter les tests
          code: process.env.NODE_ENV === 'development' ? code : undefined
        });
      } catch (emailError: any) {
        console.error('Erreur lors de l\'envoi de l\'email d\'inscription:', emailError);
        
        // Si l'envoi d'email échoue, on renvoie quand même une réponse positive
        // mais on log l'erreur pour investigation
        res.status(201).json({
          success: true,
          message: 'Compte créé avec succès. Veuillez vérifier votre email pour le code de vérification.',
          vendeur: {
            id: vendeur.id,
            email: vendeur.email,
            nom: vendeur.nom,
            telephone: vendeur.telephone,
            ville: vendeur.ville,
            statut: vendeur.statut,
            date_creation: vendeur.date_creation
          },
          // En développement, on peut renvoyer le code même si l'email échoue
          code: process.env.NODE_ENV === 'development' ? code : undefined,
          warning: 'Email non envoyé - Veuillez contacter le support si nécessaire'
        });
      }
    } catch (error: any) {
      console.error('Erreur dans inscrireVendeur:', error);
      
      if (error.message.includes('adresse email existe déjà')) {
        res.status(409).json({
          success: false,
          message: 'Un compte avec cette adresse email existe déjà'
        });
      } else if (error.message.includes('numéro de téléphone existe déjà')) {
        res.status(409).json({
          success: false,
          message: 'Un compte avec ce numéro de téléphone existe déjà'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la création du compte',
          error: error.message
        });
      }
    }
  }

  /**
   * Crée un nouveau vendeur (ancienne méthode - conservée pour compatibilité)
   */
  static async createVendeur(req: Request, res: Response): Promise<void> {
    try {
      const vendeurData: CreateVendeurData = req.body;
      
      // Vérifier que les champs obligatoires sont présents
      if (!vendeurData.telephone || !vendeurData.nom) {
        res.status(400).json({
          success: false,
          message: 'Les champs telephone et nom sont obligatoires'
        });
        return;
      }
      
      // Vérifier si le vendeur existe déjà
      const existingVendeur = await VendeurModel.getVendeurByTelephone(vendeurData.telephone);
      if (existingVendeur) {
        res.status(400).json({
          success: false,
          message: 'Un vendeur avec ce numéro de téléphone existe déjà'
        });
        return;
      }

      const nouveauVendeur = await VendeurModel.createVendeur(vendeurData);

      res.status(201).json({
        success: true,
        message: 'Vendeur créé avec succès',
        vendeur: nouveauVendeur
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du vendeur',
        error: error.message
      });
    }
  }

  /**
   * Met à jour un vendeur existant
   */
  static async updateVendeur(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const vendeurData: Partial<Vendeur> = req.body;
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de vendeur invalide'
        });
        return;
      }
      
      // Vérifier si le vendeur existe
      const existingVendeur = await VendeurModel.getVendeurById(id);
      if (!existingVendeur) {
        res.status(404).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
        return;
      }

      const vendeurMisAJour = await VendeurModel.updateVendeur(id, vendeurData);

      res.status(200).json({
        success: true,
        message: 'Vendeur mis à jour avec succès',
        vendeur: vendeurMisAJour
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du vendeur',
        error: error.message
      });
    }
  }

  /**
   * Supprime un vendeur
   */
  static async deleteVendeur(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          message: 'ID de vendeur invalide'
        });
        return;
      }
      
      // Vérifier si le vendeur existe
      const existingVendeur = await VendeurModel.getVendeurById(id);
      if (!existingVendeur) {
        res.status(404).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
        return;
      }

      await VendeurModel.deleteVendeur(id);

      res.status(200).json({
        success: true,
        message: 'Vendeur supprimé avec succès'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du vendeur',
        error: error.message
      });
    }
  }

  /**
   * Demande un code de vérification pour un vendeur
   */
  static async demanderCodeVerification(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body as DemandeCodeVerification;
      
      if (!email) {
        res.status(400).json({
          success: false,
          message: 'L\'adresse email est obligatoire'
        });
        return;
      }

      // Validation basique de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          message: 'L\'adresse email n\'est pas valide'
        });
        return;
      }
      
      // Vérifier si le vendeur existe
      const vendeur = await VendeurModel.getVendeurByEmail(email);
      
      if (!vendeur) {
        res.status(404).json({
          success: false,
          message: 'Aucun compte vendeur trouvé avec cette adresse email. Veuillez vous inscrire d\'abord.'
        });
        return;
      }
      
      // Générer un code de vérification
      const code = await VendeurModel.generateVerificationCodeByEmail(email);
      
      // Envoyer le code par email
      try {
        await EmailService.envoyerCodeVerification(email, code, vendeur.nom);
        
        res.status(200).json({
          success: true,
          message: 'Code de vérification envoyé par email avec succès',
          // En développement, on peut renvoyer le code pour faciliter les tests
          code: process.env.NODE_ENV === 'development' ? code : undefined
        });
      } catch (emailError: any) {
        console.error('Erreur lors de l\'envoi de l\'email:', emailError);
        
        // Si l'envoi d'email échoue, on renvoie quand même une réponse positive
        // mais on log l'erreur pour investigation
        res.status(200).json({
          success: true,
          message: 'Code de vérification généré avec succès',
          // En cas d'erreur d'envoi, on renvoie le code en développement
          code: process.env.NODE_ENV === 'development' ? code : undefined,
          warning: process.env.NODE_ENV === 'development' ? 'Email non envoyé - erreur de service' : undefined
        });
      }
    } catch (error: any) {
      console.error('Erreur dans demanderCodeVerification:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la demande de code de vérification',
        error: error.message
      });
    }
  }

  /**
   * Vérifie un code de vérification
   */
  static async verifierCode(req: Request, res: Response): Promise<void> {
    try {
      const { email, code } = req.body as VerificationCode;
      
      if (!email || !code) {
        res.status(400).json({
          success: false,
          message: 'L\'adresse email et le code sont obligatoires'
        });
        return;
      }

      // Validation basique de l'email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          message: 'L\'adresse email n\'est pas valide'
        });
        return;
      }
      
      // Vérifier si le vendeur existe
      const vendeur = await VendeurModel.getVendeurByEmail(email);
      
      if (!vendeur) {
        res.status(404).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
        return;
      }
      
      // Vérifier le code
      const isValid = await VendeurModel.verifyCodeByEmail(email, code);
      
      if (!isValid) {
        res.status(400).json({
          success: false,
          message: 'Code de vérification invalide ou expiré',
          tentatives_restantes: Math.max(0, 3 - (vendeur.tentatives_code || 0))
        });
        return;
      }
      
      // Code valide, récupérer le vendeur mis à jour
      const vendeurMisAJour = await VendeurModel.getVendeurByEmail(email);
      
      if (!vendeurMisAJour) {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la récupération du vendeur après vérification'
        });
        return;
      }
      
      // Envoyer un email de bienvenue si c'est la première vérification
      if (vendeur.statut === 'en_attente_verification') {
        try {
          await EmailService.envoyerEmailBienvenue(email, vendeurMisAJour.nom);
        } catch (emailError: any) {
          console.error('Erreur lors de l\'envoi de l\'email de bienvenue:', emailError);
          // On continue même si l'email de bienvenue échoue
        }
      }
      
      // Générer un token JWT
      const token = generateToken(vendeurMisAJour);
      
      res.status(200).json({
        success: true,
        message: 'Code de vérification valide - Connexion réussie',
        vendeur: vendeurMisAJour,
        token
      });
    } catch (error: any) {
      console.error('Erreur dans verifierCode:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du code',
        error: error.message
      });
    }
  }
}
