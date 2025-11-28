import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';
import { config } from '../config/index.js';
import { ApiError, asyncHandler } from '../middleware/errorHandler.js';
import type { RegisterRequest, LoginRequest, AuthResponse, User } from '../types/index.js';
import { transformSupabaseResponse } from '../utils/caseTransform.js';

// Account lockout configuration
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;
const loginAttempts = new Map<string, { count: number; lockUntil?: number }>();

/**
 * Check if account is locked
 */
function isAccountLocked(email: string): { locked: boolean; remainingMinutes?: number } {
  const attempts = loginAttempts.get(email);
  if (!attempts?.lockUntil) return { locked: false };

  const now = Date.now();
  if (now < attempts.lockUntil) {
    const remaining = Math.ceil((attempts.lockUntil - now) / 60000);
    return { locked: true, remainingMinutes: remaining };
  }

  // Lockout expired, reset
  loginAttempts.delete(email);
  return { locked: false };
}

/**
 * Record failed login attempt
 */
function recordFailedAttempt(email: string): number {
  const attempts = loginAttempts.get(email) || { count: 0 };
  attempts.count++;

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockUntil = Date.now() + (LOCKOUT_DURATION_MINUTES * 60 * 1000);
  }

  loginAttempts.set(email, attempts);
  return MAX_LOGIN_ATTEMPTS - attempts.count;
}

/**
 * Reset login attempts on successful login
 */
function resetLoginAttempts(email: string): void {
  loginAttempts.delete(email);
}

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
    throw new ApiError('EMAIL_ALREADY_EXISTS', 409, {
      message: 'Email này đã được sử dụng',
      suggestion: 'Bạn có muốn đăng nhập?',
      actions: [
        { type: 'LOGIN', label: 'Đăng nhập' },
        { type: 'FORGOT_PASSWORD', label: 'Quên mật khẩu?' }
      ]
    });
  }

  // Optional: Log password strength warning (không chặn đăng ký)
  // Người dùng có thể đặt BẤT KỲ mật khẩu nào!
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=\-{}[\]:;"'<>,.~`|\\\/])[A-Za-z\d@$!%*?&#^()_+=\-{}[\]:;"'<>,.~`|\\\/]{8,}$/;

  if (!passwordRegex.test(password)) {
    console.log(`⚠️  Weak password detected for ${email} - but allowing registration`);
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
      role,
      // email_verified: false, // Column missing in DB
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error || !user) {
    console.error('Error creating user in Supabase:', error);
    throw new ApiError('Failed to create user', 500);
  }

  // Transform to camelCase
  const transformedUser = transformSupabaseResponse<User>(user);

  // Generate tokens
  const token = generateToken(transformedUser);
  const refreshToken = generateRefreshToken(transformedUser);

  // Remove password hash from response
  const { passwordHash: _, ...userWithoutPassword } = transformedUser as any;

  res.status(201).json({
    success: true,
    data: {
      user: userWithoutPassword as User,
      token,
      refreshToken,
      expiresIn: parseExpiry(config.JWT_EXPIRES_IN)
    },
    message: 'Đăng ký thành công!'
  });
});

/**
 * Login user
 */
