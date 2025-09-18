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

// Ajouter d'autres routes ici au fur et à mesure

export default router;
