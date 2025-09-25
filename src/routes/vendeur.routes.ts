import { Router } from 'express';
import { VendeurController } from '../controllers/vendeur.controller';
import { auth, isAdmin } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { 
  createVendeurSchema, 
  updateVendeurSchema, 
  demandeCodeSchema, 
  verificationCodeSchema,
  idParamSchema,
  paginationQuerySchema 
} from '../utils/validation.schemas';

const router = Router();

/**
 * @route   GET /api/v1/vendeurs
 * @desc    Récupère tous les vendeurs avec pagination
 * @access  Private (admin)
 */
router.get('/', auth, isAdmin, validateQuery(paginationQuerySchema), VendeurController.getAllVendeurs);

/**
 * @route   GET /api/v1/vendeurs/:id
 * @desc    Récupère un vendeur par son ID
 * @access  Private (vendeur authentifié ou admin)
 */
router.get('/:id', auth, validateParams(idParamSchema), VendeurController.getVendeurById);

/**
 * @swagger
 * /api/v1/vendeurs/inscription:
 *   post:
 *     summary: Inscription complète d'un vendeur avec envoi du code de vérification
 *     description: Crée un nouveau compte vendeur et envoie immédiatement un code de vérification par email. Processus d'inscription en une étape.
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - nom
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Adresse email du vendeur (identifiant unique)
 *                 example: "vendeur@example.com"
 *               nom:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Nom complet du vendeur
 *                 example: "Jean Dupont"
 *               telephone:
 *                 type: string
 *                 description: Numéro de téléphone (optionnel)
 *                 example: "+241 01 23 45 67"
 *               ville:
 *                 type: string
 *                 description: Ville du vendeur (optionnel)
 *                 example: "Libreville"
 *     responses:
 *       201:
 *         description: Compte créé avec succès et code envoyé
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Compte créé avec succès. Un code de vérification a été envoyé par email."
 *                 vendeur:
 *                   $ref: '#/components/schemas/Vendeur'
 *                 code:
 *                   type: string
 *                   description: Code de vérification (uniquement en mode développement)
 *                   example: "123456"
 *       400:
 *         description: Données invalides
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 *       409:
 *         description: Email ou téléphone déjà utilisé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 *             examples:
 *               email_existe:
 *                 summary: Email déjà utilisé
 *                 value:
 *                   success: false
 *                   message: "Un compte avec cette adresse email existe déjà"
 *               telephone_existe:
 *                 summary: Téléphone déjà utilisé
 *                 value:
 *                   success: false
 *                   message: "Un compte avec ce numéro de téléphone existe déjà"
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 */
router.post('/inscription', validate(createVendeurSchema), VendeurController.inscrireVendeur);

/**
 * @swagger
 * /api/v1/vendeurs:
 *   post:
 *     summary: Crée un nouveau compte vendeur (méthode basique)
 *     description: Crée un nouveau compte vendeur sans envoi automatique de code. Utilisez /inscription pour un processus complet.
 *     tags: [Vendeurs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - nom
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Adresse email du vendeur (identifiant unique)
 *                 example: "vendeur@example.com"
 *               nom:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Nom complet du vendeur
 *                 example: "Jean Dupont"
 *               telephone:
 *                 type: string
 *                 description: Numéro de téléphone (optionnel)
 *                 example: "+241 01 23 45 67"
 *               ville:
 *                 type: string
 *                 description: Ville du vendeur (optionnel)
 *                 example: "Libreville"
 *     responses:
 *       201:
 *         description: Vendeur créé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Vendeur créé avec succès"
 *                 vendeur:
 *                   $ref: '#/components/schemas/Vendeur'
 *       400:
 *         description: Données invalides ou email déjà utilisé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 */
router.post('/', validate(createVendeurSchema), VendeurController.createVendeur);

/**
 * @route   PUT /api/v1/vendeurs/:id
 * @desc    Met à jour un vendeur existant
 * @access  Private (vendeur authentifié)
 */
router.put('/:id', auth, validateParams(idParamSchema), validate(updateVendeurSchema), VendeurController.updateVendeur);

/**
 * @route   DELETE /api/v1/vendeurs/:id
 * @desc    Supprime un vendeur
 * @access  Private (admin)
 */
router.delete('/:id', auth, isAdmin, validateParams(idParamSchema), VendeurController.deleteVendeur);

/**
 * @swagger
 * /api/v1/vendeurs/code:
 *   post:
 *     summary: Demande un code de vérification par email
 *     description: Envoie un code de vérification à 6 chiffres à l'adresse email du vendeur. Le vendeur doit déjà avoir un compte.
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DemandeCodeVerification'
 *     responses:
 *       200:
 *         description: Code de vérification envoyé avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReponseCodeVerification'
 *       400:
 *         description: Adresse email invalide
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 *             example:
 *               success: false
 *               message: "L'adresse email n'est pas valide"
 *       404:
 *         description: Aucun compte vendeur trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 *             example:
 *               success: false
 *               message: "Aucun compte vendeur trouvé avec cette adresse email. Veuillez vous inscrire d'abord."
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 */
router.post('/code', validate(demandeCodeSchema), VendeurController.demanderCodeVerification);

/**
 * @swagger
 * /api/v1/vendeurs/verification:
 *   post:
 *     summary: Vérifie un code de vérification et connecte le vendeur
 *     description: Vérifie le code de vérification à 6 chiffres et retourne un token JWT si valide. Envoie également un email de bienvenue pour les nouveaux comptes.
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerificationCode'
 *     responses:
 *       200:
 *         description: Code vérifié avec succès, vendeur connecté
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReponseVerificationCode'
 *       400:
 *         description: Code invalide ou expiré
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurCodeInvalide'
 *       404:
 *         description: Vendeur non trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 *             example:
 *               success: false
 *               message: "Vendeur non trouvé"
 *       500:
 *         description: Erreur serveur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErreurAuthentification'
 */
router.post('/verification', validate(verificationCodeSchema), VendeurController.verifierCode);

export default router;
