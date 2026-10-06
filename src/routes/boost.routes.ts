import { NextFunction, Request, Response, Router } from 'express';
import { BoostController } from '../controllers/boost.controller';
import { auth, isBoutiqueOwner } from '../middlewares/auth.middleware';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { paymentLimiter } from '../middlewares/rate-limit.middleware';
import {
  approuverBoostSchema,
  boostIdParamSchema,
  boutiqueIdParamSchema,
  connexionMetaSchema,
  creerBoostSchema,
  devisSchema,
  estimationAudienceSchema,
  estimationImpressionsSchema,
  listeAdminQuerySchema,
  modifierBoostSchema,
  paiementBoostSchema,
  parametresBoostSchema,
  prefillQuerySchema,
  refuserBoostSchema,
  remboursementBoostSchema
} from '../utils/validation.schemas.boost';

const router = Router();

/** Routes de supervision : clé de service du back-office uniquement (pas de JWT vendeur, même admin). */
const exigerCleService = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.isAdmin || req.vendeur) {
    res.status(403).json({ success: false, message: 'Accès réservé au back-office Marché 241' });
    return;
  }
  next();
};
const admin = [authOrServiceKey, exigerCleService];

/**
 * @swagger
 * tags:
 *   - name: Boosts
 *     description: Boost publicitaire Meta Ads (Facebook & Instagram) — paiement à l'acte, validation Marché 241
 */

// ============================================================================
// Back-office (x-service-key) — déclarées avant /:id
// ============================================================================

/**
 * @swagger
 * /boosts/admin:
 *   get:
 *     summary: Lister les boosts (hors brouillons par défaut)
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     parameters:
 *       - { in: query, name: statut, schema: { type: string } }
 *       - { in: query, name: statut_remboursement, schema: { type: string, enum: [aucun, a_rembourser, rembourse] } }
 *       - { in: query, name: boutique_id, schema: { type: integer } }
 *       - { in: query, name: recherche, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 20 } }
 *     responses:
 *       200: { description: "{ success, boosts, total, page, limite }" }
 *       403: { description: Clé de service requise }
 */
router.get('/admin', ...admin, validateQuery(listeAdminQuerySchema), BoostController.listerAdmin);

/**
 * @swagger
 * /boosts/admin/stats:
 *   get:
 *     summary: Nombre de boosts par statut et remboursements en attente
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, stats }" }
 */
router.get('/admin/stats', ...admin, BoostController.statsAdmin);

/**
 * @swagger
 * /boosts/admin/parametres:
 *   get:
 *     summary: Paramètres du boost (commission, bornes, packs, FX, CPM, kill switch)
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, parametres, conformite_items }" }
 *   put:
 *     summary: Modifier les paramètres du boost
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               commission_bps: { type: integer, example: 2000 }
 *               commission_min_fcfa: { type: integer, example: 1000 }
 *               total_min_fcfa: { type: integer, example: 3000 }
 *               total_max_fcfa: { type: integer, example: 500000 }
 *               packs: { type: array, items: { type: object } }
 *               kill_switch: { type: boolean }
 *     responses:
 *       200: { description: "{ success, parametres }" }
 *       400: { description: VALIDATION_ERROR }
 */
router.get('/admin/parametres', ...admin, BoostController.getParametresAdmin);
router.put('/admin/parametres', ...admin, validate(parametresBoostSchema), BoostController.majParametres);

/**
 * @swagger
 * /boosts/admin/meta/sante:
 *   get:
 *     summary: État de la connexion Meta (choix enregistré, dernière vérification, raisons de blocage) — aucun secret, aucun appel Meta
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, sante: { ok, raisons[], dry_run, graph_version, secrets, connexion } }" }
 * /boosts/admin/meta/decouverte:
 *   get:
 *     summary: Comptes publicitaires et Pages accessibles avec le jeton Meta (suggestion si un seul choix)
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, decouverte: { comptes[], pages[], suggestion } }" }
 *       409: { description: META_SECRETS_MANQUANTS }
 *       502: { description: Erreur Meta (message lisible) }
 * /boosts/admin/meta/connexion:
 *   put:
 *     summary: Choisir le compte publicitaire et la Page (Instagram déduit de la Page), puis vérifier auprès de Meta
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ad_account_id, page_id]
 *             properties:
 *               ad_account_id: { type: string, example: "act_1234567890" }
 *               page_id: { type: string, example: "1234567890" }
 *               modifie_par: { type: string }
 *     responses:
 *       200: { description: "{ success, sante }" }
 *       400: { description: VALIDATION_ERROR (compte ou Page inaccessible avec le jeton) }
 * /boosts/admin/meta/verifier:
 *   post:
 *     summary: Revérifier la connexion (jeton, permissions, compte, devise, Page, Instagram)
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, sante }" }
 */
