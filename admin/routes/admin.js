const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Admin dashboard stats
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;
    
    // Get total counts
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM instances WHERE status != 'deleted') as total_instances,
        (SELECT COUNT(*) FROM instances WHERE status = 'running') as running_instances,
        (SELECT COUNT(*) FROM users WHERE status = 'active') as total_users,
        (SELECT COUNT(*) FROM servers WHERE status = 'active') as total_servers,
        (SELECT COALESCE(SUM(amount), 0) FROM billing WHERE created_at >= date_trunc('month', CURRENT_DATE)) as monthly_revenue
    `;
    
    const result = await db.query(statsQuery);
    const stats = result.rows[0];

    // Get recent activity (last 10 activities)
    const activityQuery = `
      SELECT 
        il.action,
        il.status,
        il.message,
        il.created_at,
        u.email,
        i.name as instance_name
      FROM instance_logs il
      JOIN instances i ON il.instance_id = i.id
      JOIN users u ON i.user_id = u.id
      ORDER BY il.created_at DESC
      LIMIT 10
    `;
    
    const activityResult = await db.query(activityQuery);
    
    // Get server status
    const serverQuery = `
      SELECT 
        name,
        current_load,
        capacity,
        status,
        region
      FROM servers
      WHERE status = 'active'
      ORDER BY is_default DESC, name
    `;
    
    const serverResult = await db.query(serverQuery);

    res.json({
      stats: {
        totalInstances: parseInt(stats.total_instances),
        runningInstances: parseInt(stats.running_instances),
        totalUsers: parseInt(stats.total_users),
        totalServers: parseInt(stats.total_servers),
        monthlyRevenue: parseFloat(stats.monthly_revenue || 0),
        systemHealth: 98.5 // Mock system health - implement real monitoring
      },
      recentActivity: activityResult.rows.map(row => ({
        type: row.action,
        user: row.email,
        instance: row.instance_name,
        status: row.status,
        message: row.message,
        timestamp: row.created_at
      })),
      servers: serverResult.rows
    });

  } catch (error) {
    req.app.locals.logger.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve admin stats' });
  }
});

module.exports = router;