import type { EnvConfig } from '../types/index.js';

export const config: EnvConfig = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  JWT_SECRET: process.env.JWT_SECRET || 'change-this-secret-in-production',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  WS_PORT: parseInt(process.env.WS_PORT || '3001', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};

// Validate critical configuration
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.SUPABASE_URL) {
    errors.push('SUPABASE_URL is required');
  }
  
  if (!config.SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY is required');
  }
  
  if (!config.SUPABASE_SERVICE_ROLE_KEY) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is required');
  }

  if (config.NODE_ENV === 'production') {
    if (config.JWT_SECRET === 'change-this-secret-in-production') {
      errors.push('JWT_SECRET must be changed in production');
    }
    if (config.JWT_REFRESH_SECRET === 'change-this-refresh-secret-in-production') {
      errors.push('JWT_REFRESH_SECRET must be changed in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

export default config;
