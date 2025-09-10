import { Router } from 'express';
import { CategorieController } from '../controllers/categorie.controller';
import { validateParams } from '../middlewares/validation.middleware';
import { idParamSchema, slugParamSchema } from '../utils/validation.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     summary: Récupère toutes les catégories
 *     description: Récupère la liste de toutes les catégories disponibles
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: boutique_id
 *         schema:
 *           type: integer
 *         description: ID de la boutique pour filtrer les catégories (optionnel)
 *     responses:
 *       200:
 *         description: Liste des catégories récupérée avec succès
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/categories
 * @desc    Récupère toutes les catégories
 * @access  Public
 */
router.get('/', CategorieController.getAllCategories);

/**
 * @swagger
 * /api/v1/categories/slug/{slug}:
 *   get:
 *     summary: Récupère une catégorie par son slug
 *     description: Récupère les détails d'une catégorie spécifique en utilisant son slug
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug de la catégorie
 *     responses:
 *       200:
 *         description: Catégorie récupérée avec succès
 *       404:
 *         description: Catégorie non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/categories/slug/:slug
 * @desc    Récupère une catégorie par son slug
 * @access  Public
 */
router.get('/slug/:slug', validateParams(slugParamSchema), CategorieController.getCategorieBySlug);

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   get:
 *     summary: Récupère une catégorie par son ID
 *     description: Récupère les détails d'une catégorie spécifique en utilisant son ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la catégorie
 *     responses:
 *       200:
 *         description: Catégorie récupérée avec succès
 *       404:
 *         description: Catégorie non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/categories/:id
 * @desc    Récupère une catégorie par son ID
 * @access  Public
 */
router.get('/:id', validateParams(idParamSchema), CategorieController.getCategorieById);

export default router;
