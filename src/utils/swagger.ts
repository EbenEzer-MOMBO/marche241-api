import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

// Options de configuration Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Marché 241 API',
      version: process.env.APP_VERSION || '1.0.0',
      description: 'API pour la plateforme de commerce électronique Marché 241',
      contact: {
        name: 'Eben Ezer MOMBO',
        email: 'contact@marche241.com'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Serveur de développement'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/*.ts',
    './src/utils/swagger-schemas.ts',
    './src/utils/swagger-schemas.commune.ts'
  ] // Chemins vers les fichiers avec les annotations JSDoc
};

// Générer la spécification Swagger
const swaggerSpec = swaggerJSDoc(swaggerOptions);

/**
 * Fonction pour configurer Swagger dans l'application Express
 * @param app Application Express
 */
export const setupSwagger = (app: Application): void => {
  // Route pour la documentation Swagger
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  
  // Route pour obtenir la spécification Swagger au format JSON
  app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
  
  console.log('📚 Documentation Swagger disponible à l\'adresse: /api/docs');
};

export default setupSwagger;
