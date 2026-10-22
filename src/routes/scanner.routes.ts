import { Router } from 'express';
import Joi from 'joi';
import { ScannerController } from '../controllers/scanner.controller';
import { auth } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { scannerLimiter } from '../middlewares/rate-limit.middleware';

/**
 * Scanner de billets (PWA marche241_scan) : réservé au vendeur propriétaire de l'événement.
 */
const router = Router();

const MAX_SCANS_PAR_LOT = 200;

const produitIdParamSchema = Joi.object({
  produitId: Joi.number().integer().positive().required().messages({
    'number.base': "L'ID de l'événement doit être un nombre",
    'number.integer': "L'ID de l'événement doit être un entier",
    'number.positive': "L'ID de l'événement doit être positif",
    'any.required': "L'ID de l'événement est obligatoire"
  })
});

const billetsQuerySchema = Joi.object({
  depuis: Joi.date().iso().messages({
    'date.base': 'Le paramètre depuis doit être une date',
    'date.format': 'Le paramètre depuis doit être une date ISO 8601'
  })
});

const champProduitId = Joi.number().integer().positive().required().messages({
  'number.base': "L'ID de l'événement doit être un nombre",
  'number.integer': "L'ID de l'événement doit être un entier",
  'number.positive': "L'ID de l'événement doit être positif",
  'any.required': "L'ID de l'événement est obligatoire"
});

const champQr = Joi.string().trim().max(200).messages({
  'string.base': 'Le QR code doit être un texte',
  'string.empty': 'Le QR code est vide',
  'string.max': 'Le QR code est trop long'
});

const champBilletId = Joi.number().integer().positive().messages({
  'number.base': "L'ID du billet doit être un nombre",
  'number.integer': "L'ID du billet doit être un entier",
  'number.positive': "L'ID du billet doit être positif"
});

const champAppareilId = Joi.string().trim().max(64).pattern(/^[A-Za-z0-9_-]+$/).messages({
  'string.base': "L'identifiant d'appareil doit être un texte",
  'string.max': "L'identifiant d'appareil est trop long",
  'string.pattern.base': "L'identifiant d'appareil contient des caractères non autorisés"
});

const messageQrOuBillet = {
  'object.xor': 'Indiquez soit le QR code, soit le billet (saisie manuelle)',
  'object.missing': 'Indiquez soit le QR code, soit le billet (saisie manuelle)'
};

const scanSchema = Joi.object({
  produit_id: champProduitId,
  qr: champQr,
  billet_id: champBilletId,
  appareil_id: champAppareilId
})
  .xor('qr', 'billet_id')
  .messages(messageQrOuBillet);

const lotSchema = Joi.object({
  produit_id: champProduitId,
  appareil_id: champAppareilId,
  scans: Joi.array()
    .min(1)
    .max(MAX_SCANS_PAR_LOT)
    .required()
    .items(
      Joi.object({
        id_local: Joi.string().trim().max(64).required().messages({
          'string.base': "L'identifiant local du scan doit être un texte",
          'string.empty': "L'identifiant local du scan est obligatoire",
          'any.required': "L'identifiant local du scan est obligatoire"
        }),
        qr: champQr,
        billet_id: champBilletId,
        scanne_a: Joi.date().iso().required().messages({
          'date.base': "L'heure du scan doit être une date",
          'date.format': "L'heure du scan doit être une date ISO 8601",
          'any.required': "L'heure du scan est obligatoire"
        })
      })
        .xor('qr', 'billet_id')
        .messages(messageQrOuBillet)
    )
    .messages({
      'array.base': 'Les scans doivent être une liste',
      'array.min': 'Aucun scan à synchroniser',
      'array.max': `Au plus ${MAX_SCANS_PAR_LOT} scans par envoi`,
      'any.required': 'La liste des scans est obligatoire'
    })
});

/**
 * @swagger
 * tags:
 *   - name: Scanner
 *     description: Contrôle des billets à l'entrée (PWA scan.marche241.ga), réservé au vendeur de l'événement
 * components:
 *   schemas:
 *     BilletScanner:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         numero: { type: integer }
 *         type_billet: { type: string, example: VIP }
 *         titulaire: { type: string, description: Titulaire du billet nommé, sinon l'acheteur }
 *         acheteur: { type: string }
 *         telephone: { type: string, nullable: true }
 *         numero_commande: { type: string }
 *         scanne_le: { type: string, format: date-time, nullable: true }
 *     ResultatScan:
 *       type: object
 *       properties:
 *         success: { type: boolean, description: true uniquement si le billet vient d'être validé }
 *         code:
 *           type: string
 *           enum: [SCAN_REUSSI, BILLET_DEJA_SCANNE, BILLET_INTROUVABLE, MAUVAIS_EVENEMENT, COMMANDE_NON_VALIDE, HORS_FENETRE, QR_INVALIDE]
 *         message: { type: string }
 *         billet: { $ref: '#/components/schemas/BilletScanner' }
 *         scanne_le: { type: string, format: date-time, nullable: true }
 *         autre_evenement: { type: string, nullable: true, description: MAUVAIS_EVENEMENT, si l'autre événement est au même vendeur }
 *         ouverture_scan: { type: string, format: date-time, description: HORS_FENETRE }
 *         fermeture_scan: { type: string, format: date-time, description: HORS_FENETRE }
 */

