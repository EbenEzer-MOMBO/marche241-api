import { Router } from 'express';
import boutiqueRoutes from './boutique.routes';
import vendeurRoutes from './vendeur.routes';
import categorieRoutes from './categorie.routes';
import produitRoutes from './produit.routes';
import panierRoutes from './panier.routes';
import communeRoutes from './commune.routes';
import transactionRoutes from './transaction.routes';
import paiementRoutes from './paiement.routes';
import commandeRoutes from './commande.routes';
import whatsappRoutes from './whatsapp.routes';
import uploadRoutes from './upload.routes';
import cronRoutes from './cron.routes';
import { CronController } from '../controllers/cron.controller';

const router = Router();

// Préfixe API défini dans les variables d'environnement
const apiPrefix = process.env.API_PREFIX || '/api/v1';

// Routes pour les boutiques
router.use(`${apiPrefix}/boutiques`, boutiqueRoutes);

// Routes pour les vendeurs
router.use(`${apiPrefix}/vendeurs`, vendeurRoutes);

// Routes pour les catégories
router.use(`${apiPrefix}/categories`, categorieRoutes);

// Routes pour les produits
router.use(`${apiPrefix}/produits`, produitRoutes);

// Routes pour le panier
router.use(`${apiPrefix}/panier`, panierRoutes);

// Routes pour les communes de livraison
router.use(`${apiPrefix}/communes`, communeRoutes);

// Routes pour les transactions
router.use(`${apiPrefix}/transactions`, transactionRoutes);

// Routes pour les paiements
router.use(`${apiPrefix}/paiements`, paiementRoutes);

// Routes pour les commandes
router.use(`${apiPrefix}/commandes`, commandeRoutes);

// Routes pour WhatsApp
router.use(`${apiPrefix}/whatsapp`, whatsappRoutes);

// Routes pour l'upload d'images
router.use(`${apiPrefix}/upload`, uploadRoutes);

// Routes pour les tâches cron
router.use(`${apiPrefix}/cron`, cronRoutes);

// ============================================
// ROUTES PUBLIQUES À LA RACINE (pour cPanel)
// ============================================

// Route de santé à la racine
router.get('/health', CronController.healthCheck);

// Route pour exécuter les tâches cron depuis cPanel
// Exemple: curl https://votre-api.onrender.com/cron/tasks?key=votre_cle_secrete
router.get('/cron/tasks', CronController.executeAllTasks);

// Route pour expirer manuellement les transactions en attente
// Exemple: curl https://votre-api.onrender.com/cron/expirer-transactions
router.get('/cron/expirer-transactions', CronController.executeExpirerTransactions);

// Ajouter d'autres routes ici au fur et à mesure

export default router;
