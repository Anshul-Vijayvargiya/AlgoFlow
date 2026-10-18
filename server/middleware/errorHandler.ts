import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  code?: number | string;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Support both statusCode (standard) and status (body-parser / http-errors)
  const statusCode = err.statusCode || err.status || 500;

  // Mask internal 500-level errors everywhere except local development, so database names, file system paths and
  // driver details never leak from staging or production (unknown modes fail closed).
  const isInternal = statusCode >= 500;
  const isDevelopment = env.NODE_ENV === 'development';
  const message = (isInternal && !isDevelopment)
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  // Diagnostic logging server-side only: never log bodies, cookies, or secrets. Stack traces are logged, never sent.
  console.error(`❌ [${req.method} ${req.url}] Error ${statusCode}:`, err.message);
  if (isDevelopment && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({ error: message });
}

