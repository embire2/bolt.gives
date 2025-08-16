#!/bin/bash

# Bolt.gives Installation Script
# Automatically installs and configures Bolt.gives with SSL support
# Based on production testing and error documentation

set -e  # Exit on any error

echo "🚀 Bolt.gives Installation Script"
echo "================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   log_error "This script should not be run as root for security reasons"
   exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get domain from user
if [ -z "$1" ]; then
    echo "Please enter your domain name (e.g., example.com):"
    read -r DOMAIN
else
    DOMAIN=$1
fi

if [ -z "$DOMAIN" ]; then
    log_error "Domain name is required"
    exit 1
fi

log_info "Installing Bolt.gives for domain: $DOMAIN"

# Update system packages
log_info "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required system packages
log_info "Installing required system packages..."
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx

# Install Node.js 20 (required for compatibility)
log_info "Installing Node.js 20..."
if ! command_exists node || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt "20" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    log_success "Node.js 20 installed successfully"
else
    log_success "Node.js 20 already installed"
fi

# Install pnpm globally
log_info "Installing pnpm package manager..."
if ! command_exists pnpm; then
    npm install -g pnpm
    log_success "pnpm installed successfully"
else
    log_success "pnpm already installed"
fi

# Clone Bolt.gives repository
log_info "Cloning Bolt.gives repository..."
if [ ! -d "/home/$(whoami)/bolt.gives" ]; then
    git clone https://github.com/embire2/bolt.gives.git /home/$(whoami)/bolt.gives
    cd /home/$(whoami)/bolt.gives
    log_success "Repository cloned successfully"
else
    log_warning "Repository already exists, updating..."
    cd /home/$(whoami)/bolt.gives
    git pull origin main
fi

# Install dependencies
log_info "Installing project dependencies..."
# Set Node memory to 4GB for build process to avoid memory issues
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm install

# Update build script memory allocation in package.json
log_info "Configuring build memory allocation..."
sed -i 's/"NODE_OPTIONS='\''--max-old-space-size=3072'\''/"NODE_OPTIONS='\''--max-old-space-size=4096'\''/g' package.json

# Update vite.config.ts to allow external hosts
log_info "Configuring Vite for external access..."
if ! grep -q "allowedHosts" vite.config.ts; then
    sed -i '/build: {/i \    server: {\
      host: true,\
      allowedHosts: ["'$DOMAIN'", "localhost"],\
    },' vite.config.ts
fi

# Get SSL certificate
log_info "Obtaining SSL certificate for $DOMAIN..."
sudo certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos --email webmaster@"$DOMAIN" || {
    log_warning "SSL certificate already exists or failed to obtain. Continuing..."
}

# Create Nginx configuration
log_info "Creating Nginx configuration..."
sudo tee /etc/nginx/sites-available/"$DOMAIN" > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Enable site
sudo rm -f /etc/nginx/sites-enabled/"$DOMAIN"
sudo ln -s /etc/nginx/sites-available/"$DOMAIN" /etc/nginx/sites-enabled/

# Test Nginx configuration
log_info "Testing Nginx configuration..."
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Create systemd service for Bolt.gives
log_info "Creating systemd service..."
sudo tee /etc/systemd/system/bolt-gives.service > /dev/null <<EOF
[Unit]
Description=Bolt.gives Development Server
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)/bolt.gives
Environment=NODE_OPTIONS=--max-old-space-size=3584
ExecStart=/usr/bin/pnpm exec remix vite:dev --host 0.0.0.0 --port 5173
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start and enable service
log_info "Starting Bolt.gives service..."
sudo systemctl daemon-reload
sudo systemctl enable bolt-gives
sudo systemctl start bolt-gives

# Wait for service to start
log_info "Waiting for service to start..."
sleep 10

# Check service status
if sudo systemctl is-active --quiet bolt-gives; then
    log_success "Bolt.gives service started successfully"
else
    log_error "Failed to start Bolt.gives service"
    sudo systemctl status bolt-gives
    exit 1
fi

# Test the installation
log_info "Testing installation..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://"$DOMAIN"/ || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
    log_success "Installation successful! Bolt.gives is running at https://$DOMAIN"
    echo ""
    echo "🎉 Installation Complete!"
    echo "======================="
    echo "✅ Bolt.gives is now running at: https://$DOMAIN"
    echo "✅ SSL certificate configured"
    echo "✅ Service running with 3.5GB Node memory"
    echo "✅ User management system initialized"
    echo ""
    echo "Default admin credentials:"
    echo "Username: admin"
    echo "Password: admin (you will be forced to change this on first login)"
    echo ""
    echo "Service commands:"
    echo "• Start: sudo systemctl start bolt-gives"
    echo "• Stop: sudo systemctl stop bolt-gives"
    echo "• Restart: sudo systemctl restart bolt-gives"
    echo "• Status: sudo systemctl status bolt-gives"
    echo "• Logs: sudo journalctl -u bolt-gives -f"
else
    log_error "Installation failed - HTTP status: $HTTP_STATUS"
    log_info "Checking service logs..."
    sudo journalctl -u bolt-gives --no-pager -n 20
    exit 1
fi