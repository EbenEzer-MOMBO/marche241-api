import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { AssetMarqueModel, CLES_ASSETS } from '../models/asset-marque.model';
import { revaliderFront } from '../services/asset-marque-revalidation';
import { lireDimensionsRaster, lireViewBox, nettoyerSvg } from '../services/asset-marque.utils';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { buildPublicUrl, s3Client, storageBucket } from '../config/storage';
import { logger } from '../utils/logger';

const MIME_AUTORISES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
]);

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/svg+xml': '.svg',
};

export class AssetMarqueController {
  static async publics(_req: Request, res: Response): Promise<void> {
    const assets = await AssetMarqueModel.cartePublique();
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.json({ success: true, assets });
  }

  static async listerMedias(req: Request, res: Response): Promise<void> {
    const recherche = String(req.query.recherche || '').slice(0, 150);
    const type = String(req.query.type || '');
    const page = Math.max(1, Number(req.query.page) || 1);
    const resultat = await AssetMarqueModel.listerMedias(recherche, type, page, 24);
    res.json({ success: true, ...resultat, page });
  }

  static async envoyerMedia(req: Request, res: Response): Promise<void> {
    const fichier = req.file;
    const nom = String(req.body?.nom || '').trim();
    if (!fichier || !nom) {
      res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Le fichier et le nom sont obligatoires' });
      return;
    }
    if (nom.length > 150) {
      res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Le nom dépasse 150 caractères' });
      return;
    }

    let mime = fichier.mimetype === 'image/jpg' ? 'image/jpeg' : fichier.mimetype;
    let corps = fichier.buffer;
    let largeur: number | null = null;
    let hauteur: number | null = null;

    const sembleSvg = mime === 'image/svg+xml' || corps.subarray(0, 200).toString('utf8').includes('<svg');
    if (sembleSvg) {
      const propre = nettoyerSvg(corps.toString('utf8'));
      if (!propre) {
        res.status(400).json({ success: false, message: 'SVG invalide ou dangereux' });
        return;
      }
      corps = Buffer.from(propre, 'utf8');
      mime = 'image/svg+xml';
      const dimensions = lireViewBox(propre);
      largeur = dimensions.largeur;
      hauteur = dimensions.hauteur;
    } else if (!MIME_AUTORISES.has(mime)) {
      res.status(400).json({ success: false, message: `Type non accepté : ${mime}` });
      return;
    } else {
      const dimensions = lireDimensionsRaster(corps, mime);
      largeur = dimensions.largeur;
      hauteur = dimensions.hauteur;
    }

    const maintenant = new Date();
    const dossier = `medias/${maintenant.getUTCFullYear()}/${String(maintenant.getUTCMonth() + 1).padStart(2, '0')}`;
    const base = path.basename(fichier.originalname, path.extname(fichier.originalname)).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'media';
    const storagePath = `${dossier}/${base}-${crypto.randomBytes(4).toString('hex')}${EXTENSIONS[mime]}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: storageBucket,
      Key: storagePath,
      Body: corps,
      ContentType: mime,
    }));

    const media = await AssetMarqueModel.creerMedia({
      nom,
      url: buildPublicUrl(storagePath),
      storage_path: storagePath,
      mime_type: mime,
      taille_octets: corps.length,
      largeur,
      hauteur,
      cree_par: null,
    });
    res.status(201).json({ success: true, media });
  }

  static async supprimerMedia(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    const media = await AssetMarqueModel.trouverMedia(id);
    if (!media) {
      res.status(404).json({ success: false, message: 'Média introuvable' });
      return;
    }
    if (await AssetMarqueModel.estUtilise(id)) {
      res.status(409).json({ success: false, code: 'MEDIA_UTILISE', message: 'Ce média est affecté à un emplacement' });
      return;
    }
    const { deleteFile } = await import('../utils/storage.utils');
    await deleteFile(media.storage_path);
    await AssetMarqueModel.supprimerMedia(id);
    res.json({ success: true });
  }

  static async listerEmplacements(_req: Request, res: Response): Promise<void> {
    const emplacements = await AssetMarqueModel.listerEmplacements();
    res.json({ success: true, emplacements });
  }

  static async affecter(req: Request, res: Response): Promise<void> {
    const cle = String(req.params.cle);
    if (!CLES_ASSETS.includes(cle as (typeof CLES_ASSETS)[number])) {
      res.status(404).json({ success: false, message: 'Emplacement inconnu' });
      return;
    }
    const mediaId = req.body.media_id as number | null;
    if (mediaId !== null) {
      const media = await AssetMarqueModel.trouverMedia(mediaId);
      if (!media) {
        res.status(404).json({ success: false, message: 'Média introuvable' });
        return;
      }
      const emplacement = await AssetMarqueModel.trouverEmplacement(cle);
      const formats = (emplacement?.formats || '').split(',');
      if (!formats.includes(media.mime_type)) {
        res.status(400).json({ success: false, message: 'Ce type de fichier n\'est pas accepté pour cet emplacement' });
        return;
      }
    }
    await AssetMarqueModel.affecter(cle, mediaId);
    void revaliderFront().catch((error) => logger.warn('revalidation', error));
    res.json({ success: true });
  }
}
