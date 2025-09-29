import { supabaseAdmin } from '../config/supabase';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request } from 'express';
import multer from 'multer';

// Interface pour les options d'upload
export interface UploadOptions {
  // Dossier de destination dans le bucket (ex: 'produits', 'boutiques', etc.)
  folder: string;
  // Nom de fichier personnalisé (optionnel)
  fileName?: string;
  // Taille maximale du fichier en octets (par défaut: 5MB)
  maxSize?: number;
  // Types MIME autorisés
  allowedMimeTypes?: string[];
}

// Interface pour le résultat d'upload
export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
  fileSize?: number;
  mimeType?: string;
}

/**
 * Génère un nom de fichier unique basé sur le nom original et un timestamp
 * @param originalName Nom original du fichier
 * @returns Nom de fichier unique
 */
const generateUniqueFileName = (originalName: string): string => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(4).toString('hex');
  
  return `${baseName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}_${randomString}${ext}`;
};

/**
 * Vérifie si le type MIME est autorisé
 * @param mimeType Type MIME du fichier
 * @param allowedTypes Types MIME autorisés
 * @returns Boolean indiquant si le type est autorisé
 */
const isMimeTypeAllowed = (mimeType: string, allowedTypes?: string[]): boolean => {
  if (!allowedTypes || allowedTypes.length === 0) {
    // Par défaut, autoriser uniquement les images
    return mimeType.startsWith('image/');
  }
  
  return allowedTypes.includes(mimeType);
};

/**
 * Upload un fichier vers Supabase Storage
 * @param filePath Chemin local du fichier à uploader
 * @param options Options d'upload
 * @returns Résultat de l'upload
 */
export const uploadFile = async (filePath: string, options: UploadOptions): Promise<UploadResult> => {
  try {
    // Vérifier que le fichier existe
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Le fichier n\'existe pas' };
    }
    
    // Obtenir les informations sur le fichier
    const fileStats = fs.statSync(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    const fileSize = fileStats.size;
    
    // Vérifier la taille du fichier
    const maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB par défaut
    if (fileSize > maxSize) {
      return { 
        success: false, 
        error: `La taille du fichier dépasse la limite autorisée (${Math.round(maxSize / 1024 / 1024)}MB)`,
        fileSize
      };
    }
    
    // Déterminer le type MIME
    const fileType = require('file-type');
    const fileInfo = await fileType.fromBuffer(fileBuffer);
    const mimeType = fileInfo?.mime || 'application/octet-stream';
    
    // Vérifier le type MIME
    if (!isMimeTypeAllowed(mimeType, options.allowedMimeTypes)) {
      return { 
        success: false, 
        error: `Type de fichier non autorisé: ${mimeType}`,
        mimeType
      };
    }
    
    // Générer un nom de fichier unique si non spécifié
    const fileName = options.fileName || generateUniqueFileName(path.basename(filePath));
    
    // Construire le chemin de stockage
    const storagePath = `${options.folder}/${fileName}`;
    
    // Récupérer le nom du bucket depuis les variables d'environnement
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'marche241-uploads';
    
    // Upload le fichier vers Supabase Storage
    const { data, error } = await supabaseAdmin
      .storage
      .from(bucketName)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });
      
    if (error) {
      return { 
        success: false, 
        error: error.message
      };
    }
    
    // Générer l'URL publique
    const { data: urlData } = supabaseAdmin
      .storage
      .from(bucketName)
      .getPublicUrl(storagePath);
      
    return {
      success: true,
      url: urlData.publicUrl,
      path: storagePath,
      fileSize,
      mimeType
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    };
  }
};

/**
 * Upload un fichier depuis une requête multipart/form-data
 * @param req Requête Express avec fichiers
 * @param fieldName Nom du champ de fichier dans le formulaire
 * @param options Options d'upload
 * @returns Résultat de l'upload
 */
export const uploadFromRequest = async (
  req: Request & { files?: { [fieldname: string]: Express.Multer.File[] } | Express.Multer.File[] }, 
  fieldName: string, 
  options: UploadOptions
): Promise<UploadResult> => {
  try {
    // Vérifier que le fichier existe dans la requête
    if (!req.files) {
      return { success: false, error: `Aucun fichier trouvé pour le champ ${fieldName}` };
    }
    
    let file: Express.Multer.File | undefined;
    
    // Vérifier si req.files est un tableau ou un objet
    if (Array.isArray(req.files)) {
      // Si c'est un tableau, chercher le fichier avec le bon fieldname
      file = req.files.find(f => f.fieldname === fieldName);
    } else {
      // Si c'est un objet, accéder au tableau correspondant à la clé fieldName
      const files = req.files[fieldName];
      if (files && files.length > 0) {
        file = files[0];
      }
    }
    
    if (!file) {
      return { success: false, error: `Aucun fichier trouvé pour le champ ${fieldName}` };
    }
    
    // Vérifier la taille du fichier
    const maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB par défaut
    if (file.size > maxSize) {
      return { 
        success: false, 
        error: `La taille du fichier dépasse la limite autorisée (${Math.round(maxSize / 1024 / 1024)}MB)`,
        fileSize: file.size
      };
    }
    
    // Vérifier le type MIME
    if (!isMimeTypeAllowed(file.mimetype, options.allowedMimeTypes)) {
      return { 
        success: false, 
        error: `Type de fichier non autorisé: ${file.mimetype}`,
        mimeType: file.mimetype
      };
    }
    
    // Générer un nom de fichier unique si non spécifié
    const fileName = options.fileName || generateUniqueFileName(file.originalname);
    
    // Construire le chemin de stockage
    const storagePath = `${options.folder}/${fileName}`;
    
    // Récupérer le nom du bucket depuis les variables d'environnement
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'marche241-uploads';
    
    // Upload le fichier vers Supabase Storage
    const { data, error } = await supabaseAdmin
      .storage
      .from(bucketName)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });
      
    if (error) {
      return { 
        success: false, 
        error: error.message
      };
    }
    
    // Générer l'URL publique
    const { data: urlData } = supabaseAdmin
      .storage
      .from(bucketName)
      .getPublicUrl(storagePath);
      
    return {
      success: true,
      url: urlData.publicUrl,
      path: storagePath,
      fileSize: file.size,
      mimeType: file.mimetype
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    };
  }
};

/**
 * Supprime un fichier de Supabase Storage
 * @param filePath Chemin du fichier dans le bucket
 * @returns Résultat de la suppression
 */
export const deleteFile = async (filePath: string): Promise<{success: boolean, error?: string}> => {
  try {
    // Récupérer le nom du bucket depuis les variables d'environnement
    const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'marche241-uploads';
    
    const { data, error } = await supabaseAdmin
      .storage
      .from(bucketName)
      .remove([filePath]);
      
    if (error) {
      return { 
        success: false, 
        error: error.message
      };
    }
    
    return {
      success: true
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur inconnue est survenue'
    };
  }
};
