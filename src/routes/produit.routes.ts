import { Router } from 'express';
import { ProduitController } from '../controllers/produit.controller';
import { validateParams, validateQuery } from '../middlewares/validation.middleware';
import { idParamSchema, slugParamSchema, paginationQuerySchema } from '../utils/validation.schemas';

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

export default router;
