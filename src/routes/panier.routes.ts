import { Router } from 'express';
import { PanierController } from '../controllers/panier.controller';
import { validate, validateParams } from '../middlewares/validation.middleware';
import { 
  idParamSchema, 
  sessionIdParamSchema,
  addToCartSchema,
  updateCartQuantitySchema,
  updateCartVariantsSchema
} from '../utils/validation.schemas';

const router = Router();

/**
 * @swagger
 * /api/v1/panier/{sessionId}:
 *   get:
 *     summary: Récupère le panier d'une session
 *     description: Récupère tous les éléments du panier pour une session donnée
 *     tags: [Panier]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID de la session
 *     responses:
 *       200:
 *         description: Panier récupéré avec succès
 *       400:
 *         description: ID de session invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/panier/:sessionId
 * @desc    Récupère le panier d'une session
 * @access  Public
 */
router.get('/:sessionId', validateParams(sessionIdParamSchema), PanierController.getPanier);

/**
 * @swagger
 * /api/v1/panier/item/{id}:
 *   get:
 *     summary: Récupère un élément du panier
 *     description: Récupère un élément du panier par son ID
 *     tags: [Panier]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID de l'élément du panier
 *     responses:
 *       200:
 *         description: Élément du panier récupéré avec succès
 *       400:
 *         description: ID d'élément de panier invalide
 *       404:
 *         description: Élément du panier non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/panier/item/:id
 * @desc    Récupère un élément du panier par son ID
 * @access  Public
 */
router.get('/item/:id', validateParams(idParamSchema), PanierController.getPanierItemById);

/**
 * @swagger
 * /api/v1/panier:
 *   post:
 *     summary: Ajoute un produit au panier
 *     description: Ajoute un produit au panier ou met à jour sa quantité s'il existe déjà
 *     tags: [Panier]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - session_id
 *               - boutique_id
 *               - produit_id
 *               - quantite
 *             properties:
 *               session_id:
 *                 type: string
 *               boutique_id:
 *                 type: integer
 *               produit_id:
 *                 type: integer
 *               quantite:
 *                 type: integer
 *                 minimum: 1
 *               variants_selectionnes:
 *                 type: object
 *     responses:
 *       201:
 *         description: Produit ajouté au panier avec succès
 *       400:
 *         description: Données invalides
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/panier
 * @desc    Ajoute un produit au panier
 * @access  Public
 */
router.post('/', validate(addToCartSchema), PanierController.addToCart);

/**
 * @swagger
 * /api/v1/panier/{id}/quantite:
 *   patch:
 *     summary: Met à jour la quantité d'un élément du panier
 *     description: Met à jour la quantité d'un élément du panier par son ID
 *     tags: [Panier]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID de l'élément du panier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quantite
 *             properties:
 *               quantite:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Quantité mise à jour avec succès
 *       400:
 *         description: Données invalides
 *       404:
 *         description: Élément du panier non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PATCH /api/v1/panier/:id/quantite
 * @desc    Met à jour la quantité d'un élément du panier
 * @access  Public
 */
router.patch('/:id/quantite', validateParams(idParamSchema), validate(updateCartQuantitySchema), PanierController.updateCartItemQuantity);

/**
 * @swagger
 * /api/v1/panier/{id}/variants:
 *   patch:
 *     summary: Met à jour les variants d'un élément du panier
 *     description: Met à jour les variants sélectionnés d'un élément du panier par son ID
 *     tags: [Panier]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID de l'élément du panier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - variants_selectionnes
 *             properties:
 *               variants_selectionnes:
 *                 type: object
 *     responses:
 *       200:
 *         description: Variants mis à jour avec succès
 *       400:
 *         description: Données invalides
 *       404:
 *         description: Élément du panier non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   PATCH /api/v1/panier/:id/variants
 * @desc    Met à jour les variants d'un élément du panier
 * @access  Public
 */
router.patch('/:id/variants', validateParams(idParamSchema), validate(updateCartVariantsSchema), PanierController.updateCartItemVariants);

/**
 * @swagger
 * /api/v1/panier/{id}:
 *   delete:
 *     summary: Supprime un élément du panier
 *     description: Supprime un élément du panier par son ID
 *     tags: [Panier]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID de l'élément du panier
 *     responses:
 *       200:
 *         description: Élément supprimé avec succès
 *       400:
 *         description: ID d'élément de panier invalide
 *       404:
 *         description: Élément du panier non trouvé
 *       500:
 *         description: Erreur serveur
 * 
 * @route   DELETE /api/v1/panier/:id
 * @desc    Supprime un élément du panier
 * @access  Public
 */
router.delete('/:id', validateParams(idParamSchema), PanierController.removeFromCart);

/**
 * @swagger
 * /api/v1/panier/{sessionId}/clear:
 *   delete:
 *     summary: Vide le panier
 *     description: Supprime tous les éléments du panier pour une session donnée
 *     tags: [Panier]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID de la session
 *     responses:
 *       200:
 *         description: Panier vidé avec succès
 *       400:
 *         description: ID de session invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   DELETE /api/v1/panier/:sessionId/clear
 * @desc    Vide le panier d'une session
 * @access  Public
 */
router.delete('/:sessionId/clear', validateParams(sessionIdParamSchema), PanierController.clearCart);

/**
 * @swagger
 * /api/v1/panier/{sessionId}/count:
 *   get:
 *     summary: Compte les éléments du panier
 *     description: Compte le nombre d'articles dans le panier pour une session donnée
 *     tags: [Panier]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         schema:
 *           type: string
 *         required: true
 *         description: ID de la session
 *     responses:
 *       200:
 *         description: Nombre d'éléments récupéré avec succès
 *       400:
 *         description: ID de session invalide
 *       500:
 *         description: Erreur serveur
 * 
 * @route   GET /api/v1/panier/:sessionId/count
 * @desc    Compte le nombre d'articles dans le panier
 * @access  Public
 */
router.get('/:sessionId/count', validateParams(sessionIdParamSchema), PanierController.countCartItems);

export default router;
