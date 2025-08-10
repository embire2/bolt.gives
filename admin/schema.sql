-- Admin Panel Database Schema for Multi-Tenant Bolt.gives Cloud Hosting

-- Servers table - manages multiple hosting servers
CREATE TABLE servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    hostname VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET NOT NULL,
    port INTEGER DEFAULT 22,
    ssh_key_path VARCHAR(500),
    capacity INTEGER DEFAULT 100, -- max instances per server
    current_load INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, maintenance
    is_default BOOLEAN DEFAULT FALSE,
    region VARCHAR(100),
    specs JSONB, -- server specifications
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users table - customer accounts
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    company VARCHAR(255),
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active', -- active, suspended, trial
    subscription_plan VARCHAR(100) DEFAULT 'starter', -- starter, pro, enterprise
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Instances table - individual Bolt.gives deployments
CREATE TABLE instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(255) NOT NULL UNIQUE, -- user123.bolt.gives
    custom_domain VARCHAR(255), -- optional custom domain
    port INTEGER NOT NULL,
    container_id VARCHAR(255), -- Docker container ID
    status VARCHAR(50) DEFAULT 'creating', -- creating, running, stopped, failed
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
CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin', -- super_admin, admin, support
    permissions JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Instance logs table - track instance activities
CREATE TABLE instance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL, -- create, start, stop, restart, delete
    status VARCHAR(50) NOT NULL, -- success, failed, pending
    message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Usage metrics table - track resource usage
CREATE TABLE usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL, -- cpu, memory, storage, requests
    value DECIMAL(10,2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    recorded_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_instance_metrics (instance_id, metric_type, recorded_at)
);

-- Billing table - track usage and costs
CREATE TABLE billing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    instance_id UUID REFERENCES instances(id) ON DELETE CASCADE,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid, overdue
    invoice_number VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    paid_at TIMESTAMP
);

-- API keys table - for programmatic access
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    permissions JSONB DEFAULT '[]',
    expires_at TIMESTAMP,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- System settings table
CREATE TABLE system_settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES 
('default_instance_config', '{"cpu": "1", "memory": "2g", "storage": "10g"}', 'Default resource limits for new instances'),
('pricing', '{"starter": 29.99, "pro": 99.99, "enterprise": 299.99}', 'Monthly pricing by plan'),
('max_instances_per_user', '{"starter": 3, "pro": 10, "enterprise": 50}', 'Maximum instances per subscription plan'),
('instance_subdomain_template', 'user{user_id}.bolt.gives', 'Template for generating subdomains'),
('smtp_config', '{"host": "", "port": 587, "username": "", "password": ""}', 'SMTP configuration for emails');

-- Create indexes for performance
CREATE INDEX idx_instances_user_id ON instances(user_id);
CREATE INDEX idx_instances_server_id ON instances(server_id);
CREATE INDEX idx_instances_status ON instances(status);
CREATE INDEX idx_usage_metrics_instance_date ON usage_metrics(instance_id, recorded_at);
CREATE INDEX idx_billing_user_period ON billing(user_id, billing_period_start, billing_period_end);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_instances_updated_at BEFORE UPDATE ON instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();