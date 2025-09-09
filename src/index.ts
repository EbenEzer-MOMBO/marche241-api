import app from './app';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const port = process.env.PORT || 3000;

// Démarrer le serveur
app.listen(port, () => {
  console.log(`🚀 Serveur démarré sur le port ${port}`);
  console.log(`📝 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API disponible à l'adresse: http://localhost:${port}${process.env.API_PREFIX || '/api/v1'}`);
});
