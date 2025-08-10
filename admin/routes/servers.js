const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { NodeSSH } = require('node-ssh');

const { authenticateToken, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all servers
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;

    const result = await db.query(`
      SELECT s.*, 
             COUNT(i.id) as instance_count,
             COALESCE(AVG(CASE WHEN i.status = 'running' THEN 1 ELSE 0 END), 0) as health_score
      FROM servers s
      LEFT JOIN instances i ON s.id = i.server_id AND i.status != 'deleted'
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    res.json({ servers: result.rows });

  } catch (error) {
    req.app.locals.logger.error('Get servers error:', error);
    res.status(500).json({ error: 'Failed to retrieve servers' });
  }
});

// Add new server
router.post('/',
  authenticateToken,
  requireSuperAdmin,
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('hostname').trim().isLength({ min: 1 }),
    body('ipAddress').isIP(),
    body('region').optional().trim().isLength({ max: 100 }),
    body('capacity').isInt({ min: 1, max: 1000 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { 
        name, hostname, ipAddress, port = 22, 
        sshKeyPath, capacity = 100, region, specs 
      } = req.body;
      
      const db = req.app.locals.db;
      const logger = req.app.locals.logger;

      // Test SSH connection
      try {
        const ssh = new NodeSSH();
        await ssh.connect({
          host: ipAddress,
          username: 'root',
          port: port,
          privateKeyPath: sshKeyPath
        });

        // Test basic commands
        const result = await ssh.execCommand('docker --version && nginx -v');
        if (result.code !== 0) {
          throw new Error('Docker or Nginx not found on server');
        }

        ssh.dispose();
        logger.info(`SSH connection to ${ipAddress} successful`);

      } catch (sshError) {
        logger.error(`SSH connection failed for ${ipAddress}:`, sshError);
        return res.status(400).json({ 
          error: 'Failed to connect to server',
          details: sshError.message 
        });
      }

      // Add server to database
      const serverId = uuidv4();
      const serverResult = await db.query(`
        INSERT INTO servers (
          id, name, hostname, ip_address, port, ssh_key_path, 
          capacity, region, specs, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
        RETURNING *
      `, [
        serverId, name, hostname, ipAddress, port, 
        sshKeyPath, capacity, region, specs || {}
      ]);

      logger.info(`Server ${name} (${ipAddress}) added successfully`);

      res.status(201).json({ 
        message: 'Server added successfully',
        server: serverResult.rows[0]
      });

    } catch (error) {
      req.app.locals.logger.error('Add server error:', error);
      res.status(500).json({ error: 'Failed to add server' });
    }
  }
);

// Update server
router.put('/:id',
  authenticateToken,
  requireSuperAdmin,
  [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('capacity').optional().isInt({ min: 1, max: 1000 }),
    body('status').optional().isIn(['active', 'inactive', 'maintenance'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const updates = req.body;
      const db = req.app.locals.db;

      // Build dynamic query
      const setClause = [];
      const values = [];
      let valueIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          const dbColumn = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          setClause.push(`${dbColumn} = $${valueIndex}`);
          values.push(value);
          valueIndex++;
        }
      }

      if (setClause.length === 0) {
        return res.status(400).json({ error: 'No valid updates provided' });
      }

      const query = `
        UPDATE servers 
        SET ${setClause.join(', ')}, updated_at = NOW()
        WHERE id = $${valueIndex}
        RETURNING *
      `;
      values.push(id);

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Server not found' });
      }

      res.json({
        message: 'Server updated successfully',
        server: result.rows[0]
      });

    } catch (error) {
      req.app.locals.logger.error('Update server error:', error);
      res.status(500).json({ error: 'Failed to update server' });
    }
  }
);

// Set default server
router.post('/:id/set-default',
  authenticateToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = req.app.locals.db;

      // Start transaction
      await db.query('BEGIN');

      // Remove default from all servers
      await db.query('UPDATE servers SET is_default = false');

      // Set new default
      const result = await db.query(
        'UPDATE servers SET is_default = true WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        await db.query('ROLLBACK');
        return res.status(404).json({ error: 'Server not found' });
      }

      await db.query('COMMIT');

      req.app.locals.logger.info(`Server ${id} set as default`);

      res.json({
        message: 'Default server updated',
        server: result.rows[0]
      });

    } catch (error) {
      await req.app.locals.db.query('ROLLBACK');
      req.app.locals.logger.error('Set default server error:', error);
      res.status(500).json({ error: 'Failed to update default server' });
    }
  }
);

// Test server connection
router.post('/:id/test-connection',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = req.app.locals.db;

      const result = await db.query(
        'SELECT * FROM servers WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Server not found' });
      }

      const server = result.rows[0];

      const ssh = new NodeSSH();
      const startTime = Date.now();

      try {
        await ssh.connect({
          host: server.ip_address,
          username: 'root',
          port: server.port,
          privateKeyPath: server.ssh_key_path
        });

        // Test various services
        const tests = {
          docker: await ssh.execCommand('docker --version'),
          nginx: await ssh.execCommand('nginx -v'),
          disk: await ssh.execCommand('df -h /'),
          memory: await ssh.execCommand('free -h'),
          load: await ssh.execCommand('uptime')
        };

        const responseTime = Date.now() - startTime;

        ssh.dispose();

        const testResults = {
          connected: true,
          responseTime,
          services: {}
        };

        for (const [service, result] of Object.entries(tests)) {
          testResults.services[service] = {
            status: result.code === 0 ? 'ok' : 'error',
            output: result.stdout || result.stderr
          };
        }

        res.json({ test: testResults });

      } catch (sshError) {
        res.json({
          test: {
            connected: false,
            error: sshError.message,
            responseTime: Date.now() - startTime
          }
        });
      }

    } catch (error) {
      req.app.locals.logger.error('Test server connection error:', error);
      res.status(500).json({ error: 'Failed to test server connection' });
    }
  }
);

// Get server statistics
router.get('/:id/stats',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = req.app.locals.db;

      const server = await db.query(
        'SELECT * FROM servers WHERE id = $1',
        [id]
      );

      if (server.rows.length === 0) {
        return res.status(404).json({ error: 'Server not found' });
      }

      // Get instance statistics
      const stats = await db.query(`
        SELECT 
          COUNT(*) as total_instances,
          COUNT(CASE WHEN status = 'running' THEN 1 END) as running_instances,
          COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped_instances,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_instances,
          AVG(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as daily_growth
        FROM instances 
        WHERE server_id = $1 AND status != 'deleted'
      `, [id]);

      // Get recent usage metrics if available
      const usage = await db.query(`
        SELECT 
          metric_type,
          AVG(value) as avg_value,
          MAX(value) as max_value
        FROM usage_metrics um
        JOIN instances i ON um.instance_id = i.id
        WHERE i.server_id = $1 
        AND um.recorded_at >= NOW() - INTERVAL '1 hour'
        GROUP BY metric_type
      `, [id]);

      res.json({
        server: server.rows[0],
        statistics: stats.rows[0],
        usage: usage.rows
      });

    } catch (error) {
      req.app.locals.logger.error('Get server stats error:', error);
      res.status(500).json({ error: 'Failed to retrieve server statistics' });
    }
  }
);

// Delete server (only if no active instances)
router.delete('/:id',
  authenticateToken,
  requireSuperAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = req.app.locals.db;

      // Check for active instances
      const instanceCheck = await db.query(
        'SELECT COUNT(*) FROM instances WHERE server_id = $1 AND status IN ($2, $3)',
        [id, 'running', 'creating']
      );

      if (parseInt(instanceCheck.rows[0].count) > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete server with active instances' 
        });
      }

      const result = await db.query(
        'DELETE FROM servers WHERE id = $1 RETURNING name',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Server not found' });
      }

      req.app.locals.logger.info(`Server ${result.rows[0].name} deleted`);

      res.json({ message: 'Server deleted successfully' });

    } catch (error) {
      req.app.locals.logger.error('Delete server error:', error);
      res.status(500).json({ error: 'Failed to delete server' });
    }
  }
);

module.exports = router;