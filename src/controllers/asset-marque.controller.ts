import { Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { AssetMarqueModel, type CleAsset } from '../models/asset-marque.model';
import { revaliderFront } from '../services/asset-marque-revalidation';
import { lireDimensionsRaster, lireViewBox, nettoyerSvg } from '../services/asset-marque.utils';
import { rafraichirLogoEmail } from '../services/email-templates/layout';
import { buildPublicUrl } from '../config/storage';
import { deleteFile, putObject } from '../utils/storage.utils';
import { TYPES_MEDIA } from '../utils/validation.schemas.asset-marque';
import { logger } from '../utils/logger';

const EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'image/svg+xml': '.svg',
};

/** Erreur de validation sur le champ `fichier`, au format VALIDATION_ERROR. */
function refuserFichier(res: Response, code: string, message: string): void {
  res.status(400).json({
    success: false,
    code: 'VALIDATION_ERROR',
    message,
    errors: [{ field: 'fichier', code, message }],
  });
}

export class AssetMarqueController {
  static async publics(_req: Request, res: Response): Promise<void> {
    const assets = await AssetMarqueModel.cartePublique();
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    res.json({ success: true, assets });
  }

  static async listerMedias(req: Request, res: Response): Promise<void> {
    const { recherche, type, page, limite } = (req as any).validatedQuery as {
      recherche?: string;
      type?: string;
      page: number;
      limite: number;
    };
    const resultat = await AssetMarqueModel.listerMedias(recherche || '', type || '', page, limite);
    res.json({ success: true, ...resultat, page, limite });
  }

  static async envoyerMedia(req: Request, res: Response): Promise<void> {
    const fichier = req.file;
    const { nom } = (req as any).validatedBody as { nom: string };
    if (!fichier) {
      refuserFichier(res, 'FIELD_REQUIRED', 'Le fichier est obligatoire');
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
        refuserFichier(res, 'SVG_REFUSE', 'Ce SVG contient du code exécutable ou des références interdites');
        return;
      }
      corps = Buffer.from(propre, 'utf8');
      mime = 'image/svg+xml';
      ({ largeur, hauteur } = lireViewBox(propre));
    } else {
      if (!(TYPES_MEDIA as readonly string[]).includes(mime)) {
        refuserFichier(res, 'TYPE_REFUSE', `Type non accepté : ${mime} (PNG, JPEG, WebP, ICO ou SVG)`);
        return;
      }
      ({ largeur, hauteur } = lireDimensionsRaster(corps, mime));
      if (largeur === null || hauteur === null) {
        refuserFichier(res, 'FICHIER_ILLISIBLE', 'Le contenu du fichier ne correspond pas à son type');
        return;
      }
    }

    const maintenant = new Date();
    const dossier = `medias/${maintenant.getUTCFullYear()}/${String(maintenant.getUTCMonth() + 1).padStart(2, '0')}`;
    const base = path.basename(fichier.originalname, path.extname(fichier.originalname)).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40) || 'media';
    const storagePath = `${dossier}/${base}-${crypto.randomBytes(4).toString('hex')}${EXTENSIONS[mime]}`;

    await putObject(storagePath, corps, mime);

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
    const { id } = (req as any).validatedParams as { id: number };
    const media = await AssetMarqueModel.trouverMedia(id);
    if (!media) {
      res.status(404).json({ success: false, message: 'Média introuvable' });
      return;
    }
    // La ligne d'abord : la FK RESTRICT protège un média affecté entre-temps, le fichier n'est supprimé qu'ensuite
    const supprime = await AssetMarqueModel.supprimerMedia(id);
    if (!supprime) {
      res.status(409).json({ success: false, code: 'MEDIA_UTILISE', message: 'Ce média est affecté à un emplacement' });
      return;
    }
    const resultat = await deleteFile(media.storage_path);
    if (!resultat.success) {
      logger.warn('Fichier R2 orphelin après suppression du média', media.storage_path, resultat.error);
    }
    res.json({ success: true });
  }

  static async listerEmplacements(_req: Request, res: Response): Promise<void> {
    const emplacements = await AssetMarqueModel.listerEmplacements();
    res.json({ success: true, emplacements });
  }

  static async affecter(req: Request, res: Response): Promise<void> {
    const { cle } = (req as any).validatedParams as { cle: CleAsset };
    const { media_id: mediaId } = (req as any).validatedBody as { media_id: number | null };
    if (mediaId !== null) {
      const media = await AssetMarqueModel.trouverMedia(mediaId);
      if (!media) {
        res.status(404).json({ success: false, message: 'Média introuvable' });
        return;
      }
      const emplacement = await AssetMarqueModel.trouverEmplacement(cle);
      const formats = (emplacement?.formats || '').split(',');
      if (!formats.includes(media.mime_type)) {
        res.status(400).json({
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Ce type de fichier n\'est pas accepté pour cet emplacement',
          errors: [{ field: 'media_id', code: 'FORMAT_REFUSE', message: `Formats acceptés : ${formats.join(', ')}` }],
        });
        return;
      }
    }
    await AssetMarqueModel.affecter(cle, mediaId);
    if (cle === 'logo_email') {
      rafraichirLogoEmail(true);
    }
    void revaliderFront();
    res.json({ success: true });
  }
}
