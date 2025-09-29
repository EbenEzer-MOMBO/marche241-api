import { Router } from 'express';
import { UploadController } from '../controllers/upload.controller';
import { uploadImage, uploadMultipleImages } from '../middlewares/upload.middleware';
import { auth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import Joi from 'joi';

const router = Router();

// Schéma de validation pour la suppression d'image
const deleteImageSchema = Joi.object({
  path: Joi.string().required().messages({
    'any.required': 'Le chemin de l\'image est obligatoire'
  })
});

/**
 * @swagger
 * tags:
 *   name: Upload
 *   description: Gestion des uploads d'images
 */

/**
 * @swagger
 * /api/v1/upload/image:
 *   post:
 *     summary: Upload une seule image
 *     description: Upload une image vers Supabase Storage
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folder
 *         schema:
 *           type: string
 *         description: Dossier de destination (par défaut 'general')
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Fichier image à uploader (max 5MB)
 *     responses:
 *       200:
 *         description: Image uploadée avec succès
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
 *                   example: Image uploadée avec succès
 *                 donnees:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       description: URL publique de l'image
 *                       example: https://example.com/storage/v1/object/public/marche241-uploads/produits/image_123456.jpg
 *                     path:
 *                       type: string
 *                       description: Chemin de l'image dans le bucket
 *                       example: produits/image_123456.jpg
 *                     taille:
 *                       type: integer
 *                       description: Taille du fichier en octets
 *                       example: 1024000
 *                     type:
 *                       type: string
 *                       description: Type MIME du fichier
 *                       example: image/jpeg
 *       400:
 *         description: Erreur de validation ou d'upload
 *       401:
 *         description: Non authentifié
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/upload/image
 * @desc    Upload une image vers Supabase Storage
 * @access  Private
 */
router.post('/image', auth, uploadImage('image'), UploadController.uploadImage);

/**
 * @swagger
 * /api/v1/upload/images:
 *   post:
 *     summary: Upload plusieurs images
 *     description: Upload plusieurs images vers Supabase Storage (max 5 images)
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folder
 *         schema:
 *           type: string
 *         description: Dossier de destination (par défaut 'general')
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Fichiers images à uploader (max 5 images, 5MB chacune)
 *     responses:
 *       200:
 *         description: Images uploadées avec succès
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
 *                   example: Images uploadées avec succès
 *                 donnees:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       url:
 *                         type: string
 *                         description: URL publique de l'image
 *                       path:
 *                         type: string
 *                         description: Chemin de l'image dans le bucket
 *                       taille:
 *                         type: integer
 *                         description: Taille du fichier en octets
 *                       type:
 *                         type: string
 *                         description: Type MIME du fichier
 *                       nom_original:
 *                         type: string
 *                         description: Nom original du fichier
 *       400:
 *         description: Erreur de validation ou d'upload
 *       401:
 *         description: Non authentifié
 *       500:
 *         description: Erreur serveur
 * 
 * @route   POST /api/v1/upload/images
 * @desc    Upload plusieurs images vers Supabase Storage
 * @access  Private
 */
// Utiliser le champ 'images' pour l'upload multiple
router.post('/images', auth, uploadMultipleImages('images', 5), UploadController.uploadMultipleImages);

/**
 * @swagger
 * /api/v1/upload/delete:
 *   delete:
 *     summary: Supprime une image
 *     description: Supprime une image de Supabase Storage
 *     tags: [Upload]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - path
 *             properties:
 *               path:
 *                 type: string
 *                 description: Chemin de l'image dans le bucket
 *                 example: produits/image_123456.jpg
 *     responses:
 *       200:
 *         description: Image supprimée avec succès
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
 *                   example: Image supprimée avec succès
 *       400:
 *         description: Erreur de validation ou de suppression
 *       401:
 *         description: Non authentifié
 *       500:
 *         description: Erreur serveur
 * 
 * @route   DELETE /api/v1/upload/delete
 * @desc    Supprime une image de Supabase Storage
 * @access  Private
 */
router.delete('/delete', auth, validate(deleteImageSchema), UploadController.deleteImage);

export default router;
