/**
 * Schémas OpenAPI pour les erreurs renvoyées par le middleware de validation Joi.
 *
 * @see docs/ERREURS_VALIDATION.md
 *
 * @swagger
 * components:
 *   schemas:
 *     ValidationErrorItem:
 *       type: object
 *       required:
 *         - field
 *         - code
 *         - message
 *       properties:
 *         field:
 *           type: string
 *           description: Chemin du champ invalide (notation point si imbriqué)
 *           example: description
 *         code:
 *           type: string
 *           description: Code stable pour le client (ex. STRING_MAX_LENGTH, FIELD_REQUIRED, NUMBER_MIN)
 *           example: STRING_MAX_LENGTH
 *         message:
 *           type: string
 *           description: Détail lisible, souvent enrichi (longueurs, bornes numériques)
 *         meta:
 *           type: object
 *           additionalProperties: true
 *           description: Métadonnées sérialisables selon la règle (limit, length, value, allowed, etc.)
 *           example:
 *             limit: 1000
 *             length: 1523
 *
 *     ValidationErrorResponse:
 *       type: object
 *       required:
 *         - success
 *         - message
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         code:
 *           type: string
 *           example: VALIDATION_ERROR
 *           description: Toujours présent lorsque le tableau errors est renvoyé
 *         message:
 *           type: string
 *           description: Résumé lisible (une erreur détaillée ou plusieurs champs résumés, tronqué si très long)
 *         errors:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ValidationErrorItem'
 *         stack:
 *           type: string
 *           description: Présent uniquement lorsque NODE_ENV vaut development
 */

export {};
