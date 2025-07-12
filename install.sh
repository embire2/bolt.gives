#!/bin/bash

# Bolt.gives Comprehensive Installation Script
# For Ubuntu/Debian servers - Sets up everything from scratch
# Self-healing with comprehensive error handling

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NODE_VERSION="20"
PNPM_VERSION="latest"
NGINX_CONF_PATH="/etc/nginx/sites-available/bolt-gives"
NGINX_ENABLED_PATH="/etc/nginx/sites-enabled/bolt-gives"
APP_DIR="/opt/bolt-gives"
SERVICE_NAME="bolt-gives"
USER_NAME="bolt"

# Logging
LOG_FILE="/var/log/bolt-gives-install.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    BOLT.GIVES INSTALLER                       ║"
    echo "║              Comprehensive Ubuntu/Debian Setup               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Error handling with retry mechanism
retry_command() {
    local max_attempts=3
    local delay=5
    local command="$1"
    local description="$2"
    
    for ((i=1; i<=max_attempts; i++)); do
        log "Attempting: $description (Try $i/$max_attempts)"
        if eval "$command"; then
            log "Success: $description"
            return 0
        else
            if [ $i -eq $max_attempts ]; then
                error "Failed: $description after $max_attempts attempts"
                return 1
            else
                warn "Failed: $description. Retrying in ${delay}s..."
                sleep $delay
            fi
        fi
    done
}

# Detect server IP address
detect_server_ip() {
    log "Detecting server IP address..."
    
    # Try multiple methods to get public IP
    local ip=""
    
    # Method 1: curl to ipinfo.io
    if command -v curl >/dev/null 2>&1; then
        ip=$(curl -s --connect-timeout 10 ipinfo.io/ip 2>/dev/null || echo "")
    fi
    
    # Method 2: wget to icanhazip.com
    if [ -z "$ip" ] && command -v wget >/dev/null 2>&1; then
        ip=$(wget -qO- --timeout=10 icanhazip.com 2>/dev/null || echo "")
    fi
    
    # Method 3: dig method
    if [ -z "$ip" ] && command -v dig >/dev/null 2>&1; then
        ip=$(dig +short myip.opendns.com @resolver1.opendns.com 2>/dev/null || echo "")
    fi
    
    # Method 4: ip route method (for local IP)
    if [ -z "$ip" ]; then
        ip=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' || echo "")
    fi
    
    if [ -z "$ip" ]; then
        error "Could not detect server IP address"
        echo "Please manually check your server's public IP address"
        exit 1
    fi
    
    SERVER_IP="$ip"
    log "Detected server IP: $SERVER_IP"
}

# Get domain from user
get_domain() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    DOMAIN CONFIGURATION                       ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo -e "${YELLOW}IMPORTANT: Before proceeding, you need to configure your domain's DNS settings.${NC}"
    echo ""
    echo -e "Your server's public IP address is: ${GREEN}$SERVER_IP${NC}"
    echo ""
    echo "Please create an A record for your domain pointing to this IP address:"
    echo -e "  ${BLUE}Type: A${NC}"
    echo -e "  ${BLUE}Name: @ (or your subdomain)${NC}"
    echo -e "  ${BLUE}Value: $SERVER_IP${NC}"
    echo -e "  ${BLUE}TTL: 300 (or your DNS provider's minimum)${NC}"
    echo ""
    echo "Wait for DNS propagation (usually 5-15 minutes) before continuing."
    echo ""
    
    while true; do
        read -p "Enter your domain name (e.g., example.com or app.example.com): " DOMAIN
        
        if [ -z "$DOMAIN" ]; then
            error "Domain cannot be empty"
            continue
        fi
        
        # Basic domain validation
        if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$ ]] && [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$ ]]; then
            error "Invalid domain format. Please enter a valid domain (e.g., example.com)"
            continue
        fi
        
        # Check if domain resolves to our IP
        log "Checking DNS propagation for $DOMAIN..."
        local resolved_ip=$(dig +short "$DOMAIN" @8.8.8.8 2>/dev/null | tail -n1)
        
        if [ "$resolved_ip" = "$SERVER_IP" ]; then
            log "✓ DNS correctly configured for $DOMAIN"
            break
        else
            warn "DNS not yet propagated or incorrectly configured."
            echo "Domain $DOMAIN resolves to: $resolved_ip"
            echo "Expected IP: $SERVER_IP"
            echo ""
            read -p "Continue anyway? (y/N): " continue_anyway
            if [[ "$continue_anyway" =~ ^[Yy]$ ]]; then
                warn "Continuing without DNS verification. SSL certificate may fail."
                break
            fi
        fi
    done
    
    log "Using domain: $DOMAIN"
}

