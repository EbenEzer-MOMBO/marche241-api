import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { PubliciteController } from '../controllers/publicite.controller';
import { auth, isBoutiqueOwner, optionalAuth } from '../middlewares/auth.middleware';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { paymentLimiter } from '../middlewares/rate-limit.middleware';
import {
  actionAdminSchema,
  boutiqueIdParamSchema,
  clicQuerySchema,
  creerExterneSchema,
  creerPubliciteSchema,
  devisPubliciteSchema,
  diffusionQuerySchema,
  disponibilitesQuerySchema,
  interactionSchema,
  listeAdminPubliciteQuerySchema,
  modifierPubliciteSchema,
  paiementPubliciteSchema,
  parametresPubliciteSchema,
  parametresQuerySchema,
  planningQuerySchema,
  publiciteIdParamSchema,
  refuserPubliciteSchema,
  remboursementPubliciteSchema
} from '../utils/validation.schemas.publicite';

const router = Router();

/** Routes de supervision : clé de service du back-office uniquement (pas de JWT vendeur). */
const exigerCleService = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.isAdmin || req.vendeur) {
    res.status(403).json({ success: false, message: 'Accès réservé au back-office Marché 241' });
    return;
  }
  next();
};
const admin = [authOrServiceKey, exigerCleService];

/** Mesure publique (affichages, clics) : plafond par IP contre les rafales. */
const mesureLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de requêtes, réessayez dans une minute' }
});

/**
 * @swagger
 * tags:
 *   - name: Publicités
 *     description: Bannières sponsorisées sur les pages publiques Marché 241 (vente à la semaine, un annonceur par créneau)
 */

// ============================================================================
// Public — diffusion et mesure
// ============================================================================

/**
 * @swagger
 * /publicites/diffusion:
 *   get:
 *     summary: Bannières à afficher sur une page publique (semaine en cours)
 *     tags: [Publicités]
 *     parameters:
 *       - { in: query, name: page, schema: { type: string, enum: [accueil, produits, categorie, evenements, boutiques, autre] } }
 *       - { in: query, name: categorie_id, schema: { type: integer }, description: "Page catégorie : bannière de la catégorie + bandeau Premium" }
 *     responses:
 *       200: { description: "{ success, bannieres[] } — au plus deux bannières, mise en cache 60 s" }
 */
router.get('/diffusion', validateQuery(diffusionQuerySchema), PubliciteController.diffusion);

/**
 * @swagger
 * /publicites/{id}/affichage:
 *   post:
 *     summary: Compter un affichage (bannière visible au moins à 50 % pendant 1 s)
 *     description: Ignoré pour les robots, le back-office, le vendeur annonceur et les IP privées ; une fois par minute et par visiteur.
 *     tags: [Publicités]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { page: { type: string, example: accueil } } }
 *     responses:
 *       204: { description: Reçu }
 * /publicites/{id}/clic:
 *   get:
 *     summary: Compter un clic puis rediriger (302) vers le lien enregistré de la bannière
 *     tags: [Publicités]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *       - { in: query, name: page, schema: { type: string } }
 *     responses:
 *       302: { description: Redirection vers le lien de destination }
 */
router.post('/:id/affichage', mesureLimiter, optionalAuth, validateParams(publiciteIdParamSchema), validate(interactionSchema), PubliciteController.affichage);
router.get('/:id/clic', mesureLimiter, optionalAuth, validateParams(publiciteIdParamSchema), validateQuery(clicQuerySchema), PubliciteController.clic);

// ============================================================================
// Back-office (x-service-key) — déclarées avant /:id
// ============================================================================

/**
 * @swagger
 * /publicites/admin:
 *   get:
 *     summary: Lister les publicités (hors brouillons par défaut)
 *     tags: [Publicités]
 *     security: [{ serviceKey: [] }]
 *     parameters:
 *       - { in: query, name: statut, schema: { type: string } }
 *       - { in: query, name: type_annonceur, schema: { type: string, enum: [vendeur, externe] } }
 *       - { in: query, name: formule, schema: { type: string, enum: [categorie, accueil, premium] } }
 *       - { in: query, name: statut_remboursement, schema: { type: string, enum: [aucun, a_rembourser, rembourse] } }
 *       - { in: query, name: recherche, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer } }
 *       - { in: query, name: limite, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ success, publicites, total, page, limite }" }
 *   post:
 *     summary: Créer la bannière d'un annonceur externe (payée hors plateforme ou offerte), validée d'office
 *     tags: [Publicités]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       201: { description: "{ success, publicite }" }
 *       409: { description: "SEMAINE_INDISPONIBLE" }
 * /publicites/admin/stats:
 *   get: { summary: Nombre de publicités par statut, remboursements et chiffre d'affaires, tags: [Publicités], security: [{ serviceKey: [] }], responses: { 200: { description: "{ success, stats }" } } }
 * /publicites/admin/planning:
 *   get:
 *     summary: Occupation des créneaux semaine par semaine
 *     tags: [Publicités]
 *     security: [{ serviceKey: [] }]
 *     parameters:
 *       - { in: query, name: debut, schema: { type: string, example: "2026-10-12" } }
 *       - { in: query, name: semaines, schema: { type: integer, default: 8 } }
 *     responses:
 *       200: { description: "{ success, semaines[], lignes[] }" }
 * /publicites/admin/parametres:
 *   get: { summary: Paramètres de la publicité interne, tags: [Publicités], security: [{ serviceKey: [] }], responses: { 200: { description: "{ success, parametres }" } } }
 *   put: { summary: Modifier les paramètres (tarifs, remise, garanties, éligibilité, ouverture, arrêt d'urgence), tags: [Publicités], security: [{ serviceKey: [] }], responses: { 200: { description: "{ success, parametres }" } } }
 */
