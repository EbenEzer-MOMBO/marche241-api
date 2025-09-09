import { Router } from 'express';
import boutiqueRoutes from './boutique.routes';
import vendeurRoutes from './vendeur.routes';

const router = Router();

// Préfixe API défini dans les variables d'environnement
const apiPrefix = process.env.API_PREFIX || '/api/v1';

// Routes pour les boutiques
router.use(`${apiPrefix}/boutiques`, boutiqueRoutes);

// Routes pour les vendeurs
router.use(`${apiPrefix}/vendeurs`, vendeurRoutes);

// Ajouter d'autres routes ici au fur et à mesure

export default router;
