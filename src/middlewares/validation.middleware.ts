import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error.middleware';
import {
  buildValidationSummaryMessage,
  formatJoiDetails,
} from '../utils/joi-validation-response';
import { logger } from '../utils/logger';

/**
 * Middleware de validation générique
 */
export const validate = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.body.code_postal && typeof req.body.code_postal === 'string' && req.body.code_postal.length > 10) {
        req.body.code_postal = req.body.code_postal.substring(0, 10);
      }

      const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = formatJoiDetails(error.details);
        logger.warn('[Validation] Échec body', req.method, req.originalUrl, errors.map((e) => e.field));

        const apiError = new Error(
          buildValidationSummaryMessage(errors, 'Validation impossible')
        ) as ApiError;
        apiError.statusCode = 400;
        apiError.code = 'VALIDATION_ERROR';
        apiError.errors = errors;
        return next(apiError);
      }

      if (value.en_stock !== undefined && value.stock === 0) {
        value.quantite_stock = value.en_stock;
        delete value.en_stock;
      } else if (value.stock !== undefined) {
        value.quantite_stock = value.stock;
        delete value.stock;
      }

      (req as any).validatedBody = value;

      if (req.body && Array.isArray(req.body.articles) && Array.isArray(value.articles)) {
        value.articles.forEach((validatedArticle: any, index: number) => {
          if (
            req.body.articles[index] &&
            req.body.articles[index].variants_selectionnes &&
            !validatedArticle.variants_selectionnes
          ) {
            validatedArticle.variants_selectionnes = JSON.parse(
              JSON.stringify(req.body.articles[index].variants_selectionnes)
            );
          }
        });
      }

      next();
    } catch (err) {
      logger.error('[Validation] Exception', err);
      next(err);
    }
  };
};

export const validateParams = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.params, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = formatJoiDetails(error.details);
        logger.warn('[Validation] Échec params', req.method, req.originalUrl, errors.map((e) => e.field));

        const apiError = new Error(
          buildValidationSummaryMessage(errors, 'Validation des paramètres impossible')
        ) as ApiError;
        apiError.statusCode = 400;
        apiError.code = 'VALIDATION_ERROR';
        apiError.errors = errors;
        return next(apiError);
      }

      (req as any).validatedParams = value;
      next();
    } catch (err) {
      logger.error('[Validation] Exception params', err);
      next(err);
    }
  };
};

export const validateQuery = (schema: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = schema.validate(req.query, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        const errors = formatJoiDetails(error.details);
        logger.warn('[Validation] Échec query', req.method, req.originalUrl, errors.map((e) => e.field));

        const apiError = new Error(
          buildValidationSummaryMessage(errors, 'Paramètres de requête invalides')
        ) as ApiError;
        apiError.statusCode = 400;
        apiError.code = 'VALIDATION_ERROR';
        apiError.errors = errors;
        return next(apiError);
      }

      (req as any).validatedQuery = value;
      next();
    } catch (err) {
      next(err);
    }
  };
};
