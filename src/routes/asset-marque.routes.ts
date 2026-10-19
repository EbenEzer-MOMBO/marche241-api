import { Router } from 'express';
import { AssetMarqueController } from '../controllers/asset-marque.controller';
import { authOrServiceKey, exigerCleService } from '../middlewares/service-auth.middleware';
import { uploadImage } from '../middlewares/upload.middleware';
import { validate, validateParams, validateQuery } from '../middlewares/validation.middleware';
import {
  affectationSchema,
  cleEmplacementParamSchema,
  envoiMediaSchema,
  listeMediasQuerySchema,
  mediaIdParamSchema,
} from '../utils/validation.schemas.asset-marque';

const router = Router();

const admin = [authOrServiceKey, exigerCleService];

/**
 * @swagger
 * tags:
 *   - name: Assets de marque
 *     description: Logos, icônes et images du site, choisis dans une galerie de médias depuis le back-office
 *
 * components:
 *   schemas:
 *     Media:
 *       type: object
 *       properties:
 *         id: { type: integer }
 *         nom: { type: string, example: 'Logo Noël 2026' }
 *         url: { type: string, format: uri }
 *         storage_path: { type: string, example: 'medias/2026/10/logo-noel-ab12cd34.svg' }
 *         mime_type: { type: string, example: 'image/svg+xml' }
 *         taille_octets: { type: integer }
 *         largeur: { type: integer, nullable: true }
 *         hauteur: { type: integer, nullable: true }
 *         cree_par: { type: string, nullable: true }
 *         created_at: { type: string, format: date-time }
 *     EmplacementAsset:
 *       type: object
 *       properties:
 *         cle: { type: string, example: logo_icone }
 *         libelle: { type: string }
 *         description: { type: string, nullable: true }
 *         formats: { type: string, example: 'image/svg+xml,image/png' }
 *         dimensions_conseillees: { type: string, nullable: true, example: '1200x630' }
 *         media_id: { type: integer, nullable: true }
 *         media_nom: { type: string, nullable: true }
 *         media_url: { type: string, nullable: true }
 *         media_mime: { type: string, nullable: true }
 */

/**
 * @swagger
 * /assets-marque:
 *   get:
 *     summary: URL courante de chaque emplacement (null = fichier statique par défaut)
 *     tags: [Assets de marque]
 *     responses:
 *       200: { description: "{ success, assets: { logo_icone: string | null, … } }" }
 */
router.get('/', AssetMarqueController.publics);

/**
 * @swagger
 * /assets-marque/admin/medias:
 *   get:
 *     summary: Lister la galerie de médias
 *     tags: [Assets de marque]
 *     security: [{ serviceKey: [] }]
 *     parameters:
 *       - { in: query, name: recherche, schema: { type: string } }
 *       - { in: query, name: type, schema: { type: string, enum: [image/png, image/jpeg, image/webp, image/x-icon, image/vnd.microsoft.icon, image/svg+xml] } }
 *       - { in: query, name: formats, description: 'Types MIME acceptés, séparés par des virgules (sélecteur d''un emplacement)', schema: { type: string, example: 'image/svg+xml,image/png' } }
 *       - { in: query, name: page, schema: { type: integer, default: 1 } }
 *       - { in: query, name: limite, schema: { type: integer, default: 24, maximum: 200 } }
 *     responses:
 *       200: { description: "{ success, medias: Media[], total, page, limite }" }
 *       403: { description: Clé de service requise }
 *   post:
 *     summary: Envoyer un média (5 Mo max ; SVG refusé s'il contient du code exécutable)
 *     tags: [Assets de marque]
 *     security: [{ serviceKey: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [fichier, nom]
 *             properties:
 *               fichier: { type: string, format: binary }
 *               nom: { type: string, maxLength: 150 }
 *     responses:
 *       201: { description: "{ success, media: Media }" }
 *       400: { description: VALIDATION_ERROR (champ fichier ou nom) }
 */
router.get('/admin/medias', ...admin, validateQuery(listeMediasQuerySchema), AssetMarqueController.listerMedias);
router.post('/admin/medias', ...admin, uploadImage('fichier'), validate(envoiMediaSchema), AssetMarqueController.envoyerMedia);

/**
 * @swagger
 * /assets-marque/admin/medias/{id}:
 *   delete:
 *     summary: Supprimer un média non affecté (ligne puis fichier R2)
 *     tags: [Assets de marque]
 *     security: [{ serviceKey: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ success }" }
 *       404: { description: Média introuvable }
 *       409: { description: "MEDIA_UTILISE : le média est affecté à un emplacement" }
 */
router.delete('/admin/medias/:id', ...admin, validateParams(mediaIdParamSchema), AssetMarqueController.supprimerMedia);

/**
 * @swagger
 * /assets-marque/admin/emplacements:
 *   get:
 *     summary: Lister les emplacements et leur média courant
 *     tags: [Assets de marque]
 *     security: [{ serviceKey: [] }]
 *     responses:
 *       200: { description: "{ success, emplacements: EmplacementAsset[] }" }
 */
router.get('/admin/emplacements', ...admin, AssetMarqueController.listerEmplacements);

/**
 * @swagger
 * /assets-marque/admin/emplacements/{cle}:
 *   put:
 *     summary: Affecter un média à un emplacement (null = revenir au fichier par défaut), puis revalider le front
 *     tags: [Assets de marque]
 *     security: [{ serviceKey: [] }]
 *     parameters:
 *       - { in: path, name: cle, required: true, schema: { type: string, example: logo_icone } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [media_id]
 *             properties:
 *               media_id: { type: integer, nullable: true }
 *     responses:
 *       200: { description: "{ success }" }
 *       400: { description: "VALIDATION_ERROR (format non accepté par l'emplacement)" }
 *       404: { description: Média introuvable }
 */
router.put(
  '/admin/emplacements/:cle',
  ...admin,
  validateParams(cleEmplacementParamSchema),
  validate(affectationSchema),
  AssetMarqueController.affecter
);

export default router;
