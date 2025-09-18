/**
 * @swagger
 * components:
 *   schemas:
 *     Transaction:
 *       type: object
 *       required:
 *         - id
 *         - commande_id
 *         - reference_transaction
 *         - montant
 *         - methode_paiement
 *         - statut
 *         - date_creation
 *         - date_modification
 *       properties:
 *         id:
 *           type: integer
 *           description: ID unique de la transaction
 *         commande_id:
 *           type: integer
 *           description: ID de la commande associée
 *         reference_transaction:
 *           type: string
 *           description: Référence unique de la transaction
 *         montant:
 *           type: integer
 *           description: Montant en centimes
 *         methode_paiement:
 *           type: string
 *           enum: [mobile_money, airtel_money, moov_money, especes, virement]
 *           description: Méthode de paiement utilisée
 *         statut:
 *           type: string
 *           enum: [en_attente, paye, echec, rembourse]
 *           description: Statut actuel de la transaction
 *         numero_telephone:
 *           type: string
 *           description: Numéro de téléphone utilisé pour le paiement mobile (optionnel)
 *         reference_operateur:
 *           type: string
 *           description: Référence fournie par l'opérateur (optionnel)
 *         date_creation:
 *           type: string
 *           format: date-time
 *           description: Date de création de la transaction
 *         date_confirmation:
 *           type: string
 *           format: date-time
 *           description: Date de confirmation du paiement (optionnel)
 *         date_modification:
 *           type: string
 *           format: date-time
 *           description: Date de dernière modification
 *         notes:
 *           type: string
 *           description: Notes internes (optionnel)
 *     
 *     CreateTransaction:
 *       type: object
 *       required:
 *         - commande_id
 *         - reference_transaction
 *         - montant
 *         - methode_paiement
 *       properties:
 *         commande_id:
 *           type: integer
 *           description: ID de la commande associée
 *         reference_transaction:
 *           type: string
 *           description: Référence unique de la transaction
 *         montant:
 *           type: integer
 *           description: Montant en centimes
 *         methode_paiement:
 *           type: string
 *           enum: [mobile_money, airtel_money, moov_money, especes, virement]
 *           description: Méthode de paiement utilisée
 *         statut:
 *           type: string
 *           enum: [en_attente, paye, echec, rembourse]
 *           default: en_attente
 *           description: Statut initial de la transaction
 *         numero_telephone:
 *           type: string
 *           description: Numéro de téléphone utilisé pour le paiement mobile (optionnel)
 *         reference_operateur:
 *           type: string
 *           description: Référence fournie par l'opérateur (optionnel)
 *         notes:
 *           type: string
 *           description: Notes internes (optionnel)
 *     
 *     UpdateTransaction:
 *       type: object
 *       properties:
 *         commande_id:
 *           type: integer
 *           description: ID de la commande associée
 *         reference_transaction:
 *           type: string
 *           description: Référence unique de la transaction
 *         montant:
 *           type: integer
 *           description: Montant en centimes
 *         methode_paiement:
 *           type: string
 *           enum: [mobile_money, airtel_money, moov_money, especes, virement]
 *           description: Méthode de paiement utilisée
 *         statut:
 *           type: string
 *           enum: [en_attente, paye, echec, rembourse]
 *           description: Statut de la transaction
 *         numero_telephone:
 *           type: string
 *           description: Numéro de téléphone utilisé pour le paiement mobile
 *         reference_operateur:
 *           type: string
 *           description: Référence fournie par l'opérateur
 *         notes:
 *           type: string
 *           description: Notes internes
 *     
 *     UpdateTransactionStatus:
 *       type: object
 *       required:
 *         - statut
 *       properties:
 *         statut:
 *           type: string
 *           enum: [en_attente, paye, echec, rembourse]
 *           description: Nouveau statut de la transaction
 *         reference_operateur:
 *           type: string
 *           description: Référence fournie par l'opérateur (optionnel)
 *         notes:
 *           type: string
 *           description: Notes internes (optionnel)
 *     
 *     TransactionStats:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Nombre total de transactions
 *         totalAmount:
 *           type: integer
 *           description: Montant total des transactions en centimes
 *         byStatus:
 *           type: object
 *           description: Nombre de transactions par statut
 *         byMethod:
 *           type: object
 *           description: Nombre de transactions par méthode de paiement
 *         successRate:
 *           type: number
 *           format: float
 *           description: Taux de réussite des transactions en pourcentage
 */

// Ce fichier ne contient que des annotations JSDoc pour Swagger
// Il n'y a pas de code à exporter
