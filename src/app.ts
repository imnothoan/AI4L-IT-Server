import 'dotenv/config'; // Reload env

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';


import { config, validateConfig } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { websocketService } from './services/websocketService.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import examRoutes from './routes/examRoutes.js';
import classRoutes from './routes/classRoutes.js';
import attemptRoutes from './routes/attemptRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import anticheatRoutes from './routes/anticheatRoutes.js';

// Load environment variables


// Validate configuration
try {
  validateConfig();
  console.log('✅ Configuration validated successfully');
} catch (error) {
  console.error('❌ Configuration validation failed:', error);
  process.exit(1);
}

// Create Express app
const app = express();

// Trust proxy (for deployment behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS configuration
app.use(cors({
  origin: config.CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: '10mb' })); // For base64 images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Intelligence Test Server is running',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

// API routes
const apiPrefix = config.API_PREFIX;

app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/questions`, questionRoutes);
app.use(`${apiPrefix}/exams`, examRoutes);
app.use(`${apiPrefix}/classes`, classRoutes);
app.use(`${apiPrefix}/attempts`, attemptRoutes);
app.use(`${apiPrefix}/students`, studentRoutes);
app.use(`${apiPrefix}/anticheat`, anticheatRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Intelligence Test Server API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      health: '/health',
      auth: `${apiPrefix}/auth`,
      questions: `${apiPrefix}/questions`,
      exams: `${apiPrefix}/exams`,
      classes: `${apiPrefix}/classes`,
      attempts: `${apiPrefix}/attempts`,
      anticheat: `${apiPrefix}/anticheat`
    }
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = config.PORT;

const server = app.listen(PORT, () => {
  console.log('\n🚀 Intelligence Test Server started successfully!');
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.NODE_ENV}`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}${apiPrefix}`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/health`);
  console.log('\n📚 API Endpoints:');
  console.log(`   - Auth: ${apiPrefix}/auth`);
  console.log(`   - Questions: ${apiPrefix}/questions`);
  console.log(`   - Exams: ${apiPrefix}/exams`);
  console.log(`   - Classes: ${apiPrefix}/classes`);
  console.log(`   - Attempts: ${apiPrefix}/attempts`);
  console.log(`   - WebSocket: ws://localhost:${PORT}/ws`);
  console.log('\n✨ Ready to accept connections!\n');
});

// Initialize WebSocket server
websocketService.initialize(server);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM signal received: closing HTTP server');
  websocketService.shutdown();
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT signal received: closing HTTP server');
  websocketService.shutdown();
  server.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;
