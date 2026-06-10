import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

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
  const acceptsHtml = req.headers.accept?.includes('text/html');
  const isApiRoute = req.originalUrl.startsWith('/api/');

  if (acceptsHtml && !isApiRoute) {
    const notFoundPage = path.join(__dirname, '..', 'public', '404.html');
    if (fs.existsSync(notFoundPage)) {
      return res.status(404).sendFile(notFoundPage);
    }
  }

  const error = new Error(`Route non trouvée - ${req.originalUrl}`) as ApiError;
  error.statusCode = 404;
  next(error);
};
