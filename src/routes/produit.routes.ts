import { Router } from 'express';
import { ProduitController } from '../controllers/produit.controller';
import { auth } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { idParamSchema, slugParamSchema, paginationQuerySchema, boutiqueIdParamSchema } from '../utils/validation.schemas';
import Joi from 'joi';

// Schémas de validation pour les produits
const createProduitSchema = Joi.object({
  nom: Joi.string().required().min(2).max(200).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères',
    'any.required': 'Le nom est obligatoire'
  }),
  slug: Joi.string().required().min(2).max(200).pattern(/^[a-z0-9-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets',
    'any.required': 'Le slug est obligatoire'
  }),
  description: Joi.string().allow(null, '').max(1000).messages({
    'string.max': 'La description ne doit pas dépasser {#limit} caractères'
  }),
  prix: Joi.number().required().min(0).messages({
    'number.min': 'Le prix doit être positif',
    'any.required': 'Le prix est obligatoire'
  }),
  prix_promo: Joi.number().min(0).optional().allow(null).messages({
    'number.min': 'Le prix promotionnel doit être positif'
  }),
  stock: Joi.number().integer().min(0).default(0).messages({
    'number.min': 'Le stock doit être positif'
  }),
  en_stock: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Le stock doit être positif'
  }),
  boutique_id: Joi.number().integer().required().messages({
    'any.required': 'L\'ID de la boutique est obligatoire'
  }),
  categorie_id: Joi.number().integer().optional().allow(null).messages({
    'number.base': 'L\'ID de la catégorie doit être un nombre'
  }),
  images: Joi.array().items(Joi.string().uri()).optional().messages({
    'array.base': 'Les images doivent être un tableau d\'URLs'
  }),
  image_principale: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'L\'image principale doit être une URL valide'
  }),
  variants: Joi.object().optional().allow(null).messages({
    'object.base': 'Les variants doivent être un objet'
  }),
  statut: Joi.string().valid('actif', 'inactif', 'rupture_stock').default('actif')
});

const updateProduitSchema = Joi.object({
  nom: Joi.string().min(2).max(200).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères'
  }),
  slug: Joi.string().min(2).max(200).pattern(/^[a-z0-9-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets'
  }),
  description: Joi.string().allow(null, '').max(1000).messages({
    'string.max': 'La description ne doit pas dépasser {#limit} caractères'
  }),
  prix: Joi.number().min(0).messages({
    'number.min': 'Le prix doit être positif'
  }),
  prix_promo: Joi.number().min(0).optional().allow(null).messages({
    'number.min': 'Le prix promotionnel doit être positif'
  }),
  stock: Joi.number().integer().min(0).messages({
    'number.min': 'Le stock doit être positif'
  }),
  en_stock: Joi.number().integer().min(0).optional().messages({
    'number.min': 'Le stock doit être positif'
  }),
  categorie_id: Joi.number().integer().optional().allow(null).messages({
    'number.base': 'L\'ID de la catégorie doit être un nombre'
  }),
  images: Joi.array().items(Joi.string().uri()).optional().messages({
    'array.base': 'Les images doivent être un tableau d\'URLs'
  }),
  image_principale: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'L\'image principale doit être une URL valide'
  }),
  variants: Joi.object().optional().allow(null).messages({
    'object.base': 'Les variants doivent être un objet'
  }),
  statut: Joi.string().valid('actif', 'inactif', 'rupture_stock')
});

const router = Router();

/**
 * @swagger
 * /api/v1/produits:
 *   get:
 *     summary: Récupère tous les produits
 *     description: Récupère une liste paginée de tous les produits disponibles
 *     tags: [Produits]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de la page
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *       - in: query
 *         name: tri_par
 *         schema:
 *           type: string
 *           default: date_creation
 *         description: Champ de tri
 *       - in: query
 *         name: ordre
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Ordre de tri
 *     responses:
 *       200:
 *         description: Liste des produits récupérée avec succès
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/produits
 * @desc    Récupère tous les produits avec pagination
 * @access  Public
 */
router.get('/', validateQuery(paginationQuerySchema), ProduitController.getAllProduits);

/**
 * @swagger
 * /api/v1/produits/categories:
 *   get:
 *     summary: Récupère les produits par catégories
 *     description: Récupère les produits les plus importants pour chaque catégorie
 *     tags: [Produits]
 *     parameters:
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 4
 *         description: Nombre de produits à récupérer par catégorie
 *       - in: query
 *         name: boutique_id
 *         schema:
 *           type: integer
 *         description: ID de la boutique pour filtrer les produits (optionnel)
 *     responses:
 *       200:
 *         description: Produits par catégories récupérés avec succès
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/produits/categories
 * @desc    Récupère les produits les plus importants par catégorie
 * @access  Public
 */
