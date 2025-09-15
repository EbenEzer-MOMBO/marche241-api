import { Router } from 'express';
import { CommuneController } from '../controllers/commune.controller';
import { auth, isAdmin, isBoutiqueOwner } from '../middlewares/auth.middleware';
import { validate, validateParams } from '../middlewares/validation.middleware';
import { idParamSchema } from '../utils/validation.schemas';
import { boutiqueIdParamSchema, createCommuneSchema, toggleCommuneStatusSchema, updateCommuneSchema } from '../utils/validation.schemas.commune';

const router = Router();

/**
 * @swagger
 * /api/v1/communes:
 *   get:
 *     summary: Récupère toutes les communes de livraison
 *     description: Récupère la liste de toutes les communes de livraison
 *     tags: [Communes]
 *     parameters:
 *       - in: query
 *         name: boutique_id
 *         schema:
 *           type: integer
 *         description: ID de la boutique pour filtrer les communes (optionnel)
 *     responses:
 *       200:
 *         description: Liste des communes récupérée avec succès
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/communes
 * @desc    Récupère toutes les communes de livraison
 * @access  Public
 */
router.get('/', CommuneController.getAllCommunes);

/**
 * @swagger
 * /api/v1/communes/boutique/{boutiqueId}:
 *   get:
 *     summary: Récupère les communes d'une boutique spécifique
 *     description: Récupère la liste des communes de livraison d'une boutique spécifique
 *     tags: [Communes]
 *     parameters:
 *       - in: path
 *         name: boutiqueId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la boutique
 *     responses:
 *       200:
 *         description: Liste des communes récupérée avec succès
 *       400:
 *         description: ID de boutique invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/communes/boutique/:boutiqueId
 * @desc    Récupère les communes d'une boutique spécifique
 * @access  Public
 */
router.get('/boutique/:boutiqueId', validateParams(boutiqueIdParamSchema), CommuneController.getCommunesByBoutiqueId);

/**
 * @swagger
 * /api/v1/communes/boutique/{boutiqueId}/actives:
 *   get:
 *     summary: Récupère les communes actives d'une boutique spécifique
 *     description: Récupère la liste des communes de livraison actives d'une boutique spécifique
 *     tags: [Communes]
 *     parameters:
 *       - in: path
 *         name: boutiqueId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la boutique
 *     responses:
 *       200:
 *         description: Liste des communes actives récupérée avec succès
 *       400:
 *         description: ID de boutique invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/communes/boutique/:boutiqueId/actives
 * @desc    Récupère les communes actives d'une boutique spécifique
 * @access  Public
 */
router.get('/boutique/:boutiqueId/actives', validateParams(boutiqueIdParamSchema), CommuneController.getActiveCommunesByBoutiqueId);

/**
 * @swagger
 * /api/v1/communes/actives:
 *   get:
 *     summary: Récupère les communes de livraison actives
 *     description: Récupère la liste des communes de livraison actives
 *     tags: [Communes]
 *     parameters:
 *       - in: query
 *         name: boutique_id
 *         schema:
 *           type: integer
 *         description: ID de la boutique pour filtrer les communes (optionnel)
 *     responses:
 *       200:
 *         description: Liste des communes actives récupérée avec succès
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/communes/actives
 * @desc    Récupère les communes de livraison actives
 * @access  Public
 */
router.get('/actives', CommuneController.getActiveCommunes);

/**
 * @swagger
 * /api/v1/communes/{id}:
 *   get:
 *     summary: Récupère une commune par son ID
 *     description: Récupère les détails d'une commune spécifique
 *     tags: [Communes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commune
 *     responses:
 *       200:
 *         description: Commune récupérée avec succès
 *       404:
 *         description: Commune non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/communes/:id
 * @desc    Récupère une commune par son ID
 * @access  Public
 */
router.get('/:id', validateParams(idParamSchema), CommuneController.getCommuneById);

/**
 * @swagger
 * /api/v1/communes:
 *   post:
 *     summary: Crée une nouvelle commune de livraison
 *     description: Crée une nouvelle commune de livraison
 *     tags: [Communes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCommune'
 *     responses:
 *       201:
 *         description: Commune créée avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/communes
 * @desc    Crée une nouvelle commune de livraison
 * @access  Private (admin ou propriétaire de la boutique)
 */
router.post('/', auth, validate(createCommuneSchema), isBoutiqueOwner, CommuneController.createCommune);

/**
 * @swagger
 * /api/v1/communes/{id}:
 *   put:
 *     summary: Met à jour une commune existante
 *     description: Met à jour les détails d'une commune existante
 *     tags: [Communes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commune
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCommune'
 *     responses:
 *       200:
 *         description: Commune mise à jour avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Commune non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PUT /api/v1/communes/:id
 * @desc    Met à jour une commune existante
 * @access  Private (admin ou propriétaire de la boutique)
 */
router.put('/:id', auth, validateParams(idParamSchema), validate(updateCommuneSchema), isBoutiqueOwner, CommuneController.updateCommune);

/**
 * @swagger
 * /api/v1/communes/{id}/status:
 *   patch:
 *     summary: Active ou désactive une commune
 *     description: Change le statut d'activation d'une commune
 *     tags: [Communes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commune
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ToggleCommuneStatus'
 *     responses:
 *       200:
 *         description: Statut de la commune modifié avec succès
 *       400:
 *         description: Données invalides
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Commune non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PATCH /api/v1/communes/:id/status
 * @desc    Active ou désactive une commune
 * @access  Private (admin ou propriétaire de la boutique)
 */
router.patch('/:id/status', auth, validateParams(idParamSchema), validate(toggleCommuneStatusSchema), isBoutiqueOwner, CommuneController.toggleCommuneStatus);

/**
 * @swagger
 * /api/v1/communes/{id}:
 *   delete:
 *     summary: Supprime une commune
 *     description: Supprime une commune existante
 *     tags: [Communes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commune
 *     responses:
 *       200:
 *         description: Commune supprimée avec succès
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Non autorisé
 *       404:
 *         description: Commune non trouvée
 *       500:
 *         description: Erreur serveur
 * 
 * @route   DELETE /api/v1/communes/:id
 * @desc    Supprime une commune
 * @access  Private (admin ou propriétaire de la boutique)
 */
router.delete('/:id', auth, validateParams(idParamSchema), isBoutiqueOwner, CommuneController.deleteCommune);

export default router;
