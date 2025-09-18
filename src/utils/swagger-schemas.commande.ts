/**
 * @swagger
 * components:
 *   schemas:
 *     CommandeArticle:
 *       type: object
 *       required:
 *         - produit_id
 *         - quantite
 *         - prix_unitaire
 *         - nom_produit
 *       properties:
 *         produit_id:
 *           type: integer
 *           description: ID du produit
 *         quantite:
 *           type: integer
 *           minimum: 1
 *           description: Quantité commandée
 *         prix_unitaire:
 *           type: number
 *           format: float
 *           minimum: 0
 *           description: Prix unitaire du produit
 *         nom_produit:
 *           type: string
 *           description: Nom du produit
 *         description:
 *           type: string
 *           description: Description du produit (optionnel)
 *     
 *     CreateCommande:
 *       type: object
 *       required:
 *         - boutique_id
 *         - client_nom
 *         - client_telephone
 *         - client_adresse
 *         - client_ville
 *         - client_commune
 *         - articles
 *       properties:
 *         boutique_id:
 *           type: integer
 *           description: ID de la boutique
 *         client_nom:
 *           type: string
 *           description: Nom du client
 *         client_telephone:
 *           type: string
 *           description: Numéro de téléphone du client
 *         client_adresse:
 *           type: string
 *           description: Adresse du client
 *         client_ville:
 *           type: string
 *           description: Ville du client
 *         client_commune:
 *           type: string
 *           description: Commune du client
 *         client_instructions:
 *           type: string
 *           description: Instructions spéciales du client (optionnel)
 *         frais_livraison:
 *           type: number
 *           format: float
 *           minimum: 0
 *           default: 0
 *           description: Frais de livraison
 *         taxes:
 *           type: number
 *           format: float
 *           minimum: 0
 *           default: 0
 *           description: Taxes
 *         remise:
 *           type: number
 *           format: float
 *           minimum: 0
 *           default: 0
 *           description: Remise
 *         articles:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CommandeArticle'
 *           description: Articles de la commande
 *     
 *     Commande:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: ID unique de la commande
 *         numero_commande:
 *           type: string
 *           description: Numéro unique de la commande (format CMD-YYYY-XXXXXX)
 *         boutique_id:
 *           type: integer
 *           description: ID de la boutique
 *         client_nom:
 *           type: string
 *           description: Nom du client
 *         client_telephone:
 *           type: string
 *           description: Numéro de téléphone du client
 *         client_adresse:
 *           type: string
 *           description: Adresse du client
 *         client_ville:
 *           type: string
 *           description: Ville du client
 *         client_commune:
 *           type: string
 *           description: Commune du client
 *         client_instructions:
 *           type: string
 *           description: Instructions spéciales du client (optionnel)
 *         sous_total:
 *           type: number
 *           format: float
 *           description: Sous-total de la commande
 *         frais_livraison:
 *           type: number
 *           format: float
 *           description: Frais de livraison
 *         taxes:
 *           type: number
 *           format: float
 *           description: Taxes
 *         remise:
 *           type: number
 *           format: float
 *           description: Remise
 *         total:
 *           type: number
 *           format: float
 *           description: Total de la commande
 *         statut:
 *           type: string
 *           enum: [en_attente, confirmee, en_preparation, expedie, livree, annulee, remboursee]
 *           description: Statut de la commande
 *         statut_paiement:
 *           type: string
 *           enum: [en_attente, paye, echec, rembourse]
 *           description: Statut du paiement
 *         methode_paiement:
 *           type: string
 *           enum: [mobile_money, airtel_money, moov_money, especes, virement]
 *           description: Méthode de paiement (optionnel)
 *         date_commande:
 *           type: string
 *           format: date-time
 *           description: Date de création de la commande
 *         date_confirmation:
 *           type: string
 *           format: date-time
 *           description: Date de confirmation de la commande (optionnel)
 *         date_expedition:
 *           type: string
 *           format: date-time
 *           description: Date d'expédition de la commande (optionnel)
 *         date_livraison:
 *           type: string
 *           format: date-time
 *           description: Date de livraison de la commande (optionnel)
 *         date_modification:
 *           type: string
 *           format: date-time
 *           description: Date de dernière modification
 *         boutique:
 *           type: object
 *           description: Détails de la boutique
 *         articles:
 *           type: array
 *           items:
 *             type: object
 *           description: Articles de la commande
 *         transactions:
 *           type: array
 *           items:
 *             type: object
 *           description: Transactions liées à la commande
 *     
 *     UpdateCommandeStatus:
 *       type: object
 *       required:
 *         - statut
 *       properties:
 *         statut:
 *           type: string
 *           enum: [en_attente, confirmee, en_preparation, expedie, livree, annulee, remboursee]
 *           description: Nouveau statut de la commande
 *     
 *     UpdatePaymentStatus:
 *       type: object
 *       required:
 *         - statut_paiement
 *       properties:
 *         statut_paiement:
 *           type: string
 *           enum: [en_attente, paye, echec, rembourse]
 *           description: Nouveau statut de paiement
 *         methode_paiement:
 *           type: string
 *           enum: [mobile_money, airtel_money, moov_money, especes, virement]
 *           description: Méthode de paiement (optionnel)
 *     
 *     InitierPaiement:
 *       type: object
 *       required:
 *         - methode_paiement
 *       properties:
 *         methode_paiement:
 *           type: string
 *           enum: [mobile_money, airtel_money, moov_money, especes, virement]
 *           description: Méthode de paiement
 *         numero_telephone:
 *           type: string
 *           description: Numéro de téléphone pour le paiement mobile (requis pour mobile_money, airtel_money, moov_money)
 */

// Ce fichier ne contient que des annotations JSDoc pour Swagger
// Il n'y a pas de code à exporter
