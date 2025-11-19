import { Request, Response } from 'express';
import { uploadFromRequest } from '../utils/storage.utils';

export class UploadController {
  /**
   * Upload une image vers Supabase Storage
   * @param req Requête Express
   * @param res Réponse Express
   */
  static async uploadImage(req: Request & { file?: Express.Multer.File }, res: Response) {
    try {
      console.log('[UploadController] uploadImage - req.file:', req.file);
      console.log('[UploadController] uploadImage - req.files:', req.files);
      
      // Vérifier si un fichier est présent dans la requête
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Aucun fichier n\'a été fourni'
        });
      }

      // Récupérer le dossier de destination depuis les paramètres de requête
      const folder = req.query.folder as string || 'general';
      
      // Convertir req.file en req.files pour que uploadFromRequest fonctionne
      const modifiedReq = {
        ...req,
        files: { [req.file.fieldname]: [req.file] }
      } as Request & { files: { [fieldname: string]: Express.Multer.File[] } };
      
      console.log('[UploadController] uploadImage - modifiedReq.files:', modifiedReq.files);
      
      // Uploader le fichier vers Supabase Storage
      const result = await uploadFromRequest(modifiedReq, req.file.fieldname, {
        folder: folder,
        maxSize: 5 * 1024 * 1024, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      });
      
      console.log('[UploadController] uploadImage - result:', result);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }
      
      // Retourner l'URL de l'image uploadée
      return res.status(200).json({
        success: true,
        message: 'Image uploadée avec succès',
        donnees: {
          url: result.url,
          path: result.path,
          taille: result.fileSize,
          type: result.mimeType
        }
      });
      
    } catch (error) {
      console.error('Erreur lors de l\'upload d\'image:', error);
      return res.status(500).json({
        success: false,
        message: 'Une erreur est survenue lors de l\'upload de l\'image'
      });
    }
  }
  
  /**
   * Upload plusieurs images vers Supabase Storage
   * @param req Requête Express
   * @param res Réponse Express
   */
  static async uploadMultipleImages(req: Request & { files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[] }, res: Response) {
    try {
      console.log('[UploadController] uploadMultipleImages - req.files:', req.files);
      console.log('[UploadController] uploadMultipleImages - req.body:', req.body);
      
      // Vérifier si des fichiers sont présents dans la requête
      if (!req.files || (Array.isArray(req.files) && req.files.length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Aucun fichier n\'a été fourni'
        });
      }
      
      // Récupérer le dossier de destination depuis les paramètres de requête
      const folder = req.query.folder as string || 'general';
      
      // Tableau pour stocker les résultats d'upload
      const uploadResults: any[] = [];
      
      // Uploader chaque fichier vers Supabase Storage
      let files: Express.Multer.File[] = [];
      
      if (Array.isArray(req.files)) {
        files = req.files;
      } else {
        // Convertir l'objet de tableaux en un seul tableau plat
        Object.values(req.files).forEach(fileArray => {
          if (Array.isArray(fileArray)) {
            files = files.concat(fileArray);
          }
        });
      }
      
      for (const file of files) {
        // Créer une requête simulée avec un seul fichier
        const fileReq = {
          ...req,
          file: file,
          files: { [file.fieldname]: [file] }
        } as Request & { file: Express.Multer.File, files: { [fieldname: string]: Express.Multer.File[] } };
        
        // Uploader le fichier
        const result = await uploadFromRequest(fileReq, file.fieldname, {
          folder: folder,
          maxSize: 5 * 1024 * 1024, // 5MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        });
        
        uploadResults.push({
          originalname: file.originalname,
          ...result
        });
      }
      
      // Vérifier si tous les uploads ont réussi
      const allSuccessful = uploadResults.every(result => result.success);
      
      if (!allSuccessful) {
        return res.status(400).json({
          success: false,
          message: 'Certains fichiers n\'ont pas pu être uploadés',
          donnees: uploadResults
        });
      }
      
      // Retourner les URLs des images uploadées
      return res.status(200).json({
        success: true,
        message: 'Images uploadées avec succès',
        donnees: uploadResults.map(result => ({
          url: result.url,
          path: result.path,
          taille: result.fileSize,
          type: result.mimeType,
          nom_original: result.originalname
        }))
      });
      
    } catch (error) {
      console.error('Erreur lors de l\'upload d\'images:', error);
      return res.status(500).json({
        success: false,
        message: 'Une erreur est survenue lors de l\'upload des images'
      });
    }
  }
  
  /**
   * Supprime une image de Supabase Storage
   * @param req Requête Express
   * @param res Réponse Express
   */
  static async deleteImage(req: Request, res: Response) {
    try {
      // Récupérer le chemin de l'image depuis le corps de la requête
      const { path } = req.body;
      
      if (!path) {
        return res.status(400).json({
          success: false,
          message: 'Le chemin de l\'image est requis'
        });
      }
      
      // Supprimer l'image de Supabase Storage
      const { deleteFile } = require('../utils/storage.utils');
      const result = await deleteFile(path);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error
        });
      }
      
      // Retourner la confirmation de suppression
      return res.status(200).json({
        success: true,
        message: 'Image supprimée avec succès'
      });
      
    } catch (error) {
      console.error('Erreur lors de la suppression d\'image:', error);
      return res.status(500).json({
        success: false,
        message: 'Une erreur est survenue lors de la suppression de l\'image'
      });
    }
  }
}
