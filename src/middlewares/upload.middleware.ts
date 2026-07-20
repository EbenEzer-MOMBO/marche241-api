import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { logger } from '../utils/logger';

// Configuration du stockage temporaire en mémoire
const storage = multer.memoryStorage();

// Configuration des limites et filtres
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Vérifier si le fichier est une image
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Le fichier doit être une image (JPEG, PNG, GIF, etc.)'));
  }
};

// Configuration de base pour multer pour un seul fichier
const uploadSingleConfig = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB par défaut
    files: 1 // Nombre maximum de fichiers
  },
  fileFilter: fileFilter
});

// Configuration de base pour multer pour plusieurs fichiers
const uploadMultipleConfig = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB par défaut
  },
  fileFilter: fileFilter
});

/**
 * Middleware pour l'upload d'un seul fichier image
 * @param fieldName Nom du champ de fichier dans le formulaire
 */
export const uploadImage = (fieldName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    logger.debug(`[UploadMiddleware] Début uploadImage - fieldName: ${fieldName}`);
    logger.debug('[UploadMiddleware] Content-Type:', req.headers['content-type']);
    
    const uploadSingle = uploadSingleConfig.single(fieldName);
    
    uploadSingle(req, res, (err: any) => {
      logger.debug('[UploadMiddleware] Résultat uploadSingle - Erreur:', err);
      
      if (err instanceof multer.MulterError) {
        logger.debug('[UploadMiddleware] Erreur Multer:', err.code, err.message);
        // Erreur Multer
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'La taille du fichier dépasse la limite autorisée (5MB)'
          });
        }
        return res.status(400).json({
          success: false,
          message: `Erreur d'upload: ${err.message}`
        });
      } else if (err) {
        // Autre erreur
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      // Si aucun fichier n'a été uploadé, continuer sans erreur
      if (!req.file) {
        return next();
      }
      
      next();
    });
  };
};

/**
 * Middleware pour l'upload de plusieurs fichiers image
 * @param fieldName Nom du champ de fichier dans le formulaire
 * @param maxCount Nombre maximum de fichiers (défaut: 5)
 */
export const uploadMultipleImages = (fieldName: string, maxCount: number = 5) => {
  return (req: Request, res: Response, next: NextFunction) => {
    logger.debug(`[UploadMiddleware] Début uploadMultipleImages - fieldName: ${fieldName}, maxCount: ${maxCount}`);
    logger.debug('[UploadMiddleware] Headers:', req.headers);
    logger.debug('[UploadMiddleware] Content-Type:', req.headers['content-type']);
    
    const uploadArray = uploadMultipleConfig.array(fieldName, maxCount);
    
    uploadArray(req, res, (err: any) => {
      logger.debug('[UploadMiddleware] Après uploadArray - Erreur:', err);
      logger.debug('[UploadMiddleware] Body:', req.body);
      if (err instanceof multer.MulterError) {
        // Erreur Multer
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'La taille d\'un fichier dépasse la limite autorisée (5MB)'
          });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: `Vous ne pouvez pas uploader plus de ${maxCount} images à la fois`
          });
        }
        return res.status(400).json({
          success: false,
          message: `Erreur d'upload: ${err.message}`
        });
      } else if (err) {
        // Autre erreur
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      // Si aucun fichier n'a été uploadé, continuer sans erreur
      if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
        logger.debug('[UploadMiddleware] Aucun fichier trouvé dans req.files');
        return next();
      }
      
      logger.debug('[UploadMiddleware] Fichiers trouvés:', 
        Array.isArray(req.files) 
          ? `${req.files.length} fichiers (tableau)` 
          : `${Object.keys(req.files).length} champs avec fichiers (objet)`);
      
      next();
    });
  };
};

/**
 * Middleware pour l'upload de fichiers avec des champs multiples
 * @param fields Configuration des champs (nom et nombre max)
 */
export const uploadFields = (fields: { name: string; maxCount: number }[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uploadWithFields = uploadMultipleConfig.fields(fields);
    
    uploadWithFields(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        // Erreur Multer
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'La taille d\'un fichier dépasse la limite autorisée (5MB)'
          });
        } else if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Nombre maximum de fichiers dépassé'
          });
        }
        return res.status(400).json({
          success: false,
          message: `Erreur d'upload: ${err.message}`
        });
      } else if (err) {
        // Autre erreur
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      
      next();
    });
  };
};
