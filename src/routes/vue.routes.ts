import { Router } from 'express';
import { VueController } from '../controllers/vue.controller';
import { optionalAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validation.middleware';
import { enregistrerVueSchema } from '../utils/validation.schemas.vue';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Vues
 *     description: Suivi d'audience des vitrines et des produits
 * /vues:
 *   post:
 *     summary: Enregistrer une vue visiteur
 *     tags: [Vues]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type_entite, entite_id]
 *             properties:
 *               type_entite: { type: string, enum: [boutique, produit] }
 *               entite_id: { type: integer }
 *               referrer: { type: string }
 *               utm_source: { type: string, example: whatsapp }
 *               fuseau:
 *                 type: string
 *                 example: Africa/Libreville
 *                 description: Fuseau horaire du navigateur, source du pays (non modifié par un VPN)
 *     responses:
 *       202: { description: "{ success: true, enregistree: boolean }" }
 *       400: { description: VALIDATION_ERROR }
 *       404: { description: Entité introuvable }
 */
router.post('/', optionalAuth, validate(enregistrerVueSchema), VueController.enregistrer);

export default router;