# Check system compatibility
check_system() {
    log "Checking system compatibility..."
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        error "This script must be run as root. Use: sudo $0"
        exit 1
    fi
    
    # Check OS
    if [ ! -f /etc/os-release ]; then
        error "Cannot determine OS version"
        exit 1
    fi
    
    source /etc/os-release
    
    case "$ID" in
        ubuntu|debian)
            log "✓ Compatible OS detected: $PRETTY_NAME"
            ;;
        *)
            error "Unsupported OS: $PRETTY_NAME. This script supports Ubuntu and Debian only."
            exit 1
            ;;
    esac
    
    # Check available disk space (minimum 5GB)
    local available_space=$(df / | awk 'NR==2{print $4}')
    local required_space=$((5 * 1024 * 1024)) # 5GB in KB
    
    if [ "$available_space" -lt "$required_space" ]; then
        error "Insufficient disk space. Required: 5GB, Available: $(($available_space / 1024 / 1024))GB"
        exit 1
    fi
    
    log "✓ System compatibility check passed"
}

# Update system
update_system() {
    log "Updating system packages..."
    
    # Fix any broken packages first
    retry_command "dpkg --configure -a" "Configuring packages"
    retry_command "apt-get update --fix-missing" "Updating package lists"
    retry_command "apt-get install -f -y" "Fixing broken packages"
    
    # Update packages
    retry_command "apt-get update" "Updating package lists"
    retry_command "DEBIAN_FRONTEND=noninteractive apt-get upgrade -y" "Upgrading packages"
    
    log "✓ System updated successfully"
}

# Install dependencies
install_dependencies() {
    log "Installing system dependencies..."
    
    local packages=(
        "curl"
        "wget"
        "git"
        "build-essential"
        "software-properties-common"
        "apt-transport-https"
        "ca-certificates"
        "gnupg"
        "lsb-release"
        "ufw"
        "nginx"
        "certbot"
        "python3-certbot-nginx"
        "htop"
        "unzip"
        "supervisor"
        "fail2ban"
        "logrotate"
        "rsync"
    )
    
    for package in "${packages[@]}"; do
        retry_command "DEBIAN_FRONTEND=noninteractive apt-get install -y $package" "Installing $package"
    done
    
    log "✓ Dependencies installed successfully"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js $NODE_VERSION..."
    
    # Remove any existing Node.js installations
    apt-get remove -y nodejs npm 2>/dev/null || true
    
    # Install NodeSource repository
    retry_command "curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -" "Adding NodeSource repository"
    retry_command "apt-get install -y nodejs" "Installing Node.js"
    
    # Verify installation
    local node_version=$(node --version 2>/dev/null || echo "")
    local npm_version=$(npm --version 2>/dev/null || echo "")
    
    if [ -z "$node_version" ] || [ -z "$npm_version" ]; then
        error "Node.js installation failed"
        exit 1
    fi
    
    log "✓ Node.js installed: $node_version"
    log "✓ npm installed: $npm_version"
    
    # Configure Node.js memory limit
    export NODE_OPTIONS="--max-old-space-size=4096"
    echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> /etc/environment
    
    log "✓ Node.js memory limit set to 4GB"
}

# Install pnpm
install_pnpm() {
    log "Installing pnpm..."
    
    retry_command "npm install -g pnpm@$PNPM_VERSION" "Installing pnpm globally"
    
    local pnpm_version=$(pnpm --version 2>/dev/null || echo "")
    if [ -z "$pnpm_version" ]; then
        error "pnpm installation failed"
        exit 1
    fi
    
    log "✓ pnpm installed: $pnpm_version"
}

# Create application user
create_app_user() {
    log "Creating application user..."
    
    if id "$USER_NAME" &>/dev/null; then
        log "User $USER_NAME already exists"
    else
        useradd -r -m -s /bin/bash "$USER_NAME"
        log "✓ Created user: $USER_NAME"
    fi
    
    # Add user to necessary groups
    usermod -aG www-data "$USER_NAME"
    
    # Create application directory
    mkdir -p "$APP_DIR"
    chown "$USER_NAME:$USER_NAME" "$APP_DIR"
    
    log "✓ Application user configured"
}

