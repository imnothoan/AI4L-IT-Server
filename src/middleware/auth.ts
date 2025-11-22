import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from './errorHandler.js';
import type { User } from '../types/index.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  role: 'student' | 'instructor';
  iat: number;
  exp: number;
}

export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('No token provided', 401);
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    } catch (error) {
      throw new ApiError('Invalid or expired token', 401);
    }

    // Fetch user from Supabase
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      throw new ApiError('User not found', 404);
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// Role-based authorization middleware
export const requireRole = (...roles: Array<'student' | 'instructor'>) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new ApiError('Authentication required', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new ApiError('Insufficient permissions', 403);
    }

    next();
  };
};

// Optional auth middleware (doesn't fail if no token)
export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.JWT_SECRET) as JWTPayload;

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};
