const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get billing overview
router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const overviewQuery = `
      SELECT 
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_revenue,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) as overdue_revenue,
        COUNT(*) as total_invoices,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_invoices
      FROM billing
      WHERE billing_period_start >= date_trunc('year', CURRENT_DATE)
    `;

    const result = await db.query(overviewQuery);
    const overview = result.rows[0];

    // Get monthly revenue trend
    const trendQuery = `
      SELECT 
        date_trunc('month', billing_period_start) as month,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as revenue
      FROM billing
      WHERE billing_period_start >= date_trunc('month', CURRENT_DATE - interval '11 months')
      GROUP BY date_trunc('month', billing_period_start)
      ORDER BY month
    `;

    const trendResult = await db.query(trendQuery);

    res.json({
      overview: {
        totalRevenue: parseFloat(overview.total_revenue),
        pendingRevenue: parseFloat(overview.pending_revenue),
        overdueRevenue: parseFloat(overview.overdue_revenue),
        totalInvoices: parseInt(overview.total_invoices),
        paidInvoices: parseInt(overview.paid_invoices)
      },
      monthlyTrend: trendResult.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue)
      }))
    });

  } catch (error) {
    req.app.locals.logger.error('Billing overview error:', error);
    res.status(500).json({ error: 'Failed to retrieve billing overview' });
  }
});

// Get all billing records
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;
    const db = req.app.locals.db;

    let query = `
      SELECT b.*, u.email, u.first_name, u.last_name,
             i.name as instance_name, i.subdomain
      FROM billing b
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN instances i ON b.instance_id = i.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (status) {
      conditions.push(`b.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM billing b';
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }
    const countResult = await db.query(countQuery, params.slice(0, -2));

    res.json({
      billing: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });

  } catch (error) {
    req.app.locals.logger.error('Get billing records error:', error);
    res.status(500).json({ error: 'Failed to retrieve billing records' });
  }
});

// Update billing record status
router.put('/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const db = req.app.locals.db;

    if (!['pending', 'paid', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updates = { status };
    if (status === 'paid') {
      updates.paid_at = new Date();
    }

    const result = await db.query(
      'UPDATE billing SET status = $1, paid_at = $2 WHERE id = $3 RETURNING *',
      [status, status === 'paid' ? new Date() : null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Billing record not found' });
    }

    res.json({
      message: `Billing status updated to ${status}`,
      billing: result.rows[0]
    });

  } catch (error) {
    req.app.locals.logger.error('Update billing status error:', error);
    res.status(500).json({ error: 'Failed to update billing status' });
  }
});

module.exports = router;