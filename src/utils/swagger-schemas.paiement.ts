/**
 * @swagger
 * components:
 *   schemas:
 *     PaiementMobile:
 *       type: object
 *       required:
 *         - email
 *         - msisdn
 *         - amount
 *         - reference
 *         - payment_system
 *         - description
 *         - lastname
 *       properties:
 *         email:
 *           type: string
 *           description: Email du client
 *         msisdn:
 *           type: string
 *           description: Numéro de téléphone au format international
 *         amount:
 *           type: number
 *           description: Montant en francs CFA
 *         reference:
 *           type: string
 *           description: Référence unique de la transaction
 *         payment_system:
 *           type: string
 *           enum: [airtelmoney, moovmoney1]
 *           description: Système de paiement mobile
 *         description:
 *           type: string
 *           description: Description courte du paiement
 *         lastname:
 *           type: string
 *           description: Nom du client
 *         firstname:
 *           type: string
 *           description: Prénom du client (optionnel)
 *     
 *     PaiementVisa:
 *       type: object
 *       required:
 *         - transaction_id
 *         - return_url
 *       properties:
 *         transaction_id:
 *           type: number
 *           description: ID de la transaction
 *         return_url:
 *           type: string
 *           description: URL de retour après le paiement
 *         email:
 *           type: string
 *           description: Email du client (optionnel)
 *         msisdn:
 *           type: string
 *           description: Numéro de téléphone (optionnel)
 *         lastname:
 *           type: string
 *           description: Nom du client (optionnel)
 *         firstname:
 *           type: string
 *           description: Prénom du client (optionnel)
 *     
 *     PaiementResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indique si l'opération a réussi
 *         bill_id:
 *           type: string
 *           description: ID de la facture (bill_id)
 *         redirect:
 *           type: boolean
 *           description: Indique si une redirection est nécessaire (pour Visa)
 *         url:
 *           type: string
 *           description: URL de redirection (pour Visa)
 *         message:
 *           type: string
 *           description: Message d'information
 *         transaction:
 *           type: object
 *           description: Détails de la transaction (pour la vérification)
 */

// Ce fichier ne contient que des annotations JSDoc pour Swagger
// Il n'y a pas de code à exporter