/**
 * @swagger
 * /scanner/evenements:
 *   get:
 *     summary: Événements du vendeur avec leur fenêtre de scan
 *     description: Fenêtre = 1 h avant le début jusqu'à la fin (début + 12 h si la fin n'est pas saisie). Les événements terminés depuis plus de 30 jours sont masqués.
 *     tags: [Scanner]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des événements
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 evenements:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       nom: { type: string }
 *                       image: { type: string, nullable: true }
 *                       lieu: { type: string, nullable: true }
 *                       boutique: { type: object, properties: { id: { type: integer }, nom: { type: string }, slug: { type: string } } }
 *                       date_debut: { type: string, format: date-time, nullable: true }
 *                       date_fin: { type: string, format: date-time, nullable: true }
 *                       fin_par_defaut: { type: boolean }
 *                       ouverture_scan: { type: string, format: date-time, nullable: true }
 *                       fermeture_scan: { type: string, format: date-time, nullable: true }
 *                       etat_scan: { type: string, enum: [ouvert, a_venir, termine, sans_date] }
 *                       billets_vendus: { type: integer, description: Billets valides (commande payée, ni annulée ni remboursée) }
 *                       billets_scannes: { type: integer }
 *       401:
 *         description: Non authentifié
 */
router.get('/evenements', auth, scannerLimiter, ScannerController.evenements);

/**
 * @swagger
 * /scanner/evenements/{produitId}/billets:
 *   get:
 *     summary: Billets de l'événement pour le cache semi-offline du scanner
 *     description: Chaque billet porte une empreinte sha256("jeton|numero") au lieu du jeton, pour contrôler un QR hors-ligne sans exposer les jetons.
 *     tags: [Scanner]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: produitId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: depuis
 *         schema: { type: string, format: date-time }
 *         description: Synchro différentielle (billets émis, scannés ou dont la commande a changé depuis cette date)
 *     responses:
 *       200:
 *         description: Billets de l'événement
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 genere_le: { type: string, format: date-time }
 *                 complet: { type: boolean, description: false pour une synchro différentielle }
 *                 ids_billets:
 *                   type: array
 *                   nullable: true
 *                   items: { type: integer }
 *                   description: Synchro différentielle seulement — tous les billets existants (retirer du cache les autres)
 *                 fenetre:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     ouverture: { type: string, format: date-time }
 *                     fermeture: { type: string, format: date-time }
 *                     fin_par_defaut: { type: boolean }
 *                 billets:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/BilletScanner'
 *                       - type: object
 *                         properties:
 *                           empreinte: { type: string }
 *                           valide: { type: boolean, description: Commande payée, ni annulée ni remboursée }
 *       400:
 *         description: Paramètres invalides (VALIDATION_ERROR)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Événement d'un autre vendeur
 *       404:
 *         description: Événement introuvable
 */
router.get(
  '/evenements/:produitId/billets',
  auth,
  scannerLimiter,
  validateParams(produitIdParamSchema),
  validateQuery(billetsQuerySchema),
  ScannerController.billets
);

/**
 * @swagger
 * /scanner/scan:
 *   post:
 *     summary: Contrôler un billet (QR ou saisie manuelle)
 *     description: Validation atomique (un billet n'est validé qu'une fois, même scanné en parallèle, et seulement si sa commande est valide au même instant). Toute tentative est journalisée. Un refus métier répond 200 avec success=false et un code. En saisie manuelle, un billet d'un autre événement répond BILLET_INTROUVABLE.
 *     tags: [Scanner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [produit_id]
 *             properties:
 *               produit_id: { type: integer }
 *               qr: { type: string, example: "M241|3f9c...|12", description: Contenu brut du QR (exclusif avec billet_id) }
 *               billet_id: { type: integer, description: Saisie manuelle (exclusif avec qr) }
 *               appareil_id: { type: string, maxLength: 64 }
 *     responses:
 *       200:
 *         description: Résultat du contrôle
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResultatScan' }
 *       400:
 *         description: Paramètres invalides (VALIDATION_ERROR)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Événement d'un autre vendeur
 *       404:
 *         description: Événement introuvable
 */
router.post('/scan', auth, scannerLimiter, validate(scanSchema), ScannerController.scanner);

/**
 * @swagger
 * /scanner/scans/lot:
 *   post:
 *     summary: Synchroniser les scans faits hors-ligne
 *     description: Traités dans l'ordre de la file ; le premier scan reçu par le serveur gagne (conflit = BILLET_DEJA_SCANNE). La fenêtre est contrôlée sur l'heure de l'appareil, avec une tolérance de 10 minutes.
 *     tags: [Scanner]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [produit_id, scans]
 *             properties:
 *               produit_id: { type: integer }
 *               appareil_id: { type: string, maxLength: 64 }
 *               scans:
 *                 type: array
 *                 maxItems: 200
 *                 items:
 *                   type: object
 *                   required: [id_local, scanne_a]
 *                   properties:
 *                     id_local: { type: string }
 *                     qr: { type: string }
 *                     billet_id: { type: integer }
 *                     scanne_a: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Résultat par scan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 resultats:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/ResultatScan'
 *                       - type: object
 *                         properties:
 *                           id_local: { type: string }
 *       400:
 *         description: Paramètres invalides (VALIDATION_ERROR)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Événement d'un autre vendeur
 *       404:
 *         description: Événement introuvable
 */
router.post('/scans/lot', auth, scannerLimiter, validate(lotSchema), ScannerController.scannerLot);

export default router;