# Clone and setup application
setup_application() {
    log "Setting up Bolt.gives application..."
    
    # Clone repository
    if [ -d "$APP_DIR/.git" ]; then
        log "Repository already exists, updating..."
        cd "$APP_DIR"
        sudo -u "$USER_NAME" git pull origin main
    else
        log "Cloning repository..."
        sudo -u "$USER_NAME" git clone https://github.com/embire2/bolt.gives.git "$APP_DIR"
    fi
    
    cd "$APP_DIR"
    
    # Install dependencies
    log "Installing application dependencies..."
    sudo -u "$USER_NAME" NODE_OPTIONS="--max-old-space-size=4096" pnpm install
    
    # Build application
    log "Building application..."
    sudo -u "$USER_NAME" NODE_OPTIONS="--max-old-space-size=4096" pnpm run build
    
    # Create environment file
    if [ ! -f ".env" ]; then
        log "Creating environment configuration..."
        sudo -u "$USER_NAME" cat > .env << EOF
# Production environment
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Node.js memory settings
NODE_OPTIONS="--max-old-space-size=4096"

# Application settings
VITE_LOG_LEVEL=info
EOF
        chown "$USER_NAME:$USER_NAME" .env
    fi
    
    log "✓ Application setup completed"
}

# Configure firewall
configure_firewall() {
    log "Configuring firewall..."
    
    # Reset firewall
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (be careful not to lock ourselves out)
    ufw allow ssh
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow specific ports if needed
    ufw allow 3000/tcp comment "Bolt.gives application"
    
    # Enable firewall
    ufw --force enable
    
    log "✓ Firewall configured"
}

# Configure Nginx
configure_nginx() {
    log "Configuring Nginx..."
    
    # Backup existing nginx configuration if it exists
    if [ -f "$NGINX_CONF_PATH" ]; then
        cp "$NGINX_CONF_PATH" "${NGINX_CONF_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
        log "Backed up existing nginx configuration"
    fi
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Create Nginx configuration
    cat > "$NGINX_CONF_PATH" << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Client upload limit
    client_max_body_size 50M;
    
    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF
    
    # Enable site
    ln -sf "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
    
    # Test Nginx configuration
    if ! nginx -t; then
        error "Nginx configuration test failed"
        
        # Restore backup if it exists
        local backup_file=$(ls "${NGINX_CONF_PATH}.backup."* 2>/dev/null | head -1)
        if [ -n "$backup_file" ]; then
            log "Restoring backup configuration..."
            cp "$backup_file" "$NGINX_CONF_PATH"
            if nginx -t; then
                log "✓ Backup configuration restored successfully"
            else
                error "Backup configuration also failed. Removing invalid configuration."
                rm -f "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
            fi
        else
            # Remove invalid configuration
            rm -f "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
        fi
        
        # Try to start nginx with default configuration
        systemctl restart nginx || true
        return 1
    fi
    
    # Start and enable Nginx
    systemctl enable nginx
    systemctl restart nginx
    
    # Verify nginx is running
    if ! systemctl is-active --quiet nginx; then
        error "Failed to start nginx service"
        return 1
    fi
    
    log "✓ Nginx configured and started"
}

# Setup SSL certificate
setup_ssl() {
    log "Setting up SSL certificate with Let's Encrypt..."
    
    # Stop nginx temporarily for standalone challenge
    systemctl stop nginx
    
    # Obtain certificate
    if certbot certonly --standalone --non-interactive --agree-tos --email "admin@$DOMAIN" -d "$DOMAIN"; then
        log "✓ SSL certificate obtained successfully"
    else
        error "Failed to obtain SSL certificate"
        # Start nginx back up even if SSL fails
        systemctl start nginx
        return 1
    fi
    
    # Update Nginx configuration for SSL
    cat > "$NGINX_CONF_PATH" << EOF
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Client upload limit
    client_max_body_size 50M;
    
    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF
    
    # Test and restart Nginx
    if nginx -t; then
        systemctl start nginx
        
        # Verify nginx is running
        if systemctl is-active --quiet nginx; then
            log "✓ SSL certificate configured in Nginx"
        else
            error "Failed to start nginx after SSL configuration"
            return 1
        fi
    else
        error "Nginx configuration test failed after SSL setup"
        
        # Restore to HTTP-only configuration
        log "Restoring HTTP-only configuration..."
        cat > "$NGINX_CONF_PATH" << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Client upload limit
    client_max_body_size 50M;
    
    # Proxy settings
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF
        
        if nginx -t; then
            systemctl start nginx
            warn "Restored to HTTP-only configuration. SSL setup failed."
            return 1
        else
            error "Failed to restore HTTP configuration. Manual intervention required."
            return 1
        fi
    fi
    
    # Setup auto-renewal
    if ! crontab -l | grep -q "certbot renew"; then
        (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
        log "✓ SSL auto-renewal configured"
    fi
}

# Create systemd service
create_systemd_service() {
    log "Creating systemd service..."
    
    cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Bolt.gives Application
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=NODE_OPTIONS="--max-old-space-size=4096"
Environment=PORT=3000
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/pnpm run start
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=$SERVICE_NAME

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"
    
    log "✓ Systemd service created"
}

# Configure monitoring and logging
setup_monitoring() {
    log "Setting up monitoring and logging..."
    
    # Configure log rotation for application
    cat > "/etc/logrotate.d/$SERVICE_NAME" << EOF
/var/log/$SERVICE_NAME.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    copytruncate
}
EOF
    
    # Configure fail2ban for additional security
    cat > "/etc/fail2ban/jail.d/$SERVICE_NAME.conf" << EOF
[$SERVICE_NAME]
enabled = true
port = 80,443
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 3600
findtime = 600
EOF
    
    systemctl restart fail2ban
    
    log "✓ Monitoring and logging configured"
}

