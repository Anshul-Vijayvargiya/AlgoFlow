import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formatted = error.issues.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        res.status(400).json({ error: 'Validation failed', details: formatted });
        return;
      }
      next(error);
    }
  };
}
