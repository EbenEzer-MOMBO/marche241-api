import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import routes from './routes';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { requestLogger, errorLogger } from './middlewares/logger.middleware';
import { setupSwagger } from './utils/swagger';

// Charger les variables d'environnement
dotenv.config();

const app: Application = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors({
  origin: [
    process.env.CORS_ORIGIN || '*',
    'http://localhost:3001',
    'https://marche241-production.up.railway.app',
    'https://marche241-backend-production.up.railway.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));



// Logger middleware
app.use(requestLogger);

// Déterminer le chemin des fichiers statiques
const publicPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'src', 'public');

// Servir les fichiers statiques
app.use(express.static(publicPath));

// Configurer Swagger
setupSwagger(app);

// Routes API
app.use(routes);

// Route racine pour servir la page d'accueil
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Route pour vérifier que l'API fonctionne
app.get('/api/status', (req, res) => {
  res.json({
    message: 'Bienvenue sur l\'API Marché 241',
    version: process.env.APP_VERSION || '1.0.0',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Middleware pour les routes non trouvées
app.use(notFound);

// Middleware de journalisation des erreurs
app.use(errorLogger);

// Middleware de gestion des erreurs
app.use(errorHandler);

// Le serveur est démarré dans index.ts

export default app;