router.get('/admin', ...admin, validateQuery(listeAdminPubliciteQuerySchema), PubliciteController.listerAdmin);
router.post('/admin', ...admin, validate(creerExterneSchema), PubliciteController.creerExterne);
router.get('/admin/stats', ...admin, PubliciteController.statsAdmin);
router.get('/admin/planning', ...admin, validateQuery(planningQuerySchema), PubliciteController.planning);
router.get('/admin/parametres', ...admin, PubliciteController.getParametresAdmin);
router.put('/admin/parametres', ...admin, validate(parametresPubliciteSchema), PubliciteController.majParametres);
router.post('/admin/rafraichir', ...admin, PubliciteController.rafraichirStatuts);

/**
 * @swagger
 * /publicites/admin/{id}:
 *   get: { summary: Détail (statistiques, garantie, journal complet), tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite, stats, semaines, garantie, evenements }" } } }
 * /publicites/admin/{id}/bilan:
 *   get: { summary: Bilan de campagne (affichages, visiteurs, clics, par jour et par page), tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, bilan }" } } }
 * /publicites/admin/{id}/approuver:
 *   post: { summary: Valider une bannière payée (programmée ou en diffusion), tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" } } }
 * /publicites/admin/{id}/refuser:
 *   post: { summary: Refuser (motif obligatoire) — semaines libérées, remboursement hors frais, tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" } } }
 * /publicites/admin/{id}/annuler:
 *   post: { summary: Annuler une bannière validée — semaines futures libérées et remboursées au prorata, tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" } } }
 * /publicites/admin/{id}/offrir-semaine:
 *   post: { summary: Garantie d'affichages — ajouter une semaine gratuite après la période, tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" } } }
 * /publicites/admin/{id}/rembourse:
 *   post: { summary: Marquer le remboursement comme effectué, tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" } } }
 * /publicites/admin/{id}/reseaux-fait:
 *   post: { summary: Formule Premium — publication sur les réseaux sociaux effectuée, tags: [Publicités], security: [{ serviceKey: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" } } }
 */
router.get('/admin/:id', ...admin, validateParams(publiciteIdParamSchema), PubliciteController.detailAdmin);
router.get('/admin/:id/bilan', ...admin, validateParams(publiciteIdParamSchema), PubliciteController.bilan);
router.post('/admin/:id/approuver', ...admin, validateParams(publiciteIdParamSchema), validate(actionAdminSchema), PubliciteController.approuver);
router.post('/admin/:id/refuser', ...admin, validateParams(publiciteIdParamSchema), validate(refuserPubliciteSchema), PubliciteController.refuser);
router.post('/admin/:id/annuler', ...admin, validateParams(publiciteIdParamSchema), validate(refuserPubliciteSchema), PubliciteController.annuler);
router.post('/admin/:id/offrir-semaine', ...admin, validateParams(publiciteIdParamSchema), validate(actionAdminSchema), PubliciteController.offrirSemaine);
router.post('/admin/:id/rembourse', ...admin, validateParams(publiciteIdParamSchema), validate(remboursementPubliciteSchema), PubliciteController.marquerRembourse);
router.post('/admin/:id/reseaux-fait', ...admin, validateParams(publiciteIdParamSchema), validate(actionAdminSchema), PubliciteController.marquerReseauxFait);

// ============================================================================
// Vendeur (JWT)
// ============================================================================

