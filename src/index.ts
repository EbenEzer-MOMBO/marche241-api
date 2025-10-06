import app from './app';
import dotenv from 'dotenv';
import os from 'os';
import http from 'http';
import { WebSocketService } from './services/websocket.service';
import { MonitorService } from './services/monitor.service';

// Charger les variables d'environnement
dotenv.config();

const port = parseInt(process.env.PORT || '3000', 10);

// Créer le serveur HTTP
const server = http.createServer(app);

// Initialiser le service WebSocket
WebSocketService.initialize(server);

// Démarrer le serveur sur toutes les interfaces réseau (0.0.0.0)
server.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Serveur démarré sur le port ${port}`);
  console.log(`📝 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API disponible localement à l'adresse: http://localhost:${port}${process.env.API_PREFIX || '/api/v1'}`);
  
  // Initialiser le monitoring en production
  if (process.env.NODE_ENV === 'production') {
    const appUrl = process.env.APP_URL || `http://localhost:${port}`;
    MonitorService.initialize(appUrl);
  }

  // Afficher l'adresse IP locale pour faciliter l'accès depuis d'autres appareils
  const nets = os.networkInterfaces();
  const results: {[key: string]: string[]} = {};

  if (nets) {
    for (const name of Object.keys(nets)) {
      const interfaces = nets[name];
      if (interfaces) {
        for (const net of interfaces) {
          // Ignorer les interfaces non IPv4 et les interfaces de bouclage interne
          if (net.family === 'IPv4' && !net.internal) {
            if (!results[name]) {
              results[name] = [];
            }
            results[name].push(net.address);
          }
        }
      }
    }
  }
  
  // Afficher les adresses IP disponibles
  console.log('\n🌐 API disponible sur le réseau aux adresses suivantes:');
  for (const [dev, addresses] of Object.entries(results)) {
    for (const addr of addresses) {
      console.log(`   http://${addr}:${port}${process.env.API_PREFIX || '/api/v1'}`);
    }
  }
});

// Gestion propre de l'arrêt du serveur
process.on('SIGTERM', () => {
  console.log('Signal SIGTERM reçu. Arrêt propre du serveur...');
  MonitorService.cleanup();
  WebSocketService.cleanup();
  server.close(() => {
    console.log('Serveur arrêté avec succès');
    process.exit(0);
  });
});