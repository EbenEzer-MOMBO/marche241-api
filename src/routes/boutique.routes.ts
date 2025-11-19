import { Router } from 'express';
import { BoutiqueController } from '../controllers/boutique.controller';
import { auth, isAdmin, isBoutiqueOwner } from '../middlewares/auth.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import { 
  createBoutiqueSchema, 
  updateBoutiqueSchema, 
  updateBoutiqueStatusSchema,
  idParamSchema,
  slugParamSchema,
  vendeurIdParamSchema,
  paginationQuerySchema 
} from '../utils/validation.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/boutiques:
 *   get:
 *     summary: Récupère toutes les boutiques
 *     description: Récupère une liste paginée de toutes les boutiques disponibles
 *     tags: [Boutiques]
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
 *         description: Liste des boutiques récupérée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 donnees:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Boutique'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limite:
 *                   type: integer
 *                 total_pages:
 *                   type: integer
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/boutiques
 * @desc    Récupère toutes les boutiques avec pagination
 * @access  Public
 */
router.get('/', validateQuery(paginationQuerySchema), BoutiqueController.getAllBoutiques);

/**
 * @swagger
 * /api/v1/boutiques/slug/{slug}:
 *   get:
 *     summary: Récupère une boutique par son slug
 *     description: Récupère les détails d'une boutique en utilisant son slug unique
 *     tags: [Boutiques]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug unique de la boutique
 *     responses:
 *       200:
 *         description: Boutique récupérée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Boutique'
 *       404:
 *         description: Boutique non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/boutiques/slug/:slug
 * @desc    Récupère une boutique par son slug
 * @access  Public
 */
router.get('/slug/:slug', validateParams(slugParamSchema), BoutiqueController.getBoutiqueBySlug);

/**
 * @swagger
 * /api/v1/boutiques/vendeur/{vendeurId}:
 *   get:
 *     summary: Récupère toutes les boutiques d'un vendeur
 *     description: Récupère la liste de toutes les boutiques appartenant à un vendeur spécifique
 *     tags: [Boutiques]
 *     parameters:
 *       - in: path
 *         name: vendeurId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du vendeur
 *     responses:
 *       200:
 *         description: Liste des boutiques du vendeur récupérée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Boutique'
 *       404:
 *         description: Vendeur non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/boutiques/vendeur/:vendeurId
 * @desc    Récupère toutes les boutiques d'un vendeur
 * @access  Public
 */
router.get('/vendeur/:vendeurId', validateParams(vendeurIdParamSchema), BoutiqueController.getBoutiquesByVendeurId);

/**
 * @swagger
 * /api/v1/boutiques/{id}:
 *   get:
 *     summary: Récupère une boutique par son ID
 *     description: Récupère les détails d'une boutique en utilisant son identifiant unique
 *     tags: [Boutiques]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID unique de la boutique
 *     responses:
 *       200:
 *         description: Boutique récupérée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Boutique'
 *       404:
 *         description: Boutique non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/boutiques/:id
 * @desc    Récupère une boutique par son ID
 * @access  Public
 */
router.get('/:id', validateParams(idParamSchema), BoutiqueController.getBoutiqueById);

/**
 * @swagger
 * /api/v1/boutiques:
 *   post:
 *     summary: Crée une nouvelle boutique
 *     description: Crée une nouvelle boutique pour un vendeur authentifié
 *     tags: [Boutiques]
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
 *               - vendeur_id
 *             properties:
 *               nom:
 *                 type: string
 *                 description: Nom de la boutique
 *               slug:
 *                 type: string
 *                 description: Slug unique de la boutique
 *               description:
 *                 type: string
 *                 description: Description de la boutique
 *               vendeur_id:
 *                 type: integer
 *                 description: ID du vendeur propriétaire
 *               logo:
 *                 type: string
 *                 description: URL du logo de la boutique
 *               couleur_primaire:
 *                 type: string
 *                 description: Couleur primaire de la boutique
 *               couleur_secondaire:
 *                 type: string
 *                 description: Couleur secondaire de la boutique
 *               adresse:
 *                 type: string
 *                 description: Adresse physique de la boutique
 *               telephone:
 *                 type: string
 *                 description: Numéro de téléphone de la boutique
 *     responses:
 *       201:
 *         description: Boutique créée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Boutique'
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       409:
 *         description: Conflit (slug déjà utilisé)
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/boutiques
 * @desc    Crée une nouvelle boutique
 * @access  Private (vendeur authentifié)
 */
