const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const router = express.Router();

// Rate limiting for auth endpoints
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'auth',
  points: 5, // Number of attempts
  duration: 300, // Per 5 minutes
});

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to check rate limiting
const rateLimitMiddleware = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    const msBeforeNext = rejRes.msBeforeNext || 1;
    res.set('Retry-After', Math.round(msBeforeNext / 1000) || 1);
    res.status(429).json({ error: 'Too many requests' });
  }
};

// Admin login
router.post('/admin/login', 
  rateLimitMiddleware,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      const db = req.app.locals.db;

      // Check if admin user exists
      const result = await db.query(
        'SELECT * FROM admin_users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const adminUser = result.rows[0];

      // Verify password
      const validPassword = await bcrypt.compare(password, adminUser.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: adminUser.id, 
          email: adminUser.email, 
          role: adminUser.role,
          type: 'admin'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role,
          permissions: adminUser.permissions
        }
      });

    } catch (error) {
      req.app.locals.logger.error('Admin login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// User registration
router.post('/register',
  rateLimitMiddleware,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').trim().isLength({ min: 1 }),
    body('lastName').trim().isLength({ min: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, firstName, lastName, company } = req.body;
      const db = req.app.locals.db;

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const result = await db.query(`
        INSERT INTO users (email, password_hash, first_name, last_name, company, status, subscription_plan)
        VALUES ($1, $2, $3, $4, $5, 'trial', 'starter')
        RETURNING id, email, first_name, last_name, company, status, subscription_plan
      `, [email, passwordHash, firstName, lastName, company || null]);

      const newUser = result.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: newUser.id, 
          email: newUser.email,
          type: 'user'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // TODO: Create initial instance for user
      // This will be implemented in the instance creation logic

      res.status(201).json({
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.first_name,
          lastName: newUser.last_name,
          company: newUser.company,
          status: newUser.status,
          subscriptionPlan: newUser.subscription_plan
        }
      });

    } catch (error) {
      req.app.locals.logger.error('User registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
);

// User login
router.post('/login',
  rateLimitMiddleware,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      const db = req.app.locals.db;

      // Check if user exists
      const result = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // Check if user is active
      if (user.status !== 'active' && user.status !== 'trial') {
        return res.status(401).json({ error: 'Account suspended' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          type: 'user'
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          company: user.company,
          status: user.status,
          subscriptionPlan: user.subscription_plan
        }
      });

    } catch (error) {
      req.app.locals.logger.error('User login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    // Verify and decode the existing token
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    
    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: decoded.userId, 
        email: decoded.email,
        role: decoded.role,
        type: decoded.type
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token: newToken });

  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;