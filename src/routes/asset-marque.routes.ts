import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';
import { AssetMarqueController } from '../controllers/asset-marque.controller';
import { authOrServiceKey } from '../middlewares/service-auth.middleware';

const router = Router();

const exigerCleService = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.isAdmin || req.vendeur) {
    res.status(403).json({ success: false, message: 'Accès réservé au back-office Marché 241' });
    return;
  }
  next();
};

const admin = [authOrServiceKey, exigerCleService];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

router.get('/', AssetMarqueController.publics);
router.get('/admin/medias', ...admin, AssetMarqueController.listerMedias);
router.post('/admin/medias', ...admin, upload.single('fichier'), AssetMarqueController.envoyerMedia);
router.delete('/admin/medias/:id', ...admin, AssetMarqueController.supprimerMedia);
router.get('/admin/emplacements', ...admin, AssetMarqueController.listerEmplacements);
router.put('/admin/emplacements/:cle', ...admin, AssetMarqueController.affecter);

export default router;
