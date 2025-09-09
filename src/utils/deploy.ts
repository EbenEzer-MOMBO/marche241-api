import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

/**
 * Script pour préparer le déploiement de l'API
 */
async function prepareDeployment() {
  try {
    console.log('🚀 Préparation du déploiement...');
    
    // 1. S'assurer que le dossier dist existe
    const distDir = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    
    // 2. S'assurer que le dossier public existe dans dist
    const publicDistDir = path.join(distDir, 'public');
    if (!fs.existsSync(publicDistDir)) {
      fs.mkdirSync(publicDistDir, { recursive: true });
    }
    
    // 3. Copier les fichiers statiques
    const publicSrcDir = path.join(process.cwd(), 'src', 'public');
    if (fs.existsSync(publicSrcDir)) {
      console.log('📂 Copie des fichiers statiques...');
      
      // Lire tous les fichiers du dossier source
      const files = fs.readdirSync(publicSrcDir);
      
      // Copier chaque fichier
      files.forEach(file => {
        const srcPath = path.join(publicSrcDir, file);
        const destPath = path.join(publicDistDir, file);
        
        // Vérifier si c'est un fichier
        if (fs.statSync(srcPath).isFile()) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`✅ Copié: ${file}`);
        }
      });
    }
    
    // 4. Compiler le code TypeScript
    console.log('🔨 Compilation du code TypeScript...');
    return new Promise<void>((resolve, reject) => {
      exec('npm run build', (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Erreur lors de la compilation:', error);
          reject(error);
          return;
        }
        
        console.log(stdout);
        
        if (stderr) {
          console.warn('⚠️ Avertissements:', stderr);
        }
        
        console.log('✅ Compilation terminée');
        resolve();
      });
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de la préparation du déploiement:', error);
    throw error;
  }
}

// Exécuter le script si appelé directement
if (require.main === module) {
  prepareDeployment()
    .then(() => {
      console.log('✅ Préparation du déploiement terminée');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Échec de la préparation du déploiement:', error);
      process.exit(1);
    });
}

export default prepareDeployment;
