/**
 * @swagger
 * components:
 *   schemas:
 *     DemandeCodeVerification:
 *       type: object
 *       required:
 *         - email
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Adresse email du vendeur
 *           example: "vendeur@example.com"
 *       example:
 *         email: "vendeur@example.com"
 *
 *     VerificationCode:
 *       type: object
 *       required:
 *         - email
 *         - code
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Adresse email du vendeur
 *           example: "vendeur@example.com"
 *         code:
 *           type: string
 *           pattern: '^[0-9]{6}$'
 *           description: Code de vérification à 6 chiffres
 *           example: "123456"
 *       example:
 *         email: "vendeur@example.com"
 *         code: "123456"
 *
 *     ReponseCodeVerification:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indique si la demande a réussi
 *         message:
 *           type: string
 *           description: Message de confirmation ou d'erreur
 *         code:
 *           type: string
 *           description: Code de vérification (uniquement en mode développement)
 *       example:
 *         success: true
 *         message: "Code de vérification envoyé par email avec succès"
 *         code: "123456"
 *
 *     ReponseVerificationCode:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           description: Indique si la vérification a réussi
 *         message:
 *           type: string
 *           description: Message de confirmation ou d'erreur
 *         vendeur:
 *           $ref: '#/components/schemas/Vendeur'
 *         token:
 *           type: string
 *           description: Token JWT pour l'authentification
 *       example:
 *         success: true
 *         message: "Code de vérification valide - Connexion réussie"
 *         vendeur:
 *           id: 1
 *           email: "vendeur@example.com"
 *           nom: "Jean Dupont"
 *           statut: "actif"
 *         token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *
 *     ErreurAuthentification:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           description: Message d'erreur
 *         error:
 *           type: string
 *           description: Détails de l'erreur (optionnel)
 *       example:
 *         success: false
 *         message: "Aucun compte vendeur trouvé avec cette adresse email. Veuillez vous inscrire d'abord."
 *
 *     ErreurCodeInvalide:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *           description: Message d'erreur
 *         tentatives_restantes:
 *           type: integer
 *           description: Nombre de tentatives restantes
 *       example:
 *         success: false
 *         message: "Code de vérification invalide ou expiré"
 *         tentatives_restantes: 2
 */

// Ce fichier ne contient que des annotations JSDoc pour Swagger
// Il n'y a pas de code à exporter
