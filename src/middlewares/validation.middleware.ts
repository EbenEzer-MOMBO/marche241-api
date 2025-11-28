import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error.middleware';

/**
 * Middleware de validation générique
 * @param schema Le schéma de validation
 */
export const validate = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[ValidationMiddleware] ===== DÉBUT DE VALIDATION =====');
      console.log('[ValidationMiddleware] URL:', req.method, req.originalUrl);
      console.log('[ValidationMiddleware] Body reçu:', JSON.stringify(req.body, null, 2));
      console.log('[ValidationMiddleware] Schéma utilisé:', schema?._ids?._byKey || 'Schema info not available');
      
      // Tronquer le code_postal à 10 caractères AVANT la validation
      if (req.body.code_postal && typeof req.body.code_postal === 'string' && req.body.code_postal.length > 10) {
        const originalCodePostal = req.body.code_postal;
        req.body.code_postal = req.body.code_postal.substring(0, 10);
        console.log('[ValidationMiddleware] Troncature code_postal:', originalCodePostal, '→', req.body.code_postal);
      }
      
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        console.error('[ValidationMiddleware] ===== ERREUR DE VALIDATION =====');
        const errors = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type,
          context: detail.context
        }));
        
        console.error('[ValidationMiddleware] Détails des erreurs:', JSON.stringify(errors, null, 2));
        console.error('[ValidationMiddleware] Données reçues:', JSON.stringify(req.body, null, 2));
        console.error('[ValidationMiddleware] Erreur complète:', error.message);

        const apiError = new Error('Erreur de validation') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
      }

      console.log('[ValidationMiddleware] ===== VALIDATION RÉUSSIE =====');
      console.log('[ValidationMiddleware] Données validées:', JSON.stringify(value, null, 2));

      // Normaliser les noms de champs (en_stock → quantite_stock pour compatibilité)
      if (value.en_stock !== undefined && value.stock === 0) {
        value.quantite_stock = value.en_stock;
        delete value.en_stock;
        console.log('[ValidationMiddleware] Normalisation: en_stock → quantite_stock:', value.quantite_stock);
      } else if (value.stock !== undefined) {
        value.quantite_stock = value.stock;
        delete value.stock;
        console.log('[ValidationMiddleware] Normalisation: stock → quantite_stock:', value.quantite_stock);
      }

      // Stocker les données validées dans une propriété spécifique
      (req as any).validatedBody = value;
      
      // Préserver les champs complexes comme variants_selectionnes qui pourraient être perdus
      if (req.body && Array.isArray(req.body.articles) && Array.isArray(value.articles)) {
        // Pour chaque article validé
        value.articles.forEach((validatedArticle: any, index: number) => {
          // Si l'article original existe et a des variants_selectionnes mais que l'article validé n'en a pas
          if (req.body.articles[index] && 
              req.body.articles[index].variants_selectionnes && 
              !validatedArticle.variants_selectionnes) {
            // Copier les variants_selectionnes de l'article original
            validatedArticle.variants_selectionnes = JSON.parse(JSON.stringify(req.body.articles[index].variants_selectionnes));
            console.log('[ValidationMiddleware] Restauration des variants_selectionnes pour l\'article', index);
          }
        });
      }
      
      console.log('[ValidationMiddleware] Données finales après restauration:', JSON.stringify(value, null, 2));
      console.log('[ValidationMiddleware] ===== FIN DE VALIDATION =====');
      next();
    } catch (err) {
      console.error('[ValidationMiddleware] ===== EXCEPTION DANS VALIDATION =====');
      console.error('[ValidationMiddleware] Exception:', err);
      next(err);
    }
  };
};

/**
 * Middleware pour valider les paramètres d'URL
 * @param schema Le schéma de validation
 */
export const validateParams = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[ValidationMiddleware] ===== VALIDATION DES PARAMÈTRES =====');
      console.log('[ValidationMiddleware] URL:', req.method, req.originalUrl);
      console.log('[ValidationMiddleware] Paramètres reçus:', JSON.stringify(req.params, null, 2));
      
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        console.error('[ValidationMiddleware] ===== ERREUR DE VALIDATION DES PARAMÈTRES =====');
        const errors = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message,
          type: detail.type,
          context: detail.context
        }));
        
        console.error('[ValidationMiddleware] Erreurs:', JSON.stringify(errors, null, 2));
        console.error('[ValidationMiddleware] Paramètres reçus:', JSON.stringify(req.params, null, 2));

        const apiError = new Error('Erreur de validation des paramètres') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
      }

      // Stocker les paramètres validés dans une propriété spécifique
      (req as any).validatedParams = value;
      console.log('[ValidationMiddleware] Paramètres validés avec succès:', JSON.stringify(value, null, 2));
      next();
    } catch (err) {
      console.error('[ValidationMiddleware] ===== EXCEPTION DANS VALIDATION DES PARAMÈTRES =====');
      console.error('[ValidationMiddleware] Exception:', err);
      next(err);
    }
  };
};

/**
 * Middleware pour valider les paramètres de requête
 * @param schema Le schéma de validation
 */
export const validateQuery = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        console.error('[ValidationMiddleware] Erreurs de validation des paramètres de requête:', JSON.stringify(errors, null, 2));
        console.error('[ValidationMiddleware] Paramètres de requête reçus:', JSON.stringify(req.query, null, 2));

        const apiError = new Error('Erreur de validation des paramètres de requête') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
      }

      // Stocker les paramètres de requête validés dans une propriété spécifique
      (req as any).validatedQuery = value;
      console.log('[ValidationMiddleware] Paramètres de requête validés:', JSON.stringify(value, null, 2));
      next();
    } catch (err) {
      next(err);
    }
  };
};
