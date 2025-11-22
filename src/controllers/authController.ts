import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';
import { config } from '../config/index.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import type { RegisterRequest, LoginRequest, AuthResponse, User } from '../types/index.js';

/**
 * Register a new user
 */
export const register = asyncHandler(async (req: Request, res: Response<AuthResponse>) => {
  const { email, password, name, role }: RegisterRequest = req.body;

  // Check if user already exists
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (existingUser) {
    throw new ApiError('User with this email already exists', 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user in Supabase
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .insert({
      email,
      password_hash: passwordHash,
      name,
      role
    })
    .select()
    .single();

  if (error || !user) {
    console.error('Error creating user in Supabase:', error);
    throw new ApiError('Failed to create user', 500);
  }

  // Generate tokens
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Remove password hash from response
  const { password_hash, ...userWithoutPassword } = user;

  res.status(201).json({
    success: true,
    data: {
      user: userWithoutPassword as User,
      token,
      refreshToken,
      expiresIn: parseExpiry(config.JWT_EXPIRES_IN)
    }
  });
});

/**
 * Login user
 */
export const login = asyncHandler(async (req: Request, res: Response<AuthResponse>) => {
  const { email, password }: LoginRequest = req.body;

  // Find user
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) {
    throw new ApiError('Invalid email or password', 401);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    throw new ApiError('Invalid email or password', 401);
  }

  // Generate tokens
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Remove password hash from response
  const { password_hash, ...userWithoutPassword } = user;

  res.json({
    success: true,
    data: {
      user: userWithoutPassword as User,
      token,
      refreshToken,
      expiresIn: parseExpiry(config.JWT_EXPIRES_IN)
    }
  });
});

/**
 * Refresh access token
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response<AuthResponse>) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new ApiError('Refresh token is required', 400);
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as { userId: string };

    // Get user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      throw new ApiError('User not found', 404);
    }

    // Generate new tokens
    const newToken = generateToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword as User,
        token: newToken,
        refreshToken: newRefreshToken,
        expiresIn: parseExpiry(config.JWT_EXPIRES_IN)
      }
    });
  } catch (error) {
    throw new ApiError('Invalid or expired refresh token', 401);
  }
});

/**
 * Get current user profile
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, avatar, bio, created_at, updated_at')
    .eq('id', req.user.id)
    .single();

  if (error || !user) {
    throw new ApiError('User not found', 404);
  }

  res.json({
    success: true,
    data: user
  });
});

/**
 * Update user profile
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const { name, avatar, bio } = req.body;

  const updates: any = {
    updated_at: new Date().toISOString()
  };

  if (name) updates.name = name;
  if (avatar !== undefined) updates.avatar = avatar;
  if (bio !== undefined) updates.bio = bio;

  const { data: user, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', req.user.id)
    .select('id, email, name, role, avatar, bio, created_at, updated_at')
    .single();

  if (error || !user) {
    throw new ApiError('Failed to update profile', 500);
  }

  res.json({
    success: true,
    data: user
  });
});

/**
 * Change password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('User not authenticated', 401);
  }

  const { currentPassword, newPassword } = req.body;

  // Get current user with password hash
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('password_hash')
    .eq('id', req.user.id)
    .single();

  if (error || !user) {
    throw new ApiError('User not found', 404);
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

  if (!isPasswordValid) {
    throw new ApiError('Current password is incorrect', 401);
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  // Update password
  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update({
      password_hash: newPasswordHash,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.user.id);

  if (updateError) {
    throw new ApiError('Failed to change password', 500);
  }

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * Logout user
 * In a stateless JWT system, logout is handled client-side by removing tokens
 * This endpoint is provided for consistency with client expectations
 */
export const logout = asyncHandler(async (_req: Request, res: Response) => {
  // In a stateless JWT system, we don't track tokens server-side
  // The client should remove the tokens from localStorage
  // This endpoint can be extended to maintain a token blacklist if needed

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * Helper: Generate JWT access token
 */
function generateToken(user: any): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'] }
  );
}

/**
 * Helper: Generate JWT refresh token
 */
function generateRefreshToken(user: any): string {
  return jwt.sign(
    {
      userId: user.id
    },
    config.JWT_REFRESH_SECRET,
    { expiresIn: config.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] }
  );
}

/**
 * Helper: Parse expiry string to seconds
 */
function parseExpiry(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1), 10);

  switch (unit) {
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    case 'm':
      return value * 60;
    case 's':
      return value;
    default:
      return 3600; // Default 1 hour
  }
}
