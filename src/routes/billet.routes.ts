import { Router } from 'express';
import Joi from 'joi';
import { BilletController } from '../controllers/billet.controller';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';
import { validate, validateParams } from '../middlewares/validation.middleware';
import { renvoiBilletsLimiter } from '../middlewares/rate-limit.middleware';

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

const commandeIdParamSchema = Joi.object({
  commandeId: Joi.number().integer().positive().required().messages({
    'number.base': "L'ID de la commande doit être un nombre",
    'number.integer': "L'ID de la commande doit être un entier",
    'number.positive': "L'ID de la commande doit être positif",
    'any.required': "L'ID de la commande est obligatoire"
  })
});

/**
 * @swagger
 * /billets/commande/{commandeId}/renvoyer-email:
 *   post:
 *     summary: Renvoyer à l'acheteur l'email contenant ses billets
 *     description: Même email que celui envoyé à la confirmation du paiement. Réservé au vendeur de l'événement (ou admin via clé de service).
 *     tags: [Billets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commandeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID de la commande
 *     responses:
 *       200:
 *         description: Email renvoyé
 *       400:
 *         description: Paramètre invalide ou commande sans adresse email
 *       401:
 *         description: Non authentifié
 *       403:
 *         description: La commande ne concerne pas un événement du vendeur
 *       404:
 *         description: Aucun billet pour cette commande
 *       429:
 *         description: Trop d'envois
 */
router.post(
  '/commande/:commandeId/renvoyer-email',
  authOrServiceKey,
  renvoiBilletsLimiter,
  validateParams(commandeIdParamSchema),
  BilletController.renvoyerEmail
);

router.get('/:jeton/details', BilletController.detailsParJeton);
router.get('/:jeton', BilletController.telechargerParJeton);

export default router;
