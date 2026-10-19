import { Router } from 'express';
import { AvisController } from '../controllers/avis.controller';
import { auth } from '../middlewares/auth.middleware';
import { authOrServiceKey, exigerCleService } from '../middlewares/service-auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { avisJetonLimiter, avisSoumissionLimiter, standardLimiter } from '../middlewares/rate-limit.middleware';
import { validateTurnstile } from '../middlewares/captcha.middleware';
import {
  approuverAvisSchema,
  approuverEnMasseSchema,
  avisIdParamSchema,
  jetonAvisParamSchema,
  listeAvisQuerySchema,
  listePublicsQuerySchema,
  parametresAvisSchema,
  produitIdParamSchema,
  rejeterAvisSchema,
  repondreAvisSchema,
  signalerAvisSchema,
  soumettreAvisSchema
} from '../utils/validation.schemas.avis';

const router = Router();

const admin = [authOrServiceKey, exigerCleService];

/**
 * @swagger
 * tags:
 *   - name: Avis
 *     description: Avis produits vérifiés par achat — invitation WhatsApp à jeton, modération par l'équipe
 *
 * components:
 *   schemas:
 *     AvisPublic:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         note: { type: integer, minimum: 1, maximum: 5 }
 *         commentaire: { type: string, nullable: true }
 *         auteur: { type: string, example: 'Aïcha M.' }
 *         achat_verifie: { type: boolean }
 *         date_creation: { type: string, format: date-time }
 *         reponse_vendeur: { type: string, nullable: true }
 *         date_reponse_vendeur: { type: string, format: date-time, nullable: true }
 *     AvisDetaille:
 *       type: object
 *       description: Avis vu par le vendeur ou l'équipe (nom complet et téléphone réservés au back-office)
 *       properties:
 *         id: { type: integer }
 *         produit_id: { type: integer }
 *         produit_nom: { type: string }
 *         boutique_nom: { type: string }
 *         numero_commande: { type: string, nullable: true }
 *         auteur: { type: string }
 *         note: { type: integer }
 *         commentaire: { type: string, nullable: true }
 *         statut: { type: string, enum: [en_attente, approuve, rejete] }
 *         reponse_vendeur: { type: string, nullable: true }
 *         signale_auto: { type: boolean }
 *         motifs_auto: { type: array, items: { type: string } }
 *         signale_par_vendeur: { type: boolean }
 *         motif_signalement: { type: string, nullable: true }
 *         motif_rejet: { type: string, nullable: true }
 *     ResumeAvisProduit:
 *       type: object
 *       properties:
 *         note_moyenne: { type: number, example: 4.5 }
 *         nombre_avis: { type: integer }
 *         afficher_note: { type: boolean, description: 'Vrai à partir du seuil (3 avis approuvés par défaut)' }
 *         repartition: { type: object, additionalProperties: { type: integer } }
 */

// ============================================================================
// Back-office (x-service-key) — déclarées en premier
// ============================================================================

/**
 * @swagger
 * /avis/admin:
 *   get:
 *     summary: Lister les avis (modération)
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     parameters:
 *       - { in: query, name: statut, schema: { type: string, enum: [en_attente, approuve, rejete] } }
 *       - { in: query, name: signales, schema: { type: boolean } }
 *       - { in: query, name: boutique_id, schema: { type: integer } }
 *       - { in: query, name: produit_id, schema: { type: integer } }
 *       - { in: query, name: note, schema: { type: integer, minimum: 1, maximum: 5 } }
 *       - { in: query, name: recherche, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: "{ success, avis: AvisDetaille[], pagination }" }
 *       403: { description: Clé de service requise }
 */
router.get('/admin', ...admin, validateQuery(listeAvisQuerySchema), AvisController.listerAdmin);

/**
 * @swagger
 * /avis/admin/stats:
 *   get:
 *     summary: Compteurs de modération (en attente, signalés, approuvés, rejetés, invitations 30 j)
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, stats }" }
 */
router.get('/admin/stats', ...admin, AvisController.stats);

