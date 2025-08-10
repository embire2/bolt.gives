const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const Docker = require('dockerode');
const { NodeSSH } = require('node-ssh');

const { authenticateToken, requireAdmin, requirePermission } = require('../middleware/auth');
const router = express.Router();

// Instance management service
class InstanceManager {
  constructor(logger) {
    this.logger = logger;
  }

  // Get available server for new instance
  async getOptimalServer(db) {
    const result = await db.query(`
      SELECT * FROM servers 
      WHERE status = 'active' AND current_load < capacity
      ORDER BY 
        CASE WHEN is_default THEN 0 ELSE 1 END,
        (current_load::float / capacity::float) ASC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      throw new Error('No available servers');
    }

    return result.rows[0];
  }

  // Find available port on server
  async findAvailablePort(db, serverId, startPort = 3000) {
    const result = await db.query(
      'SELECT port FROM instances WHERE server_id = $1 ORDER BY port',
      [serverId]
    );

    const usedPorts = new Set(result.rows.map(row => row.port));
    
    let port = startPort;
    while (usedPorts.has(port)) {
      port++;
    }
    
    return port;
  }

  // Generate subdomain for instance
  generateSubdomain(userId) {
    const shortId = userId.substring(0, 8);
    return `user-${shortId}.bolt.gives`;
  }

  // Create Docker container for instance
  async createContainer(server, instance) {
    try {
      const ssh = new NodeSSH();
      await ssh.connect({
        host: server.ip_address,
        username: 'root',
        privateKeyPath: server.ssh_key_path
      });

      // Docker run command for Bolt.gives instance
      const dockerCmd = `
        docker run -d \\
          --name bolt-${instance.id} \\
          --restart unless-stopped \\
          -p ${instance.port}:5173 \\
          -e NODE_OPTIONS="--max-old-space-size=${instance.memory_limit.replace('g', '000')}" \\
          -e INSTANCE_ID="${instance.id}" \\
          -e USER_ID="${instance.user_id}" \\
          --cpus="${instance.cpu_limit}" \\
          --memory="${instance.memory_limit}" \\
          bolt-ai-gpt5:latest
      `;

      const result = await ssh.execCommand(dockerCmd);
      
      if (result.code !== 0) {
        throw new Error(`Container creation failed: ${result.stderr}`);
      }

      const containerId = result.stdout.trim();
      
      ssh.dispose();
      
      return containerId;

    } catch (error) {
      this.logger.error('Container creation error:', error);
      throw error;
    }
  }

  // Setup SSL certificate for instance
  async setupSSL(server, subdomain) {
    try {
      const ssh = new NodeSSH();
      await ssh.connect({
        host: server.ip_address,
        username: 'root',
        privateKeyPath: server.ssh_key_path
      });

      // Create nginx config
      const nginxConfig = `
server {
    listen 80;
    server_name ${subdomain};
    
    location / {
        proxy_pass http://localhost:${instance.port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
      `;

      // Write nginx config
      await ssh.execCommand(`echo '${nginxConfig}' > /etc/nginx/sites-available/${subdomain}`);
      await ssh.execCommand(`ln -sf /etc/nginx/sites-available/${subdomain} /etc/nginx/sites-enabled/`);
      
      // Test and reload nginx
      await ssh.execCommand('nginx -t && systemctl reload nginx');

      // Get SSL certificate
      await ssh.execCommand(`certbot --nginx -d ${subdomain} --non-interactive --agree-tos --email admin@openweb.live`);

      ssh.dispose();

    } catch (error) {
      this.logger.error('SSL setup error:', error);
      throw error;
    }
  }

  // Delete instance and cleanup
  async deleteInstance(db, instanceId) {
    try {
      // Get instance details
      const result = await db.query(`
        SELECT i.*, s.ip_address, s.ssh_key_path 
        FROM instances i 
        JOIN servers s ON i.server_id = s.id 
        WHERE i.id = $1
      `, [instanceId]);

      if (result.rows.length === 0) {
        throw new Error('Instance not found');
      }

      const instance = result.rows[0];

      // Connect to server
      const ssh = new NodeSSH();
      await ssh.connect({
        host: instance.ip_address,
        username: 'root',
        privateKeyPath: instance.ssh_key_path
      });

      // Stop and remove container
      await ssh.execCommand(`docker stop bolt-${instanceId} || true`);
      await ssh.execCommand(`docker rm bolt-${instanceId} || true`);

      // Remove nginx config
      await ssh.execCommand(`rm -f /etc/nginx/sites-available/${instance.subdomain}`);
      await ssh.execCommand(`rm -f /etc/nginx/sites-enabled/${instance.subdomain}`);
      await ssh.execCommand('systemctl reload nginx');

      // Revoke SSL certificate
      await ssh.execCommand(`certbot revoke --cert-name ${instance.subdomain} --non-interactive || true`);

      ssh.dispose();

      // Update database
      await db.query('DELETE FROM instances WHERE id = $1', [instanceId]);

      // Update server load
      await db.query(
        'UPDATE servers SET current_load = current_load - 1 WHERE id = $1',
        [instance.server_id]
      );

      return true;

    } catch (error) {
      this.logger.error('Instance deletion error:', error);
      throw error;
    }
  }
}

// Get all instances (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;
    const offset = (page - 1) * limit;
    const db = req.app.locals.db;

    let query = `
      SELECT i.*, u.email, u.first_name, u.last_name, s.name as server_name
      FROM instances i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN servers s ON i.server_id = s.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (status) {
      conditions.push(`i.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (userId) {
      conditions.push(`i.user_id = $${params.length + 1}`);
      params.push(userId);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM instances i';
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
    }
    const countResult = await db.query(countQuery, params.slice(0, -2));

    res.json({
      instances: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        pages: Math.ceil(countResult.rows[0].count / limit)
      }
    });

  } catch (error) {
    req.app.locals.logger.error('Get instances error:', error);
    res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

// Get user's instances
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const userId = req.user.userId;

    const result = await db.query(`
      SELECT i.*, s.name as server_name, s.region
      FROM instances i
      LEFT JOIN servers s ON i.server_id = s.id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
    `, [userId]);

    res.json({ instances: result.rows });

  } catch (error) {
    req.app.locals.logger.error('Get user instances error:', error);
    res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

// Create new instance
router.post('/',
  authenticateToken,
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('customDomain').optional().isURL()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, customDomain } = req.body;
      const userId = req.user.userId;
      const db = req.app.locals.db;
      const logger = req.app.locals.logger;
      const instanceManager = new InstanceManager(logger);

      // Check user's instance limit
      const userResult = await db.query('SELECT subscription_plan FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const subscriptionPlan = userResult.rows[0].subscription_plan;
      const settings = await db.query(
        "SELECT value FROM system_settings WHERE key = 'max_instances_per_user'"
      );
      const limits = settings.rows[0].value;
      const maxInstances = limits[subscriptionPlan] || 1;

      const instanceCount = await db.query(
        'SELECT COUNT(*) FROM instances WHERE user_id = $1 AND status != $2',
        [userId, 'deleted']
      );

      if (parseInt(instanceCount.rows[0].count) >= maxInstances) {
        return res.status(400).json({ 
          error: `Instance limit reached for ${subscriptionPlan} plan (${maxInstances} instances)` 
        });
      }

      // Get optimal server
      const server = await instanceManager.getOptimalServer(db);
      
      // Find available port
      const port = await instanceManager.findAvailablePort(db, server.id);
      
      // Generate subdomain
      const subdomain = instanceManager.generateSubdomain(userId);
      
      const instanceId = uuidv4();

      // Create instance record
      const instanceResult = await db.query(`
        INSERT INTO instances (
          id, user_id, server_id, name, subdomain, custom_domain, port, 
          status, cpu_limit, memory_limit, storage_limit
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'creating', '1', '2g', '10g')
        RETURNING *
      `, [instanceId, userId, server.id, name, subdomain, customDomain, port]);

      const instance = instanceResult.rows[0];

      // Update server load
      await db.query(
        'UPDATE servers SET current_load = current_load + 1 WHERE id = $1',
        [server.id]
      );

      // Log instance creation
      await db.query(`
        INSERT INTO instance_logs (instance_id, action, status, message)
        VALUES ($1, 'create', 'pending', 'Instance creation initiated')
      `, [instanceId]);

      res.status(201).json({ 
        message: 'Instance creation initiated',
        instance: instance
      });

      // Create container asynchronously
      setImmediate(async () => {
        try {
          const containerId = await instanceManager.createContainer(server, instance);
          
          // Update instance with container ID and set to running
          await db.query(
            'UPDATE instances SET container_id = $1, status = $2 WHERE id = $3',
            [containerId, 'running', instanceId]
          );

          // Setup SSL
          await instanceManager.setupSSL(server, subdomain);

          // Update SSL status
          await db.query(
            'UPDATE instances SET ssl_enabled = true WHERE id = $1',
            [instanceId]
          );

          // Log success
          await db.query(`
            INSERT INTO instance_logs (instance_id, action, status, message)
            VALUES ($1, 'create', 'success', 'Instance created successfully')
          `, [instanceId]);

          logger.info(`Instance ${instanceId} created successfully`);

        } catch (error) {
          logger.error(`Instance ${instanceId} creation failed:`, error);
          
          // Update status to failed
          await db.query(
            'UPDATE instances SET status = $1 WHERE id = $2',
            ['failed', instanceId]
          );

          // Log failure
          await db.query(`
            INSERT INTO instance_logs (instance_id, action, status, message)
            VALUES ($1, 'create', 'failed', $2)
          `, [instanceId, error.message]);
        }
      });

    } catch (error) {
      req.app.locals.logger.error('Create instance error:', error);
      res.status(500).json({ error: 'Failed to create instance' });
    }
  }
);

// Get instance details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.locals.db;

    let query = `
      SELECT i.*, u.email, u.first_name, u.last_name, s.name as server_name, s.region
      FROM instances i
      LEFT JOIN users u ON i.user_id = u.id
      LEFT JOIN servers s ON i.server_id = s.id
      WHERE i.id = $1
    `;

    const params = [id];

    // Non-admin users can only see their own instances
    if (req.user.type !== 'admin') {
      query += ' AND i.user_id = $2';
      params.push(req.user.userId);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    // Update last_accessed timestamp
    await db.query(
      'UPDATE instances SET last_accessed = NOW() WHERE id = $1',
      [id]
    );

    res.json({ instance: result.rows[0] });

  } catch (error) {
    req.app.locals.logger.error('Get instance error:', error);
    res.status(500).json({ error: 'Failed to retrieve instance' });
  }
});

// Delete instance
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.locals.db;
    const logger = req.app.locals.logger;

    // Check if user owns instance or is admin
    let query = 'SELECT user_id FROM instances WHERE id = $1';
    const params = [id];

    if (req.user.type !== 'admin') {
      query += ' AND user_id = $2';
      params.push(req.user.userId);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const instanceManager = new InstanceManager(logger);
    await instanceManager.deleteInstance(db, id);

    res.json({ message: 'Instance deleted successfully' });

  } catch (error) {
    req.app.locals.logger.error('Delete instance error:', error);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// Start/Stop instance
router.post('/:id/:action', authenticateToken, async (req, res) => {
  try {
    const { id, action } = req.params;
    
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const db = req.app.locals.db;

    // Check permissions (same as delete)
    let query = 'SELECT i.*, s.ip_address, s.ssh_key_path FROM instances i JOIN servers s ON i.server_id = s.id WHERE i.id = $1';
    const params = [id];

    if (req.user.type !== 'admin') {
      query += ' AND i.user_id = $2';
      params.push(req.user.userId);
    }

    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    const instance = result.rows[0];

    // Connect to server and perform action
    const ssh = new NodeSSH();
    await ssh.connect({
      host: instance.ip_address,
      username: 'root',
      privateKeyPath: instance.ssh_key_path
    });

    const containerName = `bolt-${id}`;
    await ssh.execCommand(`docker ${action} ${containerName}`);

    ssh.dispose();

    // Update instance status
    const newStatus = action === 'stop' ? 'stopped' : 'running';
    await db.query(
      'UPDATE instances SET status = $1 WHERE id = $2',
      [newStatus, id]
    );

    // Log action
    await db.query(`
      INSERT INTO instance_logs (instance_id, action, status, message)
      VALUES ($1, $2, 'success', $3)
    `, [id, action, `Instance ${action} completed`]);

    res.json({ message: `Instance ${action} successful`, status: newStatus });

  } catch (error) {
    req.app.locals.logger.error(`Instance ${req.params.action} error:`, error);
    res.status(500).json({ error: `Failed to ${req.params.action} instance` });
  }
});

module.exports = router;