# Start services
start_services() {
    log "Starting services..."
    
    # Start application
    systemctl start "$SERVICE_NAME"
    
    # Check if services are running
    sleep 5
    
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "✓ Bolt.gives service started successfully"
    else
        error "Failed to start Bolt.gives service"
        journalctl -u "$SERVICE_NAME" --no-pager -n 20
        exit 1
    fi
    
    if systemctl is-active --quiet nginx; then
        log "✓ Nginx service is running"
    else
        error "Nginx service is not running"
        exit 1
    fi
}

# Final verification
verify_installation() {
    log "Verifying installation..."
    
    # Test local application
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" || echo "000")
    if [ "$http_code" = "200" ] || [ "$http_code" = "301" ]; then
        log "✓ Application is responding locally"
    else
        warn "Application may not be responding correctly (HTTP $http_code)"
    fi
    
    # Test external access
    local external_code=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN" || echo "000")
    if [ "$external_code" = "200" ]; then
        log "✓ Application is accessible externally via HTTPS"
    else
        warn "External HTTPS access may not be working correctly (HTTP $external_code)"
    fi
    
    log "✓ Installation verification completed"
}

# Cleanup function
cleanup() {
    log "Cleaning up temporary files..."
    apt-get autoremove -y
    apt-get autoclean
    
    # Clear package cache
    rm -rf /var/lib/apt/lists/*
    
    log "✓ Cleanup completed"
}

# Print final information
print_success() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    INSTALLATION COMPLETE!                    ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${BLUE}🎉 Bolt.gives has been successfully installed!${NC}"
    echo ""
    echo -e "${YELLOW}Access your application:${NC}"
    echo -e "  🌐 HTTPS: ${GREEN}https://$DOMAIN${NC}"
    echo -e "  🔒 HTTP: ${GREEN}http://$DOMAIN${NC} (redirects to HTTPS)"
    echo ""
    echo -e "${YELLOW}Service Management:${NC}"
    echo -e "  📊 Status: ${BLUE}systemctl status $SERVICE_NAME${NC}"
    echo -e "  🔄 Restart: ${BLUE}systemctl restart $SERVICE_NAME${NC}"
    echo -e "  📋 Logs: ${BLUE}journalctl -u $SERVICE_NAME -f${NC}"
    echo ""
    echo -e "${YELLOW}Important Information:${NC}"
    echo -e "  📁 App Directory: ${BLUE}$APP_DIR${NC}"
    echo -e "  👤 App User: ${BLUE}$USER_NAME${NC}"
    echo -e "  💾 Node Memory: ${BLUE}4GB${NC}"
    echo -e "  🔐 SSL: ${BLUE}Auto-renewal configured${NC}"
    echo -e "  📝 Install Log: ${BLUE}$LOG_FILE${NC}"
    echo ""
    echo -e "${GREEN}✅ Your Bolt.gives installation is ready to use!${NC}"
}

# Main installation flow
main() {
    print_header
    
    # Detect server IP first
    detect_server_ip
    
    # Get domain configuration
    get_domain
    
    # System checks and setup
    check_system
    update_system
    install_dependencies
    
    # Install runtime
    install_nodejs
    install_pnpm
    
    # Application setup
    create_app_user
    setup_application
    
    # Security and web server
    configure_firewall
    if ! configure_nginx; then
        error "Nginx configuration failed. Continuing without web server proxy."
        warn "You may need to manually configure nginx later."
        warn "The application will still be accessible on port 3000."
    else
        # Only attempt SSL setup if nginx configuration succeeded
        if ! setup_ssl; then
            warn "SSL setup failed. Application accessible via HTTP only."
            warn "You can manually configure SSL later using: certbot --nginx -d $DOMAIN"
        fi
    fi
    
    # Service management
    create_systemd_service
    setup_monitoring
    
    # Start everything
    start_services
    
    # Verification and cleanup
    verify_installation
    cleanup
    
    # Success message
    print_success
}

# Trap errors and cleanup
trap 'error "Installation failed at line $LINENO. Check $LOG_FILE for details."; exit 1' ERR

# Run main installation
main "$@"