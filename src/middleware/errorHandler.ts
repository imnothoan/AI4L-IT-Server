import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types/index.js';

// Custom error class
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error handler middleware
export const errorHandler = (
  err: Error | ApiError,
  _req: Request,
  res: Response<ApiResponse>,
  _next: NextFunction
): void => {
  console.error('Error:', err);

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
    return;
  }

  // Handle Supabase errors
  if (err.message.includes('JWT')) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response<ApiResponse>): void => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`
  });
};

// Async handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
