const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Public API endpoints for user dashboard/mobile app integration

// Get user's instances (API version)
router.get('/my/instances', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'user') {
      return res.status(403).json({ error: 'User access required' });
    }

    const db = req.app.locals.db;
    const userId = req.user.userId;

    const result = await db.query(`
      SELECT 
        i.id,
        i.name,
        i.subdomain,
        i.custom_domain,
        i.status,
        i.created_at,
        i.last_accessed,
        s.name as server_name,
        s.region
      FROM instances i
      LEFT JOIN servers s ON i.server_id = s.id
      WHERE i.user_id = $1 AND i.status != 'deleted'
      ORDER BY i.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      instances: result.rows
    });

  } catch (error) {
    req.app.locals.logger.error('API get user instances error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve instances' });
  }
});

// Get user profile
router.get('/my/profile', authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'user') {
      return res.status(403).json({ error: 'User access required' });
    }

    const db = req.app.locals.db;
    const userId = req.user.userId;

    const result = await db.query(`
      SELECT 
        u.*,
        COUNT(i.id) as instance_count,
        COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.amount ELSE 0 END), 0) as total_paid
      FROM users u
      LEFT JOIN instances i ON u.id = i.user_id AND i.status != 'deleted'
      LEFT JOIN billing b ON u.id = b.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        company: user.company,
        phone: user.phone,
        status: user.status,
        subscriptionPlan: user.subscription_plan,
        instanceCount: parseInt(user.instance_count || 0),
        totalPaid: parseFloat(user.total_paid || 0),
        createdAt: user.created_at
      }
    });

  } catch (error) {
    req.app.locals.logger.error('API get user profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve profile' });
  }
});

// API Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;