router.post('/', auth, validate(createBoutiqueSchema), BoutiqueController.createBoutique);

/**
 * @swagger
 * /api/v1/boutiques/{id}:
 *   put:
 *     summary: Met à jour une boutique existante
 *     description: Met à jour les informations d'une boutique existante (accessible uniquement au propriétaire)
 *     tags: [Boutiques]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la boutique à mettre à jour
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nom:
 *                 type: string
 *                 description: Nom de la boutique
 *               slug:
 *                 type: string
 *                 description: Slug unique de la boutique
 *               description:
 *                 type: string
 *                 description: Description de la boutique
 *               logo:
 *                 type: string
 *                 description: URL du logo de la boutique
 *               couleur_primaire:
 *                 type: string
 *                 description: Couleur primaire de la boutique
 *               couleur_secondaire:
 *                 type: string
 *                 description: Couleur secondaire de la boutique
 *               adresse:
 *                 type: string
 *                 description: Adresse physique de la boutique
 *               telephone:
 *                 type: string
 *                 description: Numéro de téléphone de la boutique
 *     responses:
 *       200:
 *         description: Boutique mise à jour avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Boutique'
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas le propriétaire)
 *       404:
 *         description: Boutique non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PUT /api/v1/boutiques/:id
 * @desc    Met à jour une boutique existante
 * @access  Private (propriétaire de la boutique)
 */
router.put('/:id', auth, validateParams(idParamSchema), validate(updateBoutiqueSchema), isBoutiqueOwner, BoutiqueController.updateBoutique);

/**
 * @swagger
 * /api/v1/boutiques/{id}:
 *   delete:
 *     summary: Supprime une boutique
 *     description: Supprime définitivement une boutique (accessible au propriétaire ou admin)
 *     tags: [Boutiques]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la boutique à supprimer
 *     responses:
 *       200:
 *         description: Boutique supprimée avec succès
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
 *                   example: "Boutique supprimée avec succès"
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas le propriétaire ou admin)
 *       404:
 *         description: Boutique non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   DELETE /api/v1/boutiques/:id
 * @desc    Supprime une boutique
 * @access  Private (propriétaire de la boutique ou admin)
 */
router.delete('/:id', auth, validateParams(idParamSchema), isBoutiqueOwner, BoutiqueController.deleteBoutique);

/**
 * @swagger
 * /api/v1/boutiques/{id}/statut:
 *   patch:
 *     summary: Met à jour le statut d'une boutique
 *     description: Met à jour le statut d'une boutique (accessible uniquement aux administrateurs)
 *     tags: [Boutiques]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la boutique
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - statut
 *             properties:
 *               statut:
 *                 type: string
 *                 enum: [active, inactive, en_attente, suspendue]
 *                 description: Nouveau statut de la boutique
 *     responses:
 *       200:
 *         description: Statut de la boutique mis à jour avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Boutique'
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé (pas administrateur)
 *       404:
 *         description: Boutique non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PATCH /api/v1/boutiques/:id/statut
 * @desc    Met à jour le statut d'une boutique
 * @access  Private (admin)
 */
router.patch('/:id/statut', auth, validateParams(idParamSchema), isAdmin, validate(updateBoutiqueStatusSchema), BoutiqueController.updateBoutiqueStatus);

export default router;
