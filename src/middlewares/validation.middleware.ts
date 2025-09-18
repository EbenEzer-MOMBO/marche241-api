import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error.middleware';

/**
 * Middleware de validation générique
 * @param schema Le schéma de validation
 */
export const validate = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        console.error('[ValidationMiddleware] Erreurs de validation du corps:', JSON.stringify(errors, null, 2));
        console.error('[ValidationMiddleware] Données reçues:', JSON.stringify(req.body, null, 2));

        const apiError = new Error('Erreur de validation') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
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
      
      console.log('[ValidationMiddleware] Données validées après restauration:', JSON.stringify(value, null, 2));
      next();
    } catch (err) {
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
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = error.details.map((detail: any) => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        
        console.error('[ValidationMiddleware] Erreurs de validation des paramètres:', JSON.stringify(errors, null, 2));
        console.error('[ValidationMiddleware] Paramètres reçus:', JSON.stringify(req.params, null, 2));

        const apiError = new Error('Erreur de validation des paramètres') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
      }

      // Stocker les paramètres validés dans une propriété spécifique
      (req as any).validatedParams = value;
      console.log('[ValidationMiddleware] Paramètres validés:', JSON.stringify(value, null, 2));
      next();
    } catch (err) {
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
