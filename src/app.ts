import express, { Application } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import routes from './routes';
import { errorHandler, notFound } from './middlewares/error.middleware';
import { requestLogger, errorLogger } from './middlewares/logger.middleware';
import { setupSwagger } from './utils/swagger';
import { EmailService } from './services/email.service';
import { MonitorService } from './services/monitor.service';

// Charger les variables d'environnement
dotenv.config();

// Initialiser les services
EmailService.initialize();

const app: Application = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Middlewares
app.use(cors({
  origin: [
    process.env.CORS_ORIGIN || '*',
    'http://localhost:3000',
    'http://192.168.1.7:3000',
    'http://192.168.1.6:3000',
    'http://192.168.1.2:3000',
    'https://marche241-production.up.railway.app',
    'https://marche241-backend-production.up.railway.app',
    'https://marche241.netlify.app',
    'https://marche241-api.onrender.com',
    'https://marche241.ga'
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

// Middleware pour désactiver le cache pour les routes API
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// Déterminer le chemin des fichiers statiques
const publicPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'public')
  : path.join(__dirname, '..', 'src', 'public');

// Servir les fichiers statiques s'ils existent
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// En développement, servir également les images depuis src/public/images
if (process.env.NODE_ENV !== 'production') {
  const imagesPath = path.join(__dirname, '..', 'public', 'images');
  if (fs.existsSync(imagesPath)) {
    app.use('/images', express.static(imagesPath));
  }
}

// Configurer Swagger
setupSwagger(app);

// Routes API
app.use(routes);

// Route racine
app.get('/', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({
      message: 'Bienvenue sur l\'API Marché 241',
      version: process.env.APP_VERSION || '1.0.0',
      documentation: '/api-docs',
      status: 'online',
      timestamp: new Date().toISOString()
    });
  }
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

// Route de health check pour le monitoring
app.get('/health', (req, res) => {
  const status = MonitorService.getStatus();
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    monitor: {
      lastPing: status.lastPingTime,
      isActive: status.isActive
    }
  });
});

// Middleware pour les routes non trouvées
app.use(notFound);

// Middleware de journalisation des erreurs
app.use(errorLogger);

// Middleware de gestion des erreurs
app.use(errorHandler);

export default app;