export const login = asyncHandler(async (req: Request, res: Response<AuthResponse>) => {
  const { email, password }: LoginRequest = req.body;

  // Check if account is locked
  const lockStatus = isAccountLocked(email);
  if (lockStatus.locked) {
    throw new ApiError('ACCOUNT_LOCKED', 429, {
      message: `Tài khoản bị khóa do đăng nhập sai quá nhiều`,
      remainingMinutes: lockStatus.remainingMinutes,
      suggestion: 'Vui lòng thử lại sau hoặc đặt lại mật khẩu'
    });
  }

  // Find user
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user) {
    throw new ApiError('USER_NOT_FOUND', 401, {
      message: 'Không tìm thấy tài khoản với email này',
      suggestion: 'Bạn có muốn tạo tài khoản mới?'
    });
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    const attemptsRemaining = recordFailedAttempt(email);

    throw new ApiError('INVALID_PASSWORD', 401, {
      message: `Mật khẩu không đúng. Còn ${attemptsRemaining} lần thử`,
      attemptsRemaining
    });
  }

  // Reset failed attempts on successful login
  resetLoginAttempts(email);

  // Transform to camelCase
  const transformedUser = transformSupabaseResponse<User>(user);

  // Generate tokens
  const token = generateToken(transformedUser);
  const refreshToken = generateRefreshToken(transformedUser);

  // Remove password hash from response
  const { passwordHash: _, ...userWithoutPassword } = transformedUser as any;

  res.json({
    success: true,
    data: {
      user: userWithoutPassword as User,
      token,
      refreshToken,
      expiresIn: parseExpiry(config.JWT_EXPIRES_IN)
    },
    message: 'Đăng nhập thành công!'
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
    const decoded = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as { userId: string };

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      throw new ApiError('User not found', 404);
    }

    const transformedUser = transformSupabaseResponse<User>(user);
    const newToken = generateToken(transformedUser);
    const newRefreshToken = generateRefreshToken(transformedUser);
    const { passwordHash: _, ...userWithoutPassword } = transformedUser as any;

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
    throw new ApiError('Invalid refresh token', 401);
  }
});

/**
 * Get current user profile
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('Not authenticated', 401);
  }

  res.json({
    success: true,
    data: req.user
  });
});

/**
 * Get user profile (alias for getCurrentUser)
 */
export const getProfile = getCurrentUser;

/**
 * Update user profile
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('Not authenticated', 401);
  }

  const { name, email } = req.body;
  const updates: any = { updated_at: new Date().toISOString() };

  if (name) updates.name = name;
  if (email && email !== req.user.email) {
    // Check if new email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw new ApiError('Email already in use', 409);
    }
    updates.email = email;
    // updates.email_verified = false; // Need to verify new email
  }

  const { data: updatedUser, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .single();

  if (error || !updatedUser) {
    throw new ApiError('Failed to update profile', 500);
  }

  const transformedUser = transformSupabaseResponse<User>(updatedUser);
  const { passwordHash: _, ...userWithoutPassword } = transformedUser as any;

  res.json({
    success: true,
    data: userWithoutPassword,
    message: 'Profile updated successfully'
  });
});

/**
 * Change password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ApiError('Not authenticated', 401);
  }

  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('password_hash')
    .eq('id', req.user.id)
    .single();

  if (!user) {
    throw new ApiError('User not found', 404);
  }

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isValid) {
    throw new ApiError('Current password is incorrect', 401);
  }

  // Validate new password
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=\-{}[\]:;"'<>,.~`|\\\/])[A-Za-z\d@$!%*?&#^()_+=\-{}[\]:;"'<>,.~`|\\\/]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    throw new ApiError('New password does not meet requirements', 400);
  }

  // Hash and update
  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      password_hash: newPasswordHash,
      updated_at: new Date().toISOString()
    })
    .eq('id', req.user.id);

  if (error) {
    throw new ApiError('Failed to change password', 500);
  }

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
});

/**
 * Logout user
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  // In a stateless JWT system, logout is handled client-side by removing the token
  // Here we could add token to a blacklist if needed
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * Generate JWT token
 */
function generateToken(user: User): string {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as any
  });
}

/**
 * Generate refresh token
 */
function generateRefreshToken(user: User): string {
  const token = jwt.sign(
    { id: user.id, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN as any }
  );
  return token;
}

/**
 * Parse expiry time to seconds
 */
function parseExpiry(expiryString: string): number {
  const match = expiryString.match(/^(\d+)([smhd])$/);
  if (!match) return 3600;

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400
  };

  return value * (multipliers[unit] || 3600);
}