/**
 * @swagger
 * /avis/admin/parametres:
 *   get:
 *     summary: Paramètres du module avis
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, parametres }" }
 *   put:
 *     summary: Modifier les paramètres (kill switch, délais, seuil, auto-approbation, mots interdits)
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               actif: { type: boolean }
 *               delai_invitation_jours: { type: integer }
 *               relance_jours: { type: integer }
 *               validite_jeton_jours: { type: integer }
 *               auto_approbation: { type: string, enum: [aucune, positifs_sans_texte_suspect] }
 *               seuil_affichage_note: { type: integer }
 *               mots_interdits: { type: array, items: { type: string } }
 *               longueur_max_commentaire: { type: integer }
 *     responses:
 *       200: { description: "{ success, parametres }" }
 *       400: { description: VALIDATION_ERROR }
 */
router.get('/admin/parametres', ...admin, AvisController.lireParametres);
router.put('/admin/parametres', ...admin, validate(parametresAvisSchema), AvisController.ecrireParametres);

/**
 * @swagger
 * /avis/admin/approuver-en-masse:
 *   post:
 *     summary: Approuver plusieurs avis (100 max)
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids: { type: array, items: { type: integer } }
 *               modere_par: { type: string }
 *     responses:
 *       200: { description: "{ success, approuves }" }
 */
router.post('/admin/approuver-en-masse', ...admin, validate(approuverEnMasseSchema), AvisController.approuverEnMasse);

/**
 * @swagger
 * /avis/admin/{id}:
 *   get:
 *     summary: Détail d'un avis (avec nom complet et téléphone du client)
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, avis }" }
 *       404: { description: AVIS_INTROUVABLE }
 *   delete:
 *     summary: Supprimer définitivement un avis (demande de retrait du client)
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, message }" }
 *       404: { description: AVIS_INTROUVABLE }
 */
router.get('/admin/:id', ...admin, validateParams(avisIdParamSchema), AvisController.detailAdmin);
router.delete('/admin/:id', ...admin, validateParams(avisIdParamSchema), AvisController.supprimer);

/**
 * @swagger
 * /avis/admin/{id}/approuver:
 *   post:
 *     summary: Approuver (publier) un avis — recalcule les notes et notifie le vendeur
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { modere_par: { type: string } } }
 *     responses:
 *       200: { description: "{ success, avis }" }
 *       404: { description: AVIS_INTROUVABLE }
 */
router.post('/admin/:id/approuver', ...admin, validateParams(avisIdParamSchema), validate(approuverAvisSchema), AvisController.approuver);

/**
 * @swagger
 * /avis/admin/{id}/rejeter:
 *   post:
 *     summary: Rejeter un avis (motif obligatoire) — recalcule les notes
 *     tags: [Avis]
 *     security: [{ serviceKey: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [motif]
 *             properties:
 *               motif: { type: string }
 *               modere_par: { type: string }
 *     responses:
 *       200: { description: "{ success, avis }" }
 *       400: { description: VALIDATION_ERROR }
 *       404: { description: AVIS_INTROUVABLE }
 */
router.post('/admin/:id/rejeter', ...admin, validateParams(avisIdParamSchema), validate(rejeterAvisSchema), AvisController.rejeter);

// ============================================================================
// Vendeur (JWT)
// ============================================================================

/**
 * @swagger
 * /avis/vendeur:
 *   get:
 *     summary: Avis sur les produits des boutiques du vendeur connecté
 *     tags: [Avis]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: statut, schema: { type: string, enum: [en_attente, approuve, rejete] } }
 *       - { in: query, name: boutique_id, schema: { type: integer } }
 *       - { in: query, name: produit_id, schema: { type: integer } }
 *       - { in: query, name: note, schema: { type: integer } }
 *       - { in: query, name: sans_reponse, schema: { type: boolean } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *     responses:
 *       200: { description: "{ success, avis: AvisDetaille[], sans_reponse, pagination }" }
 *       401: { description: Non authentifié }
 */
router.get('/vendeur', auth, validateQuery(listeAvisQuerySchema), AvisController.listerVendeur);

