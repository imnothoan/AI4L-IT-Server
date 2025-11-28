import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { validate, schemas } from '../middleware/validation.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Strict rate limiting for authentication endpoints
// In development: more lenient for testing
// In production: strict limits
const isDevelopment = process.env.NODE_ENV !== 'production';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 1000 : 5, // Dev: 1000/window, Prod: 5/window
  message: 'Too many login attempts from this IP, please try again after 15 minutes'
});

const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 20 : 3, // Dev: 20/hour, Prod: 3/hour
  message: 'Too many password change attempts, please try again after an hour'
});

// Public routes with rate limiting
router.post('/register', authLimiter, validate(schemas.register), authController.register);
router.post('/login', authLimiter, validate(schemas.login), authController.login);
router.post('/refresh', authLimiter, authController.refreshToken);

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);
router.get('/me', authMiddleware, authController.getProfile); // Alias for /profile
router.put('/profile', authMiddleware, authController.updateProfile);
router.put('/change-password', authMiddleware, passwordChangeLimiter, authController.changePassword);
router.post('/logout', authMiddleware, authController.logout);

export default router;
