import { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  /** Code machine pour le client (ex. VALIDATION_ERROR) */
  code?: string;
  errors?: any[];
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;

  const payload: Record<string, unknown> = {
    success: false,
    message: err.message || 'Erreur serveur',
  };

  if (process.env.NODE_ENV === 'development') {
    payload.stack = err.stack;
  }

  if (err.errors?.length) {
    payload.code = err.code ?? 'VALIDATION_ERROR';
    payload.errors = err.errors;
  } else if (err.code) {
    payload.code = err.code;
  }

  res.status(statusCode).json(payload);
};

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Route non trouvée - ${req.originalUrl}`) as ApiError;
  error.statusCode = 404;
  next(error);
};
