require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Pool } = require('pg');
const winston = require('winston');
const cron = require('node-cron');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const instanceRoutes = require('./routes/instances');
const serverRoutes = require('./routes/servers');
const userRoutes = require('./routes/users');
const billingRoutes = require('./routes/billing');
const apiRoutes = require('./routes/api');

// Initialize logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'bolt-admin' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // For cloud databases
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Make database accessible to routes
app.locals.db = db;
app.locals.logger = logger;

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/instances', instanceRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/users', userRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/v1', apiRoutes);

// Serve static files from React build
app.use(express.static('client/build'));

// Catch all handler for React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await db.end();
  process.exit(0);
});

// Background tasks
// Clean up expired instances
cron.schedule('0 0 * * *', async () => {
  try {
    logger.info('Running daily cleanup task...');
    const result = await db.query(`
      UPDATE instances 
      SET status = 'stopped' 
      WHERE status = 'running' 
      AND last_accessed < NOW() - INTERVAL '30 days'
    `);
    logger.info(`Stopped ${result.rowCount} inactive instances`);
  } catch (error) {
    logger.error('Cleanup task error:', error);
  }
});

// Collect usage metrics every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    // This would collect metrics from running instances
    logger.info('Collecting usage metrics...');
    // Implementation would go here
  } catch (error) {
    logger.error('Metrics collection error:', error);
  }
});

app.listen(PORT, () => {
  logger.info(`🚀 Bolt.gives Admin Panel running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});