router.get('/admin/meta/sante', ...admin, BoostController.santeMeta);
router.get('/admin/meta/decouverte', ...admin, BoostController.decouverteMeta);
router.put('/admin/meta/connexion', ...admin, validate(connexionMetaSchema), BoostController.connexionMeta);
router.post('/admin/meta/verifier', ...admin, BoostController.verifierMeta);

/**
 * @swagger
 * /boosts/admin/{id}:
 *   get:
 *     summary: Détail complet d'un boost (journal, insights, transactions, checklist)
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, boost, insights, totaux, evenements, transactions, conformite_items }" }
 *       404: { description: Boost introuvable }
 */
router.get('/admin/:id', ...admin, validateParams(boostIdParamSchema), BoostController.detailAdmin);

/**
 * @swagger
 * /boosts/admin/{id}/approuver:
 *   post:
 *     summary: Valider un boost payé (ou republier un boost en erreur) et le publier sur Meta
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [conformite]
 *             properties:
 *               conformite: { type: array, items: { type: string }, example: [interdit, allegations, ciblage, visuel] }
 *               valide_par: { type: string, example: "Awa (équipe)" }
 *     responses:
 *       200: { description: Boost publié (statut actif) }
 *       400: { description: Checklist incomplète }
 *       409: { description: Statut incompatible ou kill switch actif }
 *       502: { description: Erreur Meta (boost passé en statut erreur, message lisible) }
 */
router.post('/admin/:id/approuver', ...admin, validateParams(boostIdParamSchema), validate(approuverBoostSchema), BoostController.approuver);

/**
 * @swagger
 * /boosts/admin/{id}/refuser:
 *   post:
 *     summary: Refuser un boost (remboursement intégral à effectuer)
 *     tags: [Boosts]
 *     security: [{ serviceKey: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, required: [note], properties: { note: { type: string }, valide_par: { type: string } } }
 *     responses:
 *       200: { description: Boost refusé }
 */
router.post('/admin/:id/refuser', ...admin, validateParams(boostIdParamSchema), validate(refuserBoostSchema), BoostController.refuser);

/**
 * @swagger
 * /boosts/admin/{id}/pause:
 *   post: { summary: Mettre en pause un boost, tags: [Boosts], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: OK } } }
 * /boosts/admin/{id}/reprendre:
 *   post: { summary: Reprendre un boost en pause, tags: [Boosts], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: OK } } }
 * /boosts/admin/{id}/cloturer:
 *   post: { summary: Clôturer un boost (synchro puis calcul du reliquat à rembourser), tags: [Boosts], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: OK } } }
 * /boosts/admin/{id}/rembourse:
 *   post: { summary: Marquer le remboursement comme effectué (versement), tags: [Boosts], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: OK } } }
 */
router.post('/admin/:id/pause', ...admin, validateParams(boostIdParamSchema), BoostController.pauseAdmin);
router.post('/admin/:id/reprendre', ...admin, validateParams(boostIdParamSchema), BoostController.reprendreAdmin);
router.post('/admin/:id/cloturer', ...admin, validateParams(boostIdParamSchema), BoostController.cloturer);
router.post('/admin/:id/rembourse', ...admin, validateParams(boostIdParamSchema), validate(remboursementBoostSchema), BoostController.marquerRembourse);

// ============================================================================
// Vendeur (JWT)
// ============================================================================

/**
 * @swagger
 * /boosts/parametres:
 *   get:
 *     summary: Paramètres du wizard (bornes, packs, commission, listes de ciblage, types de pub disponibles)
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ success, parametres } — parametres.types = { plateforme: false, meta: true }" }
 */
router.get('/parametres', auth, BoostController.getParametres);

/**
 * @swagger
 * /boosts/prefill:
 *   get:
 *     summary: Pré-remplissage de la créa depuis la boutique ou un produit
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: boutique_id, required: true, schema: { type: integer } }
 *       - { in: query, name: produit_id, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ success, prefill }" }
 */
router.get('/prefill', auth, validateQuery(prefillQuerySchema), BoostController.getPrefill);

/**
 * @swagger
 * /boosts/devis:
 *   post:
 *     summary: Répartition média / commission / TVA d'un montant total payé
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [total_fcfa], properties: { total_fcfa: { type: integer, example: 7500 }, duree_jours: { type: integer, example: 5 } } }
 *     responses:
 *       200: { description: "{ success, devis }" }
 */
