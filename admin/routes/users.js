const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, plan } = req.query;
    const offset = (page - 1) * limit;
    const db = req.app.locals.db;

    let query = `
      SELECT u.*, 
             COUNT(i.id) as instance_count,
             MAX(i.last_accessed) as last_activity
      FROM users u
      LEFT JOIN instances i ON u.id = i.user_id AND i.status != 'deleted'
    `;
    
    const conditions = [];
    const params = [];
    
    if (status) {
      conditions.push(`u.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (plan) {
      conditions.push(`u.subscription_plan = $${params.length + 1}`);
      params.push(plan);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM users u';
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }
    const countResult = await db.query(countQuery, params.slice(0, -2));

    res.json({
      users: result.rows.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        company: user.company,
        phone: user.phone,
        status: user.status,
        subscriptionPlan: user.subscription_plan,
        instanceCount: parseInt(user.instance_count || 0),
        lastActivity: user.last_activity,
        createdAt: user.created_at
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });

  } catch (error) {
    req.app.locals.logger.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get user details
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.locals.db;

    const result = await db.query(`
      SELECT u.*, 
             COUNT(i.id) as instance_count,
             COALESCE(SUM(CASE WHEN b.status = 'paid' THEN b.amount ELSE 0 END), 0) as total_paid
      FROM users u
      LEFT JOIN instances i ON u.id = i.user_id AND i.status != 'deleted'
      LEFT JOIN billing b ON u.id = b.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get user's instances
    const instancesResult = await db.query(`
      SELECT i.*, s.name as server_name
      FROM instances i
      LEFT JOIN servers s ON i.server_id = s.id
      WHERE i.user_id = $1 AND i.status != 'deleted'
      ORDER BY i.created_at DESC
    `, [id]);

    res.json({
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
      },
      instances: instancesResult.rows
    });

  } catch (error) {
    req.app.locals.logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

// Update user status
router.put('/:id/status', 
  authenticateToken, 
  requireAdmin,
  [
    body('status').isIn(['active', 'suspended', 'trial'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { status } = req.body;
      const db = req.app.locals.db;

      const result = await db.query(
        'UPDATE users SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If suspending user, stop all their instances
      if (status === 'suspended') {
        await db.query(
          'UPDATE instances SET status = $1 WHERE user_id = $2 AND status = $3',
          ['stopped', id, 'running']
        );
      }

      res.json({
        message: `User status updated to ${status}`,
        user: result.rows[0]
      });

    } catch (error) {
      req.app.locals.logger.error('Update user status error:', error);
      res.status(500).json({ error: 'Failed to update user status' });
    }
  }
);

// Delete user (and all their instances)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.locals.db;

    // Check if user exists
    const userResult = await db.query('SELECT email FROM users WHERE id = $1', [id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userEmail = userResult.rows[0].email;

    // Delete user (CASCADE will handle instances, logs, etc.)
    await db.query('DELETE FROM users WHERE id = $1', [id]);

    req.app.locals.logger.info(`User ${userEmail} deleted by admin`);

    res.json({ message: 'User and all associated data deleted successfully' });

  } catch (error) {
    req.app.locals.logger.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;