router.get('/categories', ProduitController.getTopProduitsByCategories);

/**
 * @swagger
 * /api/v1/produits/categorie/{categorieId}:
 *   get:
 *     summary: Récupère les produits d'une catégorie
 *     description: Récupère les produits appartenant à une catégorie spécifique
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: categorieId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la catégorie
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre de produits à récupérer
 *     responses:
 *       200:
 *         description: Produits récupérés avec succès
 *       400:
 *         description: ID de catégorie invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/produits/categorie/:categorieId
 * @desc    Récupère les produits par catégorie
 * @access  Public
 */
router.get('/categorie/:categorieId', validateParams(idParamSchema), ProduitController.getProduitsByCategorie);

/**
 * @swagger
 * /api/v1/produits/boutique/{boutiqueId}:
 *   get:
 *     summary: Récupère tous les produits d'une boutique
 *     description: Récupère une liste paginée de tous les produits appartenant à une boutique spécifique
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: boutiqueId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la boutique
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Numéro de la page
 *       - in: query
 *         name: limite
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Nombre d'éléments par page
 *       - in: query
 *         name: tri_par
 *         schema:
 *           type: string
 *           default: date_creation
 *         description: Champ de tri
 *       - in: query
 *         name: ordre
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Ordre de tri
 *     responses:
 *       200:
 *         description: Produits de la boutique récupérés avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 donnees:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Produit'
 *                 total:
 *                   type: integer
 *                   description: Nombre total de produits
 *                   example: 25
 *                 page:
 *                   type: integer
 *                   description: Page actuelle
 *                   example: 1
 *                 limite:
 *                   type: integer
 *                   description: Nombre d'éléments par page
 *                   example: 10
 *                 total_pages:
 *                   type: integer
 *                   description: Nombre total de pages
 *                   example: 3
 *       400:
 *         description: ID de boutique invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/produits/boutique/:boutiqueId
 * @desc    Récupère tous les produits d'une boutique avec pagination
 * @access  Public
 */
router.get('/boutique/:boutiqueId', validateParams(boutiqueIdParamSchema), validateQuery(paginationQuerySchema), ProduitController.getProduitsByBoutique);

/**
 * @swagger
 * /api/v1/produits/slug/{slug}:
 *   get:
 *     summary: Récupère un produit par son slug
 *     description: Récupère les détails d'un produit spécifique en utilisant son slug
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug du produit
 *     responses:
 *       200:
 *         description: Produit récupéré avec succès
 *       404:
 *         description: Produit non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/produits/slug/:slug
 * @desc    Récupère un produit par son slug
 * @access  Public
 */
router.get('/slug/:slug', validateParams(slugParamSchema), ProduitController.getProduitBySlug);

/**
 * @swagger
 * /api/v1/produits/{id}:
 *   get:
 *     summary: Récupère un produit par son ID
 *     description: Récupère les détails d'un produit spécifique en utilisant son ID
 *     tags: [Produits]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du produit
 *     responses:
 *       200:
 *         description: Produit récupéré avec succès
 *       404:
 *         description: Produit non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/produits/:id
 * @desc    Récupère un produit par son ID
 * @access  Public
 */
router.get('/:id', validateParams(idParamSchema), ProduitController.getProduitById);

/**
 * @swagger
 * /api/v1/produits:
 *   post:
 *     summary: Crée un nouveau produit
 *     description: Crée un nouveau produit pour un vendeur authentifié
 *     tags: [Produits]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nom
 *               - slug
 *               - prix
 *               - boutique_id
 *             properties:
 *               nom:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 200
 *                 description: Nom du produit
 *                 example: "iPhone 15 Pro"
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 200
 *                 pattern: "^[a-z0-9-]+$"
 *                 description: Slug unique du produit
 *                 example: "iphone-15-pro"
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Description du produit
 *                 example: "Smartphone haut de gamme avec écran Super Retina XDR"
 *               prix:
 *                 type: number
 *                 minimum: 0
 *                 description: Prix du produit en FCFA
 *                 example: 850000
 *               prix_promo:
 *                 type: number
 *                 minimum: 0
 *                 description: Prix promotionnel (optionnel)
 *                 example: 750000
 *               stock:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *                 description: Quantité en stock
 *                 example: 10
 *               boutique_id:
 *                 type: integer
 *                 description: ID de la boutique
 *                 example: 1
 *               categorie_id:
 *                 type: integer
 *                 description: ID de la catégorie (optionnel)
 *                 example: 2
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: URLs des images du produit
 *                 example: ["https://example.com/image1.jpg", "https://example.com/image2.jpg"]
 *               statut:
 *                 type: string
 *                 enum: [actif, inactif, rupture_stock]
 *                 default: actif
 *                 description: Statut du produit
 *     responses:
 *       201:
 *         description: Produit créé avec succès
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
 *                   example: "Produit créé avec succès"
 *                 produit:
 *                   $ref: '#/components/schemas/Produit'
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas propriétaire de la boutique)
 *       409:
 *         description: Conflit (slug déjà utilisé)
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/produits
 * @desc    Crée un nouveau produit
 * @access  Private (vendeur authentifié)
 */
