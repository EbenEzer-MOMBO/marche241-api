/**
 * @swagger
 * components:
 *   schemas:
 *     CommuneLivraison:
 *       type: object
 *       required:
 *         - id
 *         - boutique_id
 *         - nom_commune
 *         - tarif_livraison
 *         - delai_livraison_min
 *         - delai_livraison_max
 *         - est_active
 *         - date_creation
 *         - date_modification
 *       properties:
 *         id:
 *           type: integer
 *           description: ID unique de la commune
 *         boutique_id:
 *           type: integer
 *           description: ID de la boutique associée
 *         nom_commune:
 *           type: string
 *           description: Nom de la commune
 *         code_postal:
 *           type: string
 *           description: Code postal de la commune (optionnel)
 *         tarif_livraison:
 *           type: number
 *           format: float
 *           description: Tarif de livraison pour cette commune
 *         delai_livraison_min:
 *           type: integer
 *           description: Délai minimum de livraison en heures
 *         delai_livraison_max:
 *           type: integer
 *           description: Délai maximum de livraison en heures
 *         est_active:
 *           type: boolean
 *           description: Indique si la commune est active pour les livraisons
 *         date_creation:
 *           type: string
 *           format: date-time
 *           description: Date de création de l'enregistrement
 *         date_modification:
 *           type: string
 *           format: date-time
 *           description: Date de dernière modification
 *     
 *     CreateCommune:
 *       type: object
 *       required:
 *         - boutique_id
 *         - nom_commune
 *         - tarif_livraison
 *         - delai_livraison_min
 *         - delai_livraison_max
 *       properties:
 *         boutique_id:
 *           type: integer
 *           description: ID de la boutique associée
 *         nom_commune:
 *           type: string
 *           description: Nom de la commune
 *         code_postal:
 *           type: string
 *           description: Code postal de la commune (optionnel)
 *         tarif_livraison:
 *           type: number
 *           format: float
 *           description: Tarif de livraison pour cette commune
 *         delai_livraison_min:
 *           type: integer
 *           description: Délai minimum de livraison en heures
 *         delai_livraison_max:
 *           type: integer
 *           description: Délai maximum de livraison en heures
 *         est_active:
 *           type: boolean
 *           default: true
 *           description: Indique si la commune est active pour les livraisons
 *     
 *     UpdateCommune:
 *       type: object
 *       properties:
 *         boutique_id:
 *           type: integer
 *           description: ID de la boutique associée
 *         nom_commune:
 *           type: string
 *           description: Nom de la commune
 *         code_postal:
 *           type: string
 *           description: Code postal de la commune
 *         tarif_livraison:
 *           type: number
 *           format: float
 *           description: Tarif de livraison pour cette commune
 *         delai_livraison_min:
 *           type: integer
 *           description: Délai minimum de livraison en heures
 *         delai_livraison_max:
 *           type: integer
 *           description: Délai maximum de livraison en heures
 *         est_active:
 *           type: boolean
 *           description: Indique si la commune est active pour les livraisons
 *     
 *     ToggleCommuneStatus:
 *       type: object
 *       required:
 *         - est_active
 *       properties:
 *         est_active:
 *           type: boolean
 *           description: Nouvel état d'activation de la commune
 */

// Ce fichier ne contient que des annotations JSDoc pour Swagger
// Il n'y a pas de code à exporter