/**
 * @swagger
 * /avis/vendeur/{id}/reponse:
 *   put:
 *     summary: Répondre publiquement à un avis publié (modifiable 48 h)
 *     tags: [Avis]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [reponse], properties: { reponse: { type: string, maxLength: 1000 } } }
 *     responses:
 *       200: { description: "{ success, avis }" }
 *       404: { description: AVIS_INTROUVABLE (ou avis d'une autre boutique) }
 *       409: { description: AVIS_NON_PUBLIE ou DELAI_REPONSE_DEPASSE }
 */
router.put('/vendeur/:id/reponse', auth, validateParams(avisIdParamSchema), validate(repondreAvisSchema), AvisController.repondre);

/**
 * @swagger
 * /avis/vendeur/{id}/signaler:
 *   post:
 *     summary: Signaler un avis à l'équipe (le vendeur ne peut ni supprimer ni masquer)
 *     tags: [Avis]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [motif], properties: { motif: { type: string } } }
 *     responses:
 *       200: { description: "{ success, avis }" }
 *       404: { description: AVIS_INTROUVABLE }
 */
router.post('/vendeur/:id/signaler', auth, validateParams(avisIdParamSchema), validate(signalerAvisSchema), AvisController.signaler);

// ============================================================================
// Public
// ============================================================================

/**
 * @swagger
 * /avis/produit/{produitId}:
 *   get:
 *     summary: Avis publiés d'un produit et résumé de la note
 *     tags: [Avis]
 *     parameters:
 *       - { in: path, name: produitId, required: true, schema: { type: integer } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 10, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "{ success, avis: AvisPublic[], resume: ResumeAvisProduit, pagination }"
 *       404: { description: PRODUIT_INTROUVABLE }
 */
router.get(
  '/produit/:produitId',
  standardLimiter,
  validateParams(produitIdParamSchema),
  validateQuery(listePublicsQuerySchema),
  AvisController.listerPublics
);

/**
 * @swagger
 * /avis/invitation/{jeton}:
 *   get:
 *     summary: Invitation à laisser un avis (lien WhatsApp) — produits de la commande à noter
 *     tags: [Avis]
 *     parameters: [{ in: path, name: jeton, required: true, schema: { type: string } }]
 *     responses:
 *       200: { description: "{ success, invitation, longueur_max_commentaire }" }
 *       403: { description: AVIS_DESACTIVES (kill switch) }
 *       404: { description: INVITATION_INVALIDE (inconnue, expirée ou commande non livrée — réponse identique) }
 *       429: { description: Trop de tentatives }
 *   post:
 *     summary: Envoyer les avis d'une invitation (Turnstile, pot de miel, durée minimale de remplissage)
 *     tags: [Avis]
 *     parameters: [{ in: path, name: jeton, required: true, schema: { type: string } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [avis]
 *             properties:
 *               avis:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [produit_id, note]
 *                   properties:
 *                     produit_id: { type: integer }
 *                     note: { type: integer, minimum: 1, maximum: 5 }
 *                     commentaire: { type: string }
 *               site_web: { type: string, description: 'Pot de miel : doit rester vide' }
 *               rempli_en_ms: { type: integer, description: 'Durée de remplissage du formulaire (≥ 5 000 ms)' }
 *               turnstileToken: { type: string }
 *     responses:
 *       201: { description: "{ success, resultat: { crees, en_moderation, ignores, terminee } }" }
 *       200: { description: Aucun nouvel avis (produits déjà notés) }
 *       400: { description: VALIDATION_ERROR, CAPTCHA_REQUIRED ou SOUMISSION_TROP_RAPIDE }
 *       403: { description: AVIS_DESACTIVES ou CAPTCHA_INVALID }
 *       404: { description: INVITATION_INVALIDE }
 */
router.get('/invitation/:jeton', avisJetonLimiter, validateParams(jetonAvisParamSchema), AvisController.invitation);
router.post(
  '/invitation/:jeton',
  avisJetonLimiter,
  avisSoumissionLimiter,
  validateParams(jetonAvisParamSchema),
  validateTurnstile,
  validate(soumettreAvisSchema),
  AvisController.soumettre
);

export default router;