router.post('/', auth, validate(createProduitSchema), ProduitController.createProduit);

/**
 * @swagger
 * /api/v1/produits/{id}:
 *   put:
 *     summary: Met à jour un produit existant
 *     description: Met à jour les informations d'un produit existant (accessible au propriétaire)
 *     tags: [Produits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du produit à mettre à jour
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 200
 *                 description: Nom du produit
 *                 example: "iPhone 15 Pro Max"
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 200
 *                 pattern: "^[a-z0-9-]+$"
 *                 description: Slug unique du produit
 *                 example: "iphone-15-pro-max"
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Description du produit
 *                 example: "Smartphone premium avec écran 6.7 pouces"
 *               prix:
 *                 type: number
 *                 minimum: 0
 *                 description: Prix du produit en FCFA
 *                 example: 950000
 *               prix_promo:
 *                 type: number
 *                 minimum: 0
 *                 description: Prix promotionnel (optionnel)
 *                 example: 850000
 *               stock:
 *                 type: integer
 *                 minimum: 0
 *                 description: Quantité en stock
 *                 example: 5
 *               categorie_id:
 *                 type: integer
 *                 description: ID de la catégorie
 *                 example: 2
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: URLs des images du produit
 *                 example: ["https://example.com/new-image1.jpg"]
 *               statut:
 *                 type: string
 *                 enum: [actif, inactif, rupture_stock]
 *                 description: Statut du produit
 *     responses:
 *       200:
 *         description: Produit mis à jour avec succès
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
 *                   example: "Produit mis à jour avec succès"
 *                 produit:
 *                   $ref: '#/components/schemas/Produit'
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas le propriétaire)
 *       404:
 *         description: Produit non trouvé
 *       409:
 *         description: Conflit (slug déjà utilisé)
 *       500:
 *         description: Erreur serveur
 *   delete:
 *     summary: Supprime un produit
 *     description: Supprime définitivement un produit (accessible au propriétaire)
 *     tags: [Produits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du produit à supprimer
 *     responses:
 *       200:
 *         description: Produit supprimé avec succès
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
 *                   example: "Produit supprimé avec succès"
 *       400:
 *         description: Impossible de supprimer (commandes associées)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas le propriétaire)
 *       404:
 *         description: Produit non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PUT /api/v1/produits/:id
 * @desc    Met à jour un produit existant
 * @access  Private (propriétaire)
 * 
 * @route   DELETE /api/v1/produits/:id
 * @desc    Supprime un produit
 * @access  Private (propriétaire)
 */
router.put('/:id', auth, validateParams(idParamSchema), validate(updateProduitSchema), ProduitController.updateProduit);
router.delete('/:id', auth, validateParams(idParamSchema), ProduitController.deleteProduit);

/**
 * @swagger
 * /api/v1/produits/{id}/stats:
 *   get:
 *     summary: Récupère les statistiques de vues d'un produit
 *     description: Récupère les statistiques détaillées des vues d'un produit (accessible au propriétaire)
 *     tags: [Produits]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du produit
 *     responses:
 *       200:
 *         description: Statistiques récupérées avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 produit_id:
 *                   type: integer
 *                   example: 1
 *                 nom_produit:
 *                   type: string
 *                   example: "iPhone 15 Pro"
 *                 statistiques:
 *                   type: object
 *                   properties:
 *                     nombre_vues_total:
 *                       type: integer
 *                       description: Nombre total de vues uniques
 *                       example: 350
 *                     vues_totales:
 *                       type: integer
 *                       description: Nombre total de vues enregistrées
 *                       example: 350
 *                     vues_aujourd_hui:
 *                       type: integer
 *                       description: Vues du jour
 *                       example: 12
 *                     vues_7_jours:
 *                       type: integer
 *                       description: Vues des 7 derniers jours
 *                       example: 85
 *                     vues_30_jours:
 *                       type: integer
 *                       description: Vues des 30 derniers jours
 *                       example: 220
 *       400:
 *         description: ID de produit invalide
 *       401:
 *         description: Non authentifié
 *       404:
 *         description: Produit non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/produits/:id/stats
 * @desc    Récupère les statistiques de vues d'un produit
 * @access  Private (propriétaire)
 */
router.get('/:id/stats', auth, validateParams(idParamSchema), ProduitController.getProduitStats);

export default router;
