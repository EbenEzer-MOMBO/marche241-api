import { Request, Response } from 'express';
import { VendeurModel } from '../models/vendeur.model';
import { CreateVendeurData, Vendeur, StatutVendeur, DemandeCodeVerification, VerificationCode } from '../lib/database-types';
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
   * Crée un nouveau vendeur
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
      const { telephone } = req.body as DemandeCodeVerification;
      
      if (!telephone) {
        res.status(400).json({
          success: false,
          message: 'Le numéro de téléphone est obligatoire'
        });
        return;
      }
      
      // Vérifier si le vendeur existe
      let vendeur = await VendeurModel.getVendeurByTelephone(telephone);
      
      if (!vendeur) {
        // Si le vendeur n'existe pas, on le crée avec un nom temporaire
        vendeur = await VendeurModel.createVendeur({
          telephone,
          nom: `Vendeur ${telephone.slice(-4)}` // Utiliser les 4 derniers chiffres comme nom temporaire
        });
      }
      
      // Générer un code de vérification
      const code = await VendeurModel.generateVerificationCode(telephone);
      
      // Dans un environnement de production, on enverrait ce code par SMS ou WhatsApp
      // Pour le développement, on le renvoie directement dans la réponse
      
      res.status(200).json({
        success: true,
        message: 'Code de vérification envoyé avec succès',
        // En production, ne pas renvoyer le code dans la réponse
        code: process.env.NODE_ENV === 'development' ? code : undefined
      });
    } catch (error: any) {
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
      const { telephone, code } = req.body as VerificationCode;
      
      if (!telephone || !code) {
        res.status(400).json({
          success: false,
          message: 'Le numéro de téléphone et le code sont obligatoires'
        });
        return;
      }
      
      // Vérifier si le vendeur existe
      const vendeur = await VendeurModel.getVendeurByTelephone(telephone);
      
      if (!vendeur) {
        res.status(404).json({
          success: false,
          message: 'Vendeur non trouvé'
        });
        return;
      }
      
      // Vérifier le code
      const isValid = await VendeurModel.verifyCode(telephone, code);
      
      if (!isValid) {
        res.status(400).json({
          success: false,
          message: 'Code de vérification invalide ou expiré',
          tentatives_restantes: 3 - (vendeur.tentatives_code || 0)
        });
        return;
      }
      
      // Code valide, récupérer le vendeur mis à jour
      const vendeurMisAJour = await VendeurModel.getVendeurByTelephone(telephone);
      
      if (!vendeurMisAJour) {
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la récupération du vendeur après vérification'
        });
        return;
      }
      
      // Générer un token JWT
      const token = generateToken(vendeurMisAJour);
      
      res.status(200).json({
        success: true,
        message: 'Code de vérification valide',
        vendeur: vendeurMisAJour,
        token
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification du code',
        error: error.message
      });
    }
  }
}
