const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Database connection using the provided credentials
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // For cloud databases
  }
});

async function createTables() {
  console.log('🔧 Creating Bolt.gives Admin Panel Database Tables...');
  console.log('🌐 Connecting to remote PostgreSQL database...');

  try {
    // Test connection
    const client = await db.connect();
    console.log('✅ Connected to PostgreSQL database successfully');
    client.release();

    console.log('📊 Creating database schema...');

    // Create database schema
    const schema = `
-- Admin Panel Database Schema for Multi-Tenant Bolt.gives Cloud Hosting

-- Enable UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Servers table - manages multiple hosting servers
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET NOT NULL,
    port INTEGER DEFAULT 22,
    ssh_key_path VARCHAR(500),
    capacity INTEGER DEFAULT 100,
    current_load INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    is_default BOOLEAN DEFAULT FALSE,
    region VARCHAR(100),
    specs JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users table - customer accounts
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    company VARCHAR(255),
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    subscription_plan VARCHAR(100) DEFAULT 'starter',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Instances table - individual Bolt.gives deployments
CREATE TABLE IF NOT EXISTS instances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(255) NOT NULL UNIQUE,
    custom_domain VARCHAR(255),
    port INTEGER NOT NULL,
    container_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'creating',
    cpu_limit VARCHAR(20) DEFAULT '1',
    memory_limit VARCHAR(20) DEFAULT '2g',
    storage_limit VARCHAR(20) DEFAULT '10g',
    ssl_enabled BOOLEAN DEFAULT TRUE,
    env_vars JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP,
    
    UNIQUE(server_id, port)
);

-- Admin users table - for admin panel access
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Instance logs table - track instance activities
CREATE TABLE IF NOT EXISTS instance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Usage metrics table - track resource usage
CREATE TABLE IF NOT EXISTS usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL,
    value DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW()
);

-- Billing table - track usage and costs
CREATE TABLE IF NOT EXISTS billing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'pending',
    invoice_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP
);

-- API keys table - for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]',
    expires_at TIMESTAMP,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_instances_user_id ON instances(user_id);
CREATE INDEX IF NOT EXISTS idx_instances_server_id ON instances(server_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_instance_date ON usage_metrics(instance_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_billing_user_period ON billing(user_id, billing_period_start, billing_period_end);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_servers_updated_at ON servers;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_instances_updated_at ON instances;
DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;

-- Create triggers
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_instances_updated_at BEFORE UPDATE ON instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    await db.query(schema);
    console.log('✅ Database schema created successfully');

    // Insert default system settings
    console.log('⚙️ Inserting default system settings...');
    await db.query(`
      INSERT INTO system_settings (key, value, description) VALUES 
      ('default_instance_config', '{"cpu": "1", "memory": "2g", "storage": "10g"}', 'Default resource limits for new instances'),
      ('pricing', '{"starter": 29.99, "pro": 99.99, "enterprise": 299.99}', 'Monthly pricing by plan'),
      ('max_instances_per_user', '{"starter": 3, "pro": 10, "enterprise": 50}', 'Maximum instances per subscription plan'),
      ('instance_subdomain_template', '"user{user_id}.bolt.gives"', 'Template for generating subdomains'),
      ('smtp_config', '{"host": "", "port": 587, "username": "", "password": ""}', 'SMTP configuration for emails')
      ON CONFLICT (key) DO NOTHING
    `);

    // Create default admin user
    console.log('👤 Creating default admin user...');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@openweb.live';
    const adminPassword = process.env.ADMIN_PASSWORD || 'BoltAdmin2024!';
    
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    await db.query(`
      INSERT INTO admin_users (email, password_hash, role, permissions)
      VALUES ($1, $2, 'super_admin', $3)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = $2,
        role = 'super_admin',
        permissions = $3
    `, [
      adminEmail,
      passwordHash,
      JSON.stringify(['*']) // All permissions
    ]);

    console.log(`✅ Admin user created/updated: ${adminEmail}`);

    // Insert default server (current server)
    console.log('🖥️  Adding default server configuration...');
    await db.query(`
      INSERT INTO servers (name, hostname, ip_address, port, capacity, is_default, region, status)
      VALUES ('Primary Server', 'user4106.openweb.live', '0.0.0.0', 22, 100, true, 'Global', 'active')
      ON CONFLICT (hostname) DO UPDATE SET
        is_default = true,
        status = 'active'
    `);

    console.log('✅ Default server configuration added');

    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📋 Database Details:');
    console.log(`📦 Database: ${process.env.DB_NAME}`);
    console.log(`🌐 Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log(`👤 Admin Email: ${adminEmail}`);
    console.log(`🔑 Admin Password: ${adminPassword}`);
    console.log('\n⚠️  IMPORTANT: Change the admin password after first login!');

    console.log('\n📋 Next steps:');
    console.log('1. Start the admin panel: cd /root/bolt.gives/admin && npm install && npm start');
    console.log('2. Access at: http://localhost:3001');
    console.log(`3. Login with ${adminEmail} and the password above`);

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    if (error.code === 'ENOTFOUND') {
      console.error('🌐 Cannot connect to database host. Check your connection details.');
    }
    if (error.code === '28P01') {
      console.error('🔐 Authentication failed. Check your username/password.');
    }
    process.exit(1);
  } finally {
    await db.end();
  }
}

// Run the setup
createTables();