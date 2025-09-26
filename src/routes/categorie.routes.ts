import { Router } from 'express';
import { CategorieController } from '../controllers/categorie.controller';
import { auth } from '../middlewares/auth.middleware';
import { validate, validateParams } from '../middlewares/validation.middleware';
import { idParamSchema, slugParamSchema } from '../utils/validation.schemas';

// Schéma de validation pour la création de catégorie
import Joi from 'joi';

const createCategorieSchema = Joi.object({
  nom: Joi.string().required().min(2).max(100).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères',
    'any.required': 'Le nom est obligatoire'
  }),
  slug: Joi.string().required().min(2).max(100).pattern(/^[a-z0-9-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets',
    'any.required': 'Le slug est obligatoire'
  }),
  description: Joi.string().allow(null, '').messages({
    'string.base': 'La description doit être une chaîne de caractères'
  }),
  parent_id: Joi.number().integer().allow(null).messages({
    'number.base': 'L\'ID parent doit être un nombre'
  }),
  ordre_affichage: Joi.number().integer().min(1).messages({
    'number.base': 'L\'ordre d\'affichage doit être un nombre',
    'number.min': 'L\'ordre d\'affichage doit être supérieur à 0'
  }),
  boutique_id: Joi.number().integer().allow(null).messages({
    'number.base': 'L\'ID de la boutique doit être un nombre'
  })
});

const updateCategorieSchema = Joi.object({
  nom: Joi.string().min(2).max(100).messages({
    'string.min': 'Le nom doit contenir au moins {#limit} caractères',
    'string.max': 'Le nom ne doit pas dépasser {#limit} caractères'
  }),
  slug: Joi.string().min(2).max(100).pattern(/^[a-z0-9-]+$/).messages({
    'string.min': 'Le slug doit contenir au moins {#limit} caractères',
    'string.max': 'Le slug ne doit pas dépasser {#limit} caractères',
    'string.pattern.base': 'Le slug ne doit contenir que des lettres minuscules, des chiffres et des tirets'
  }),
  description: Joi.string().allow(null, '').messages({
    'string.base': 'La description doit être une chaîne de caractères'
  }),
  parent_id: Joi.number().integer().allow(null).messages({
    'number.base': 'L\'ID parent doit être un nombre'
  }),
  ordre_affichage: Joi.number().integer().min(1).messages({
    'number.base': 'L\'ordre d\'affichage doit être un nombre',
    'number.min': 'L\'ordre d\'affichage doit être supérieur à 0'
  })
});

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

/**
 * @swagger
 * /api/v1/categories:
 *   post:
 *     summary: Crée une nouvelle catégorie
 *     description: Crée une nouvelle catégorie pour un vendeur authentifié
 *     tags: [Categories]
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
 *             properties:
 *               nom:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Nom de la catégorie
 *                 example: "Électronique"
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 pattern: "^[a-z0-9-]+$"
 *                 description: Slug unique de la catégorie
 *                 example: "electronique"
 *               description:
 *                 type: string
 *                 description: Description de la catégorie
 *                 example: "Produits électroniques et accessoires"
 *               parent_id:
 *                 type: integer
 *                 description: ID de la catégorie parente (pour sous-catégories)
 *                 example: 1
 *               ordre_affichage:
 *                 type: integer
 *                 minimum: 1
 *                 description: Ordre d'affichage de la catégorie
 *                 example: 1
 *               boutique_id:
 *                 type: integer
 *                 description: ID de la boutique (optionnel, pour catégories spécifiques)
 *                 example: 5
 *     responses:
 *       201:
 *         description: Catégorie créée avec succès
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
 *                   example: "Catégorie créée avec succès"
 *                 categorie:
 *                   $ref: '#/components/schemas/Categorie'
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       409:
 *         description: Conflit (slug déjà utilisé)
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/categories
 * @desc    Crée une nouvelle catégorie
 * @access  Private (vendeur authentifié)
 */
router.post('/', auth, validate(createCategorieSchema), CategorieController.createCategorie);

/**
 * @swagger
 * /api/v1/categories/{id}:
 *   put:
 *     summary: Met à jour une catégorie existante
 *     description: Met à jour les informations d'une catégorie existante (accessible au propriétaire)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la catégorie à mettre à jour
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
 *                 maxLength: 100
 *                 description: Nom de la catégorie
 *                 example: "Électronique"
 *               slug:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 pattern: "^[a-z0-9-]+$"
 *                 description: Slug unique de la catégorie
 *                 example: "electronique"
 *               description:
 *                 type: string
 *                 description: Description de la catégorie
 *                 example: "Produits électroniques et accessoires"
 *               parent_id:
 *                 type: integer
 *                 description: ID de la catégorie parente
 *                 example: 1
 *               ordre_affichage:
 *                 type: integer
 *                 minimum: 1
 *                 description: Ordre d'affichage de la catégorie
 *                 example: 2
 *     responses:
 *       200:
 *         description: Catégorie mise à jour avec succès
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
 *                   example: "Catégorie mise à jour avec succès"
 *                 categorie:
 *                   $ref: '#/components/schemas/Categorie'
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas le propriétaire)
 *       404:
 *         description: Catégorie non trouvée
 *       409:
 *         description: Conflit (slug déjà utilisé)
 *       500:
 *         description: Erreur serveur
 *   delete:
 *     summary: Supprime une catégorie
 *     description: Supprime définitivement une catégorie (accessible au propriétaire)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la catégorie à supprimer
 *     responses:
 *       200:
 *         description: Catégorie supprimée avec succès
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
 *                   example: "Catégorie supprimée avec succès"
 *       400:
 *         description: Impossible de supprimer (sous-catégories ou produits associés)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas le propriétaire)
 *       404:
 *         description: Catégorie non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PUT /api/v1/categories/:id
 * @desc    Met à jour une catégorie existante
 * @access  Private (propriétaire)
 * 
 * @route   DELETE /api/v1/categories/:id
 * @desc    Supprime une catégorie
 * @access  Private (propriétaire)
 */
router.put('/:id', auth, validateParams(idParamSchema), validate(updateCategorieSchema), CategorieController.updateCategorie);
router.delete('/:id', auth, validateParams(idParamSchema), CategorieController.deleteCategorie);

export default router;
