import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// Charger les variables d'environnement
dotenv.config();

const endpoint = process.env.STORAGE_ENDPOINT;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;

if (!endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error('Les variables d\'environnement du stockage (STORAGE_*) ne sont pas définies');
}

/**
 * Nom du bucket de destination des fichiers uploadés.
 */
export const storageBucket = process.env.STORAGE_BUCKET || 'marche241-uploads';

/**
 * URL publique de base servant les objets du bucket, sans slash final
 * (domaine personnalisé ou sous-domaine r2.dev).
 */
export const storagePublicUrl = (process.env.STORAGE_PUBLIC_URL || '').replace(/\/+$/, '');

if (!storagePublicUrl) {
  throw new Error('La variable d\'environnement STORAGE_PUBLIC_URL n\'est pas définie');
}

/**
 * Client S3 configuré pour Cloudflare R2.
 * R2 ignore la région mais le SDK en exige une : `auto` est la valeur
 * recommandée par Cloudflare.
 */
export const s3Client = new S3Client({
  region: process.env.STORAGE_REGION || 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

/**
 * Construit l'URL publique d'un objet à partir de son chemin dans le bucket.
 * @param storagePath Chemin de l'objet (ex: `produits/ma-boutique/image.jpg`)
 */
export const buildPublicUrl = (storagePath: string): string => {
  const normalisedPath = storagePath.replace(/^\/+/, '');

  return `${storagePublicUrl}/${normalisedPath}`;
};
