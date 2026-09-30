import { Router } from 'express';
import Joi from 'joi';
import { BilletController } from '../controllers/billet.controller';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';
import { validate, validateParams } from '../middlewares/validation.middleware';

const router = Router();

const billetIdParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': "L'ID du billet doit être un nombre",
    'number.integer': "L'ID du billet doit être un entier",
    'number.positive': "L'ID du billet doit être positif",
    'any.required': "L'ID du billet est obligatoire"
  })
});

const scanBilletSchema = Joi.object({
  scanne: Joi.boolean().required().messages({
    'boolean.base': 'Le champ scanne doit être un booléen',
    'any.required': 'Le champ scanne est obligatoire'
  })
});

/**
 * @swagger
 * /billets/{id}/scan:
 *   patch:
 *     summary: Marquer un billet comme scanné (ou annuler le scan)
 *     tags: [Billets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID du billet
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scanne]
 *             properties:
 *               scanne:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Billet mis à jour (scanne_le renseigné ou remis à null)
 *       400:
 *         description: Paramètres invalides (validation Joi)
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: Le billet n'appartient pas à un produit du vendeur
 *       404:
 *         description: Billet introuvable
 */
router.patch(
  '/:id/scan',
  authOrServiceKey,
  validateParams(billetIdParamSchema),
  validate(scanBilletSchema),
  BilletController.marquerScan
);

router.get('/:jeton/details', BilletController.detailsParJeton);
router.get('/:jeton', BilletController.telechargerParJeton);

export default router;
