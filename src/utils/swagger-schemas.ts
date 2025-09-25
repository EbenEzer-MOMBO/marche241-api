/**
 * @swagger
 * components:
 *   schemas:
 *     Boutique:
 *       type: object
 *       required:
 *         - id
 *         - nom
 *         - slug
 *         - vendeur_id
 *         - statut
 *         - date_creation
 *         - date_modification
 *       properties:
 *         id:
 *           type: integer
 *           description: ID unique de la boutique
 *         nom:
 *           type: string
 *           description: Nom de la boutique
 *         slug:
 *           type: string
 *           description: Slug URL-friendly de la boutique
 *         description:
 *           type: string
 *           description: Description de la boutique
 *         vendeur_id:
 *           type: integer
 *           description: ID du vendeur propriétaire
 *         logo:
 *           type: string
 *           description: URL du logo de la boutique
 *         couleur_primaire:
 *           type: string
 *           description: Couleur primaire de la boutique (format hexadécimal)
 *         couleur_secondaire:
 *           type: string
 *           description: Couleur secondaire de la boutique (format hexadécimal)
 *         adresse:
 *           type: string
 *           description: Adresse physique de la boutique
 *         telephone:
 *           type: string
 *           description: Numéro de téléphone de contact
 *         statut:
 *           type: string
 *           enum: [active, inactive, en_attente, suspendue]
 *           description: Statut actuel de la boutique
 *         date_creation:
 *           type: string
 *           format: date-time
 *           description: Date de création de la boutique
 *         date_modification:
 *           type: string
 *           format: date-time
 *           description: Date de dernière modification
 *         nombre_produits:
 *           type: integer
 *           description: Nombre total de produits dans la boutique
 *         note_moyenne:
 *           type: number
 *           format: float
 *           description: Note moyenne de la boutique (sur 5)
 *         nombre_avis:
 *           type: integer
 *           description: Nombre total d'avis sur la boutique
 *     
 *     Vendeur:
 *       type: object
 *       required:
 *         - id
 *         - email
 *         - nom
 *         - tentatives_code
 *         - date_creation
 *         - date_modification
 *         - statut
 *       properties:
 *         id:
 *           type: integer
 *           description: ID unique du vendeur
 *         email:
 *           type: string
 *           format: email
 *           description: Adresse email du vendeur (identifiant principal)
 *         nom:
 *           type: string
 *           description: Nom du vendeur
 *         telephone:
 *           type: string
 *           description: Numéro de téléphone du vendeur (optionnel)
 *         code_verification:
 *           type: string
 *           description: Code de vérification temporaire
 *         code_expiration:
 *           type: string
 *           format: date-time
 *           description: Date d'expiration du code de vérification
 *         tentatives_code:
 *           type: integer
 *           description: Nombre de tentatives de saisie du code
 *         derniere_tentative:
 *           type: string
 *           format: date-time
 *           description: Date de la dernière tentative de connexion
 *         date_creation:
 *           type: string
 *           format: date-time
 *           description: Date de création du compte vendeur
 *         date_modification:
 *           type: string
 *           format: date-time
 *           description: Date de dernière modification du compte
 *         statut:
 *           type: string
 *           enum: [actif, inactif, suspendu, en_attente_verification]
 *           description: Statut actuel du vendeur
 *         photo_profil:
 *           type: string
 *           description: URL de la photo de profil
 *         ville:
 *           type: string
 *           description: Ville du vendeur
 *         verification_telephone:
 *           type: boolean
 *           description: Indique si le téléphone a été vérifié
 *         verification_email:
 *           type: boolean
 *           description: Indique si l'email a été vérifié
 *         derniere_connexion:
 *           type: string
 *           format: date-time
 *           description: Date de la dernière connexion
 *
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// Ce fichier ne contient que des annotations JSDoc pour Swagger
// Il n'y a pas de code à exporter