router.post('/devis', auth, validate(devisSchema), BoostController.getDevis);

/**
 * @swagger
 * /boosts/estimation/audience:
 *   post:
 *     summary: Taille d'audience estimée par Meta pour un ciblage
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ success, audience: { min, max, disponible } }" }
 * /boosts/estimation/impressions:
 *   post:
 *     summary: Impressions estimées par jour pour un ou plusieurs montants
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ success, impressions[] }" }
 */
router.post('/estimation/audience', auth, validate(estimationAudienceSchema), BoostController.estimerAudience);
router.post('/estimation/impressions', auth, validate(estimationImpressionsSchema), BoostController.estimerImpressions);

/**
 * @swagger
 * /boosts/boutique/{boutiqueId}:
 *   get:
 *     summary: Boosts d'une boutique (brouillons compris)
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: boutiqueId, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, boosts }" }
 */
router.get('/boutique/:boutiqueId', auth, validateParams(boutiqueIdParamSchema), isBoutiqueOwner, BoostController.listerParBoutique);

/**
 * @swagger
 * /boosts:
 *   post:
 *     summary: Créer un brouillon de boost
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [boutique_id]
 *             properties:
 *               boutique_id: { type: integer }
 *               type_cible: { type: string, enum: [boutique, produit] }
 *               objectif: { type: string, enum: [trafic, whatsapp, notoriete] }
 *               total_fcfa: { type: integer, example: 7500 }
 *               duree_jours: { type: integer, example: 5 }
 *               ciblage: { type: object }
 *               titre: { type: string }
 *               texte_principal: { type: string }
 *               image_url: { type: string }
 *     responses:
 *       201: { description: "{ success, boost }" }
 */
router.post('/', auth, validate(creerBoostSchema), isBoutiqueOwner, BoostController.creer);

/**
 * @swagger
 * /boosts/{id}:
 *   get:
 *     summary: Détail d'un boost (stats, journal vendeur, paiements)
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, boost, insights, totaux, evenements, transactions }" }
 *   put:
 *     summary: Modifier un brouillon (sauvegarde automatique du wizard)
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, boost }" }
 *       409: { description: Le boost n'est plus un brouillon }
 *   delete:
 *     summary: Supprimer un brouillon
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: Brouillon supprimé }
 */
router.get('/:id', auth, validateParams(boostIdParamSchema), BoostController.detail);
router.put('/:id', auth, validateParams(boostIdParamSchema), validate(modifierBoostSchema), BoostController.modifier);
router.delete('/:id', auth, validateParams(boostIdParamSchema), BoostController.supprimer);

/**
 * @swagger
 * /boosts/{id}/soumettre:
 *   post:
 *     summary: Figer le devis et passer en attente de paiement
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, boost }" }
 *       400: { description: "VALIDATION_ERROR (errors[] par champ : titre, image_url, total_fcfa, duree_jours…)" }
 * /boosts/{id}/annuler-soumission:
 *   post:
 *     summary: Revenir en brouillon tant qu'aucun paiement n'est confirmé
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, boost }" }
 * /boosts/{id}/paiement:
 *   post:
 *     summary: Initier le paiement eBilling du boost (montant figé côté serveur)
 *     description: Vérifier ensuite avec GET /paiements/verification/{bill_id}.
 *     tags: [Boosts]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode: { type: string, enum: [mobile, carte] }
 *               operateur: { type: string, enum: [airtelmoney, moovmoney] }
 *               msisdn: { type: string, example: "074000000" }
 *               return_url: { type: string }
 *     responses:
 *       200: { description: "{ success, bill_id, transaction_id, redirect?, url? }" }
 * /boosts/{id}/pause:
 *   post: { summary: Mettre en pause la diffusion, tags: [Boosts], security: [{ bearerAuth: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: OK } } }
 * /boosts/{id}/reprendre:
 *   post: { summary: Reprendre la diffusion, tags: [Boosts], security: [{ bearerAuth: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: OK } } }
 */
router.post('/:id/soumettre', auth, validateParams(boostIdParamSchema), BoostController.soumettre);
router.post('/:id/annuler-soumission', auth, validateParams(boostIdParamSchema), BoostController.annulerSoumission);
router.post('/:id/paiement', paymentLimiter, auth, validateParams(boostIdParamSchema), validate(paiementBoostSchema), BoostController.payer);
router.post('/:id/pause', auth, validateParams(boostIdParamSchema), BoostController.pause);
router.post('/:id/reprendre', auth, validateParams(boostIdParamSchema), BoostController.reprendre);

export default router;