/**
 * @swagger
 * /publicites/parametres:
 *   get:
 *     summary: Formules, tarifs, formats de visuel et éligibilité de la boutique
 *     tags: [Publicités]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: query, name: boutique_id, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, parametres } — parametres.eligibilite = { eligible, raison } si boutique_id" }
 * /publicites/disponibilites:
 *   get:
 *     summary: Semaines libres ou réservées pour une formule
 *     tags: [Publicités]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: formule, required: true, schema: { type: string, enum: [categorie, accueil, premium] } }
 *       - { in: query, name: categorie_id, schema: { type: integer } }
 *       - { in: query, name: semaines, schema: { type: integer } }
 *       - { in: query, name: exclure_id, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ success, disponibilites: [{ semaine, libre }] }" }
 * /publicites/devis:
 *   post:
 *     summary: Prix d'une réservation (remise 4 semaines = prix de 3)
 *     tags: [Publicités]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, required: [formule, nb_semaines], properties: { formule: { type: string, example: accueil }, nb_semaines: { type: integer, example: 4 } } }
 *     responses:
 *       200: { description: "{ success, devis }" }
 */
router.get('/parametres', authOrServiceKey, validateQuery(parametresQuerySchema), PubliciteController.getParametres);
router.get('/disponibilites', authOrServiceKey, validateQuery(disponibilitesQuerySchema), PubliciteController.disponibilites);
router.post('/devis', authOrServiceKey, validate(devisPubliciteSchema), PubliciteController.devis);

/**
 * @swagger
 * /publicites/boutique/{boutiqueId}:
 *   get:
 *     summary: Publicités d'une boutique (brouillons compris) avec affichages et clics
 *     tags: [Publicités]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: boutiqueId, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, publicites }" }
 * /publicites:
 *   post:
 *     summary: Créer un brouillon de bannière
 *     tags: [Publicités]
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
 *               formule: { type: string, enum: [categorie, accueil, premium] }
 *               categorie_id: { type: integer }
 *               semaine_debut: { type: string, example: "2026-10-12" }
 *               nb_semaines: { type: integer, example: 1 }
 *               image_url: { type: string }
 *               image_mobile_url: { type: string }
 *               texte_alternatif: { type: string }
 *               cible_type: { type: string, enum: [boutique, produit] }
 *               produit_id: { type: integer }
 *     responses:
 *       201: { description: "{ success, publicite }" }
 */
router.get('/boutique/:boutiqueId', auth, validateParams(boutiqueIdParamSchema), isBoutiqueOwner, PubliciteController.listerParBoutique);
router.post('/', auth, validate(creerPubliciteSchema), isBoutiqueOwner, PubliciteController.creer);

/**
 * @swagger
 * /publicites/{id}:
 *   get: { summary: Détail vendeur (statistiques, semaines, garantie, journal), tags: [Publicités], security: [{ bearerAuth: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite, stats, semaines, garantie, evenements }" } } }
 *   put: { summary: Modifier un brouillon, tags: [Publicités], security: [{ bearerAuth: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" }, 409: { description: N'est plus un brouillon } } }
 *   delete: { summary: Supprimer un brouillon, tags: [Publicités], security: [{ bearerAuth: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: Brouillon supprimé } } }
 * /publicites/{id}/soumettre:
 *   post:
 *     summary: Figer le prix et réserver les semaines (exclusivité garantie), puis attendre le paiement
 *     tags: [Publicités]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, publicite }" }
 *       400: { description: "VALIDATION_ERROR (errors[] : semaine_debut, image_url, categorie_id…)" }
 *       403: { description: "BOUTIQUE_NON_ELIGIBLE" }
 *       409: { description: "SEMAINE_INDISPONIBLE" }
 * /publicites/{id}/annuler-soumission:
 *   post: { summary: Revenir en brouillon tant qu'aucun paiement n'est confirmé (libère les semaines), tags: [Publicités], security: [{ bearerAuth: [] }], parameters: [{ in: path, name: id, required: true, schema: { type: integer } }], responses: { 200: { description: "{ success, publicite }" } } }
 * /publicites/{id}/paiement:
 *   post:
 *     summary: Initier le paiement eBilling (montant figé côté serveur)
 *     description: Vérifier ensuite avec GET /paiements/verification/{bill_id}.
 *     tags: [Publicités]
 *     security: [{ bearerAuth: [] }]
 *     parameters: [{ in: path, name: id, required: true, schema: { type: integer } }]
 *     responses:
 *       200: { description: "{ success, bill_id, transaction_id, redirect?, url? }" }
 */
router.get('/:id', auth, validateParams(publiciteIdParamSchema), PubliciteController.detail);
router.put('/:id', auth, validateParams(publiciteIdParamSchema), validate(modifierPubliciteSchema), PubliciteController.modifier);
router.delete('/:id', auth, validateParams(publiciteIdParamSchema), PubliciteController.supprimer);
router.post('/:id/soumettre', auth, validateParams(publiciteIdParamSchema), PubliciteController.soumettre);
router.post('/:id/annuler-soumission', auth, validateParams(publiciteIdParamSchema), PubliciteController.annulerSoumission);
router.post('/:id/paiement', paymentLimiter, auth, validateParams(publiciteIdParamSchema), validate(paiementPubliciteSchema), PubliciteController.payer);

export default router;
