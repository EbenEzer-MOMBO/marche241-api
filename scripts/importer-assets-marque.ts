/**
 * Envoie les fichiers de marque actuels du front vers R2 et les rattache.
 * Usage : npx ts-node scripts/importer-assets-marque.ts
 * image_partage n'est pas importé (aucun visuel 1200×630).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { buildPublicUrl, s3Client, storageBucket } from '../src/config/storage';
import { query } from '../src/config/database';
import { lireDimensionsRaster, lireViewBox, nettoyerSvg } from '../src/services/asset-marque.utils';

const frontPublic = path.resolve(__dirname, '../../marche241_v2/public');
const frontApp = path.resolve(__dirname, '../../marche241_v2/src/app');

const FICHIERS: Array<{ cle: string; chemin: string; mime: string; nom: string }> = [
  { cle: 'logo_icone', chemin: path.join(frontPublic, 'marche241_Web_without_text-01-01.svg'), mime: 'image/svg+xml', nom: 'Symbole' },
  { cle: 'logo_texte', chemin: path.join(frontPublic, 'Logo_vector_text-02.svg'), mime: 'image/svg+xml', nom: 'Texte' },
  { cle: 'logo_complet', chemin: path.join(frontPublic, 'marche241_Web_with_text-01.svg'), mime: 'image/svg+xml', nom: 'Logo complet' },
  { cle: 'logo_email', chemin: path.join(frontPublic, 'images/site-logo-mail.png'), mime: 'image/png', nom: 'Logo email' },
  { cle: 'favicon', chemin: path.join(frontApp, 'favicon.ico'), mime: 'image/x-icon', nom: 'Favicon' },
  { cle: 'icone_app', chemin: path.join(frontPublic, 'site-logo.png'), mime: 'image/png', nom: 'Icône application' },
  { cle: 'hero_home', chemin: path.join(frontPublic, 'home1.jpg'), mime: 'image/jpeg', nom: 'Hero accueil' },
  { cle: 'illustration_1', chemin: path.join(frontPublic, 'home1.png'), mime: 'image/png', nom: 'Illustration 1' },
  { cle: 'illustration_2', chemin: path.join(frontPublic, 'home2.png'), mime: 'image/png', nom: 'Illustration 2' },
  { cle: 'illustration_3', chemin: path.join(frontPublic, 'home3.jpg'), mime: 'image/jpeg', nom: 'Illustration 3' },
  { cle: 'fond_billetterie', chemin: path.join(frontPublic, 'images/billetterie/concert-fond.jpg'), mime: 'image/jpeg', nom: 'Fond billetterie' },
  { cle: 'image_boutique_defaut', chemin: path.join(frontPublic, 'default-shop.png'), mime: 'image/png', nom: 'Boutique par défaut' },
  { cle: 'image_produit_defaut', chemin: path.join(frontPublic, 'default-product.png'), mime: 'image/png', nom: 'Produit par défaut' },
];

async function importer(): Promise<void> {
  for (const fichier of FICHIERS) {
    if (!fs.existsSync(fichier.chemin)) {
      console.warn('absent', fichier.chemin);
      continue;
    }
    let corps = fs.readFileSync(fichier.chemin);
    let mime = fichier.mime;
    let largeur: number | null = null;
    let hauteur: number | null = null;
    if (mime === 'image/svg+xml') {
      const propre = nettoyerSvg(corps.toString('utf8'));
      if (!propre) {
        console.warn('svg refusé', fichier.cle);
        continue;
      }
      corps = Buffer.from(propre, 'utf8');
      const dimensions = lireViewBox(propre);
      largeur = dimensions.largeur;
      hauteur = dimensions.hauteur;
    } else {
      const dimensions = lireDimensionsRaster(corps, mime);
      largeur = dimensions.largeur;
      hauteur = dimensions.hauteur;
    }
    const ext = path.extname(fichier.chemin);
    const storagePath = `medias/import/${fichier.cle}-${crypto.randomBytes(3).toString('hex')}${ext}`;
    await s3Client.send(new PutObjectCommand({
      Bucket: storageBucket,
      Key: storagePath,
      Body: corps,
      ContentType: mime,
    }));
    const url = buildPublicUrl(storagePath);
    const insere = await query<{ id: number }>(
      `INSERT INTO medias (nom, url, storage_path, mime_type, taille_octets, largeur, hauteur, cree_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [fichier.nom, url, storagePath, mime, corps.length, largeur, hauteur, 'import']
    );
    await query('UPDATE assets_marque SET media_id = $2, updated_at = NOW() WHERE cle = $1', [fichier.cle, insere.rows[0].id]);
    console.log('ok', fichier.cle, url);
  }
}

importer().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
