import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { validate, schemas } from '../middleware/validation.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Strict rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password changes per hour
  message: {
    success: false,
    error: 'Too many password change attempts, please try again later.'
  }
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
