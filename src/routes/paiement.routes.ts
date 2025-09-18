import { Router } from 'express';
import { PaiementController } from '../controllers/paiement.controller';
import { auth } from '../middlewares/auth.middleware';
import { validate, validateParams } from '../middlewares/validation.middleware';
import { idParamSchema } from '../utils/validation.schemas';
import { initierPaiementMobileSchema, initierPaiementVisaSchema, verifierPaiementSchema } from '../utils/validation.schemas.paiement';

const router = Router();

/**
 * @swagger
 * /api/v1/paiements/mobile:
 *   post:
 *     summary: Initialise un paiement mobile (Airtel Money ou Moov Money)
 *     description: Initialise un paiement mobile et envoie un push USSD
 *     tags: [Paiements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - msisdn
 *               - amount
 *               - reference
 *               - payment_system
 *               - description
 *               - lastname
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email du client
 *               msisdn:
 *                 type: string
 *                 description: Numéro de téléphone au format international
 *               amount:
 *                 type: number
 *                 description: Montant en francs CFA
 *               reference:
 *                 type: string
 *                 description: Référence unique de la transaction
 *               payment_system:
 *                 type: string
 *                 enum: [airtelmoney, moovmoney1]
 *                 description: Système de paiement mobile
 *               description:
 *                 type: string
 *                 description: Description courte du paiement
 *               lastname:
 *                 type: string
 *                 description: Nom du client
 *               firstname:
 *                 type: string
 *                 description: Prénom du client (optionnel)
 *     responses:
 *       200:
 *         description: Paiement mobile initialisé avec succès
 *       400:
 *         description: Paramètres invalides
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/paiements/mobile
 * @desc    Initialise un paiement mobile
 * @access  Public
 */
router.post('/mobile', validate(initierPaiementMobileSchema), PaiementController.initierPaiementMobile);

/**
 * @swagger
 * /api/v1/paiements/visa:
 *   post:
 *     summary: Initialise un paiement par carte bancaire (Visa)
 *     description: Initialise un paiement Visa et retourne l'URL de redirection
 *     tags: [Paiements]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transaction_id
 *               - return_url
 *             properties:
 *               transaction_id:
 *                 type: number
 *                 description: ID de la transaction
 *               return_url:
 *                 type: string
 *                 description: URL de retour après le paiement
 *               email:
 *                 type: string
 *                 description: Email du client (optionnel)
 *               msisdn:
 *                 type: string
 *                 description: Numéro de téléphone (optionnel)
 *               lastname:
 *                 type: string
 *                 description: Nom du client (optionnel)
 *               firstname:
 *                 type: string
 *                 description: Prénom du client (optionnel)
 *     responses:
 *       200:
 *         description: Paiement Visa initialisé avec succès
 *       400:
 *         description: Paramètres invalides
 *       404:
 *         description: Transaction non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/paiements/visa
 * @desc    Initialise un paiement Visa
 * @access  Public
 */
router.post('/visa', validate(initierPaiementVisaSchema), PaiementController.initierPaiementVisa);

/**
 * @swagger
 * /api/v1/paiements/verification/{bill_id}:
 *   get:
 *     summary: Vérifie l'état d'un paiement
 *     description: Vérifie l'état d'un paiement via son bill_id
 *     tags: [Paiements]
 *     parameters:
 *       - in: path
 *         name: bill_id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la facture (bill_id)
 *     responses:
 *       200:
 *         description: Paiement vérifié avec succès
 *       400:
 *         description: Paramètres invalides ou paiement non confirmé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/paiements/verification/:bill_id
 * @desc    Vérifie l'état d'un paiement
 * @access  Public
 */
router.get('/verification/:bill_id', validateParams(verifierPaiementSchema), PaiementController.verifierPaiement);

export default router;
