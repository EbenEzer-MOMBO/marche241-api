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

        const apiError = new Error('Erreur de validation') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
      }

      // Remplacer le corps de la requête par les données validées
      req.body = value;
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

        const apiError = new Error('Erreur de validation des paramètres') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
      }

      // Remplacer les paramètres de la requête par les données validées
      req.params = value;
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

        const apiError = new Error('Erreur de validation des paramètres de requête') as ApiError;
        apiError.statusCode = 400;
        apiError.errors = errors;

        return next(apiError);
      }

      // Au lieu de remplacer req.query, nous stockons les valeurs validées dans une propriété personnalisée
      (req as any).validatedQuery = value;
      next();
    } catch (err) {
      next(err);
    }
  };
};
