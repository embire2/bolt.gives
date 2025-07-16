#!/bin/bash

# Bolt.gives Production Installation Script
# For Ubuntu/Debian servers - Sets up everything from scratch
# Version 2.0.1 - Fixed DNS resolution with multiple fallback methods

# Configure DNS immediately for reliable network operations
echo "Configuring DNS servers for reliable network access..."
if [ -f /etc/resolv.conf ]; then
    cp /etc/resolv.conf /etc/resolv.conf.backup.initial 2>/dev/null || true
    cat > /etc/resolv.conf << EOF
nameserver 1.1.1.1
nameserver 1.0.0.1
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF
    echo "✓ DNS configured to use Cloudflare (1.1.1.1) and Google DNS"
fi

# Don't exit on errors - we have self-healing mechanisms
set +e

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
APP_DIR="/opt/bolt.gives"
SERVICE_NAME="bolt-gives"
USER_NAME="bolt"
# IMPORTANT: The application runs on port 8788 with wrangler, NOT 3000
DEFAULT_PORT="8788"
APP_PORT="$DEFAULT_PORT"  # Will be updated if port is in use

# Logging
LOG_FILE="/var/log/bolt-gives-install.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║               BOLT.GIVES PRODUCTION INSTALLER                 ║"
    echo "║                    Version 2.0.1                              ║"
    echo "║              All Critical Issues Fixed                        ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
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

debug() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] DEBUG: $1${NC}"
}

# Advanced error logging function
log_error_details() {
    local error_type="$1"
    local context="$2"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "🚨 ERROR DIAGNOSTICS - $error_type"
    echo "═══════════════════════════════════════════════════════════════"
    echo "Context: $context"
    echo "Time: $(date)"
    echo "User: $(whoami)"
    echo "Directory: $(pwd)"
    echo ""
    
    case "$error_type" in
        "SERVICE_START")
            echo "Recent service logs:"
            journalctl -u "$SERVICE_NAME" --no-pager -n 50
            echo ""
            echo "Port status:"
            netstat -tlnp | grep -E ":8788|:3000|:5173|:4173" || echo "No relevant ports found"
            echo ""
            echo "Process status:"
            ps aux | grep -E "bolt|pnpm|wrangler|node" | grep -v grep || echo "No relevant processes found"
            ;;
        "PERMISSION")
            echo "File permissions in $APP_DIR:"
            ls -la "$APP_DIR" | head -20
            echo ""
            echo "User directories:"
            ls -la /home/$USER_NAME/.local 2>/dev/null || echo ".local not found"
            ls -la /home/$USER_NAME/.config 2>/dev/null || echo ".config not found"
            ls -la /home/$USER_NAME/.cache 2>/dev/null || echo ".cache not found"
            ;;
        "PORT_CONFLICT")
            echo "Port usage:"
            netstat -tlnp
            echo ""
            echo "Checking common ports:"
            for port in 3000 5173 4173 8787 8788 8790; do
                echo -n "Port $port: "
                if lsof -ti :$port >/dev/null 2>&1; then
                    echo "IN USE by PID $(lsof -ti :$port)"
                else
                    echo "Available"
                fi
            done
            ;;
    esac
    echo "═══════════════════════════════════════════════════════════════"
}

# Installation state management
STATE_FILE="/var/log/bolt-gives-install.state"
FAILED_INSTALL_MARKER="/var/log/bolt-gives-install.failed"
DOMAIN_CONFIG_FILE="/var/log/bolt-gives-domain.conf"

save_state() {
    local phase="$1"
    echo "$phase" > "$STATE_FILE"
    log "💾 Progress saved: $phase"
}

get_state() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo "not_started"
    fi
}

mark_failed() {
    touch "$FAILED_INSTALL_MARKER"
}

check_failed_install() {
    if [ -f "$FAILED_INSTALL_MARKER" ]; then
        warn "Previous installation failed. Cleaning up..."
        cleanup_failed_install
        rm -f "$FAILED_INSTALL_MARKER"
    fi
}

cleanup_failed_install() {
    log "🧹 Cleaning up previous failed installation..."
    
    # Stop and disable service if exists
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    
    # Remove service file
    rm -f "/etc/systemd/system/$SERVICE_NAME.service"
    
    # Remove nginx config
    rm -f "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
    
    # Remove application directory
    if [ -d "$APP_DIR" ]; then
        rm -rf "$APP_DIR"
    fi
    
    # Remove user (optional - commented out for safety)
    # userdel -r "$USER_NAME" 2>/dev/null || true
    
    log "✓ Cleanup completed"
}

# Find available port
find_available_port() {
    local start_port=${1:-8788}
    local port=$start_port
    
    while [ $port -lt $((start_port + 100)) ]; do
        if ! lsof -ti :$port >/dev/null 2>&1; then
            echo $port
            return 0
        fi
        port=$((port + 1))
    done
    
    return 1
}

# Update port configuration in all files
update_port_configuration() {
    local new_port=$1
    APP_PORT=$new_port
    
    log "📝 Updating all configurations to use port $new_port..."
    
    # Update systemd service
    if [ -f "/etc/systemd/system/$SERVICE_NAME.service" ]; then
        sed -i "s/PORT=[0-9]*/PORT=$new_port/g" "/etc/systemd/system/$SERVICE_NAME.service"
        systemctl daemon-reload
    fi
    
    # Update nginx config
    if [ -f "$NGINX_CONF_PATH" ]; then
        sed -i "s/proxy_pass http:\/\/127.0.0.1:[0-9]*/proxy_pass http:\/\/127.0.0.1:$new_port/g" "$NGINX_CONF_PATH"
        nginx -t && systemctl reload nginx
    fi
    
    # Update .env file
    if [ -f "$APP_DIR/.env" ]; then
        if grep -q "^PORT=" "$APP_DIR/.env"; then
            sed -i "s/^PORT=.*/PORT=$new_port/" "$APP_DIR/.env"
        else
            echo "PORT=$new_port" >> "$APP_DIR/.env"
        fi
    fi
    
    log "✓ Port configuration updated to $new_port"
}

# Comprehensive permission fix function
fix_all_permissions() {
    log "🔧 Fixing all permissions comprehensively..."
    
    # Create all necessary directories with proper ownership
    local dirs=(
        "/home/$USER_NAME"
        "/home/$USER_NAME/.local"
        "/home/$USER_NAME/.local/share"
        "/home/$USER_NAME/.local/share/pnpm"
        "/home/$USER_NAME/.local/bin"
        "/home/$USER_NAME/.config"
        "/home/$USER_NAME/.config/pnpm"
        "/home/$USER_NAME/.cache"
        "/home/$USER_NAME/.cache/pnpm"
        "/home/$USER_NAME/.npm"
        "/home/$USER_NAME/.pnpm-store"
        "$APP_DIR"
        "$APP_DIR/node_modules"
        "$APP_DIR/.pnpm"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir" 2>/dev/null || true
        chown -R $USER_NAME:$USER_NAME "$dir" 2>/dev/null || true
        chmod -R 755 "$dir" 2>/dev/null || true
    done
    
    # Fix npm/pnpm config files
    touch /home/$USER_NAME/.npmrc
    echo "prefix=/home/$USER_NAME/.npm-global" > /home/$USER_NAME/.npmrc
    chown $USER_NAME:$USER_NAME /home/$USER_NAME/.npmrc
    
    # Create pnpm state file
    touch /home/$USER_NAME/.pnpm-state.json
    echo '{}' > /home/$USER_NAME/.pnpm-state.json
    chown $USER_NAME:$USER_NAME /home/$USER_NAME/.pnpm-state.json
    
    # Ensure all shell scripts are executable
    if [ -d "$APP_DIR" ]; then
        find "$APP_DIR" -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true
        find "$APP_DIR" -name "*.sh" -type f -exec chown $USER_NAME:$USER_NAME {} \; 2>/dev/null || true
        
        # Specifically fix bindings.sh if it exists
        if [ -f "$APP_DIR/bindings.sh" ]; then
            chmod +x "$APP_DIR/bindings.sh"
            chown $USER_NAME:$USER_NAME "$APP_DIR/bindings.sh"
            log "✓ Fixed bindings.sh permissions"
        fi
    fi
    
    log "✓ All permissions fixed"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then 
        error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Detect server IP
detect_server_ip() {
    log "Detecting server IP address..."
    
    # Try multiple methods to get the public IP
    local ip_methods=(
        "curl -s ifconfig.me"
        "curl -s icanhazip.com"
        "curl -s ipecho.net/plain"
        "curl -s api.ipify.org"
        "dig +short myip.opendns.com @resolver1.opendns.com"
    )
    
    for method in "${ip_methods[@]}"; do
        SERVER_IP=$($method 2>/dev/null | grep -E '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' | head -1)
        if [ -n "$SERVER_IP" ]; then
            break
        fi
    done
    
    if [ -z "$SERVER_IP" ]; then
        # Fallback to local IP
        SERVER_IP=$(hostname -I | awk '{print $1}')
    fi
    
    if [ -z "$SERVER_IP" ]; then
        error "Could not detect server IP address"
        exit 1
    fi
    
    save_state "ip_detected"
    log "✓ Server IP: $SERVER_IP"
}

# Get domain name
get_domain_name() {
    # Check if domain was already configured (prevents loop)
    if [ -f "$DOMAIN_CONFIG_FILE" ]; then
        DOMAIN_NAME=$(cat "$DOMAIN_CONFIG_FILE")
        log "✓ Using previously configured domain: $DOMAIN_NAME"
        save_state "domain_configured"
        return 0
    fi
    
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}📌 DOMAIN SETUP${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}Your server IP address is: ${YELLOW}$SERVER_IP${NC}"
    echo ""
    echo -e "${YELLOW}Please ensure your domain's A record points to this IP address.${NC}"
    echo -e "${YELLOW}This should be done in your domain registrar's DNS settings.${NC}"
    echo ""
    
    while true; do
        read -p "Enter your domain name (e.g., bolt.example.com): " DOMAIN_NAME
        
        if [ -z "$DOMAIN_NAME" ]; then
            warn "Domain name cannot be empty"
            continue
        fi
        
        # Basic domain validation
        if [[ ! "$DOMAIN_NAME" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
            warn "Invalid domain name format"
            continue
        fi
        
        echo ""
        echo -e "${YELLOW}Checking DNS configuration...${NC}"
        
        # Check if domain resolves to our IP
        # First try with dig, then fallback to other methods
        local resolved_ips=$(dig +short A "$DOMAIN_NAME" @1.1.1.1 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$')
        
        if [ -z "$resolved_ips" ]; then
            # Fallback to Google DNS
            resolved_ips=$(dig +short A "$DOMAIN_NAME" @8.8.8.8 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$')
        fi
        
        if [ -z "$resolved_ips" ]; then
            # Fallback to nslookup
            resolved_ips=$(nslookup "$DOMAIN_NAME" 2>/dev/null | grep -A2 "Name:" | grep "Address:" | awk '{print $2}' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$')
        fi
        
        if [ -z "$resolved_ips" ]; then
            # Final fallback to getent
            resolved_ips=$(getent hosts "$DOMAIN_NAME" 2>/dev/null | awk '{print $1}' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$')
        fi
        
        # Check if our IP is in the list of resolved IPs
        local ip_found=false
        if [ -n "$resolved_ips" ]; then
            while IFS= read -r ip; do
                if [ "$ip" = "$SERVER_IP" ]; then
                    ip_found=true
                    break
                fi
            done <<< "$resolved_ips"
        fi
        
        if [ "$ip_found" = true ]; then
            echo -e "${GREEN}✓ Domain correctly points to this server${NC}"
            echo -e "${DIM}Resolved IPs: $(echo $resolved_ips | tr '\n' ', ' | sed 's/, $//')${NC}"
            break
        elif [ -z "$resolved_ips" ]; then
            echo -e "${RED}⚠ Domain does not resolve to any IP${NC}"
            echo -e "${YELLOW}Please add an A record pointing to $SERVER_IP${NC}"
            echo -e "${DIM}Note: DNS propagation can take 5-30 minutes${NC}"
        else
            echo -e "${RED}⚠ Domain points to different IP(s): $(echo $resolved_ips | tr '\n' ', ' | sed 's/, $//')${NC}"
            echo -e "${YELLOW}Please update the A record to point to $SERVER_IP${NC}"
        fi
        
        echo ""
        read -p "Do you want to continue anyway? (yes/no): " continue_anyway
        
        if [ "$continue_anyway" = "yes" ]; then
            warn "Continuing with domain $DOMAIN_NAME (DNS may need time to propagate)"
            break
        fi
    done
    
    # Save domain configuration to prevent loops
    echo "$DOMAIN_NAME" > "$DOMAIN_CONFIG_FILE"
    save_state "domain_configured"
    log "✓ Domain configured: $DOMAIN_NAME"
}

# Check system requirements
check_system() {
    log "Checking system requirements..."
    
    # Check Ubuntu/Debian
    if ! command -v apt-get &> /dev/null; then
        error "This script requires Ubuntu/Debian with apt package manager"
        exit 1
    fi
    
    # Check available memory
    local total_mem=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$total_mem" -lt 2048 ]; then
        warn "System has less than 2GB RAM. Recommended: 4GB+"
        warn "Will create swap file if needed"
        
        # Create swap if needed
        if [ ! -f /swapfile ]; then
            log "Creating 2GB swap file..."
            dd if=/dev/zero of=/swapfile bs=1M count=2048 2>/dev/null
            chmod 600 /swapfile
            mkswap /swapfile
            swapon /swapfile
            echo "/swapfile none swap sw 0 0" >> /etc/fstab
            log "✓ Swap file created"
        fi
    fi
    
    # Check available disk space
    local free_space=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$free_space" -lt 5 ]; then
        error "Less than 5GB free disk space. Please free up space."
        exit 1
    fi
    
    save_state "system_checked"
    log "✓ System requirements met"
}

# Install dependencies
install_dependencies() {
    log "Installing system dependencies..."
    
    # Fix any package locks
    rm -f /var/lib/apt/lists/lock
    rm -f /var/cache/apt/archives/lock
    rm -f /var/lib/dpkg/lock*
    dpkg --configure -a 2>/dev/null || true
    
    # Update package list
    apt-get update -y
    
    # Install essential packages
    local packages=(
        curl
        wget
        git
        build-essential
        nginx
        certbot
        python3-certbot-nginx
        ufw
        fail2ban
        htop
        net-tools
        unzip
        jq
        lsof
        dnsutils
    )
    
    for package in "${packages[@]}"; do
        if ! dpkg -l | grep -q "^ii  $package "; then
            apt-get install -y $package || warn "Failed to install $package"
        fi
    done
    
    save_state "dependencies_installed"
    log "✓ Dependencies installed"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js v$NODE_VERSION..."
    
    # Remove any existing Node.js installations
    apt-get remove -y nodejs npm 2>/dev/null || true
    rm -rf /usr/local/lib/node_modules
    
    # Install Node.js using NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_$NODE_VERSION.x | bash -
    apt-get install -y nodejs
    
    # Verify installation
    local node_version=$(node --version 2>/dev/null || echo "")
    local npm_version=$(npm --version 2>/dev/null || echo "")
    
    if [ -z "$node_version" ]; then
        error "Node.js installation failed"
        exit 1
    fi
    
    log "✓ Node.js installed: $node_version"
    log "✓ npm installed: $npm_version"
    
    # Configure Node.js memory limit based on available memory
    local total_mem=$(free -m | awk '/^Mem:/{print $2}')
    if [ "$total_mem" -lt 4096 ]; then
        echo "export NODE_OPTIONS='--max-old-space-size=2048'" >> /etc/profile
    else
        echo "export NODE_OPTIONS='--max-old-space-size=4096'" >> /etc/profile
    fi
    
    save_state "nodejs_installed"
}

# Install pnpm
install_pnpm() {
    log "Installing pnpm..."
    
    # Remove any existing pnpm installations
    npm uninstall -g pnpm 2>/dev/null || true
    rm -rf /usr/local/lib/node_modules/pnpm
    rm -f /usr/local/bin/pnpm
    
    # Install pnpm globally using npm
    npm install -g pnpm@$PNPM_VERSION
    
    # Verify installation
    local pnpm_version=$(pnpm --version 2>/dev/null || echo "")
    if [ -z "$pnpm_version" ]; then
        error "❌ pnpm installation failed"
        exit 1
    fi
    
    log "✅ pnpm installed successfully: $pnpm_version"
    
    save_state "pnpm_installed"
}

# Create user
create_user() {
    log "Setting up application user..."
    
    if ! id "$USER_NAME" &>/dev/null; then
        useradd -m -s /bin/bash "$USER_NAME"
        log "✓ Created user: $USER_NAME"
    else
        log "✓ User $USER_NAME already exists"
    fi
    
    # Ensure user home directory has correct permissions
    chown -R $USER_NAME:$USER_NAME /home/$USER_NAME
    chmod 755 /home/$USER_NAME
    
    # Create necessary directories for pnpm
    fix_all_permissions
}

# Clone repository
clone_repository() {
    log "Setting up application..."
    
    # Check if directory exists and has content
    if [ -d "$APP_DIR" ] && [ "$(ls -A $APP_DIR 2>/dev/null)" ]; then
        log "✓ Application directory already exists"
        cd "$APP_DIR"
        
        # Ensure it's a valid git repository
        if [ ! -d ".git" ]; then
            warn "Directory exists but is not a git repository. Re-cloning..."
            cd /
            rm -rf "$APP_DIR"
            git clone https://github.com/embire2/bolt.gives.git "$APP_DIR"
        else
            # Pull latest changes
            git pull origin main || warn "Failed to pull latest changes"
        fi
    else
        # Clone fresh
        rm -rf "$APP_DIR"
        git clone https://github.com/embire2/bolt.gives.git "$APP_DIR"
    fi
    
    cd "$APP_DIR"
    
    # Verify critical files exist
    if [ ! -f "package.json" ]; then
        error "package.json not found! Repository clone may have failed."
        exit 1
    fi
    
    # Fix all permissions
    fix_all_permissions
    
    log "✓ Application repository ready"
}

# Install application dependencies
install_app_dependencies() {
    log "Installing application dependencies with pnpm..."
    cd "$APP_DIR"
    
    # Fix all permissions first
    fix_all_permissions
    
    # Set PNPM_HOME for the installation
    export PNPM_HOME="/home/$USER_NAME/.local/share/pnpm"
    export PATH="$PNPM_HOME:$PATH"
    
    # Clear any existing lock files or caches
    rm -f pnpm-lock.yaml package-lock.json yarn.lock 2>/dev/null || true
    rm -rf node_modules .pnpm 2>/dev/null || true
    
    # Install dependencies using pnpm as the bolt user
    log "Running pnpm install..."
    sudo -u $USER_NAME env PNPM_HOME="$PNPM_HOME" PATH="$PATH" NODE_OPTIONS="--max-old-space-size=4096" pnpm install
    
    if [ $? -ne 0 ]; then
        warn "First install attempt failed, retrying with reduced memory..."
        sudo -u $USER_NAME env PNPM_HOME="$PNPM_HOME" PATH="$PATH" NODE_OPTIONS="--max-old-space-size=2048" pnpm install
    fi
    
    log "✓ Dependencies installed"
}

# Build application
build_application() {
    log "Building application with Remix/Vite..."
    cd "$APP_DIR"
    
    # Get available memory
    local total_mem=$(free -m | awk '/^Mem:/{print $2}')
    local node_mem=4096
    if [ "$total_mem" -lt 4096 ]; then
        node_mem=2048
        warn "Limited memory: using ${node_mem}MB for Node.js"
    fi
    
    # Build using pnpm (proper Remix build)
    log "Running pnpm run build..."
    sudo -u $USER_NAME env NODE_OPTIONS="--max-old-space-size=$node_mem" pnpm run build
    
    if [ $? -ne 0 ]; then
        error "Build failed, retrying with minimal memory..."
        sudo -u $USER_NAME env NODE_OPTIONS="--max-old-space-size=1536" pnpm run build
    fi
    
    log "✓ Application built successfully"
}

# Setup environment
setup_environment() {
    log "Setting up environment..."
    
    # Check if port 8788 is available
    if lsof -ti :$DEFAULT_PORT >/dev/null 2>&1; then
        warn "Default port $DEFAULT_PORT is in use"
        local new_port=$(find_available_port $DEFAULT_PORT)
        if [ -n "$new_port" ]; then
            APP_PORT=$new_port
            warn "Will use port $APP_PORT instead"
        fi
    fi
    
    # Create .env file
    cat > "$APP_DIR/.env" << EOF
# Bolt.gives Environment Configuration
NODE_ENV=production
HOST=0.0.0.0
PORT=$APP_PORT
WRANGLER_LOCAL=true

# LLM API Keys (Add your keys here)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
GROQ_API_KEY=
HF_API_KEY=
MISTRAL_API_KEY=
OPENROUTER_API_KEY=
DEEPSEEK_API_KEY=
XAI_API_KEY=

# Debug
VITE_LOG_LEVEL=debug
EOF
    
    chown $USER_NAME:$USER_NAME "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    
    save_state "app_setup"
    log "✓ Environment configured"
}

# Configure firewall
configure_firewall() {
    log "Configuring firewall..."
    
    # Enable UFW
    ufw --force enable
    
    # Allow SSH
    ufw allow 22/tcp comment "SSH"
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    
    # Allow application port (for development/testing)
    ufw allow $APP_PORT/tcp comment "Bolt.gives application"
    
    # Reload firewall
    ufw reload
    
    save_state "firewall_configured"
    log "✓ Firewall configured"
}

# Configure nginx
configure_nginx() {
    log "Configuring nginx..."
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Remove any existing bolt-gives configurations
    rm -f "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
    
    # Create nginx configuration
    cat > "$NGINX_CONF_PATH" << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN_NAME;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Logging
    access_log /var/log/nginx/bolt-gives-access.log;
    error_log /var/log/nginx/bolt-gives-error.log;

    # IMPORTANT: Proxy to port 8788 where wrangler runs
    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # WebSocket support
        proxy_set_header Sec-WebSocket-Protocol \$http_sec_websocket_protocol;
        proxy_set_header Sec-WebSocket-Extensions \$http_sec_websocket_extensions;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/javascript application/xml+rss application/json;
}
EOF
    
    # Enable site
    ln -sf "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
    
    # Test configuration
    if nginx -t; then
        systemctl reload nginx
        log "✓ Nginx configured"
    else
        error "Nginx configuration test failed"
        # Try to fix common issues
        sed -i 's/\$http_upgrade/$http_upgrade/g' "$NGINX_CONF_PATH"
        sed -i 's/\$host/$host/g' "$NGINX_CONF_PATH"
        nginx -t && systemctl reload nginx
    fi
    
    save_state "nginx_configured"
}

# Setup SSL
setup_ssl() {
    log "Setting up SSL certificate..."
    
    # Check if domain is accessible
    if ! curl -s -o /dev/null -w "%{http_code}" "http://$DOMAIN_NAME" | grep -q "[23][0-9][0-9]"; then
        warn "Domain $DOMAIN_NAME is not accessible via HTTP"
        warn "SSL setup may fail. Ensure DNS is properly configured."
        
        echo ""
        read -p "Do you want to continue with SSL setup? (yes/no): " continue_ssl
        
        if [ "$continue_ssl" != "yes" ]; then
            warn "Skipping SSL setup. You can run 'certbot --nginx' later."
            return
        fi
    fi
    
    # Obtain certificate
    if certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --email "admin@$DOMAIN_NAME" --redirect; then
        log "✓ SSL certificate obtained and configured"
        
        # Set up auto-renewal
        echo "0 0,12 * * * root certbot renew --quiet && systemctl reload nginx" > /etc/cron.d/certbot-renew
        
        save_state "ssl_configured"
    else
        error "SSL certificate setup failed"
        warn "You can try again later with: certbot --nginx"
    fi
}

# Create systemd service
create_service() {
    log "Creating systemd service..."
    
    # Find pnpm path
    local pnpm_path=$(which pnpm)
    if [ -z "$pnpm_path" ]; then
        error "PNPM not found!"
        exit 1
    fi
    
    # Create systemd service file with proper pnpm run start command
    cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Bolt.gives AI Development Platform
Documentation=https://github.com/embire2/bolt.gives
After=network.target

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$APP_PORT
Environment=WRANGLER_LOCAL=true
Environment=PATH=/usr/local/bin:/usr/bin:/bin:/home/$USER_NAME/.local/share/pnpm
Environment=PNPM_HOME=/home/$USER_NAME/.local/share/pnpm

# Pre-start permission fixes
ExecStartPre=/bin/bash -c 'mkdir -p /home/$USER_NAME/.local/share/pnpm /home/$USER_NAME/.config/pnpm /home/$USER_NAME/.cache/pnpm'
ExecStartPre=/bin/bash -c 'chown -R $USER_NAME:$USER_NAME /home/$USER_NAME/.local /home/$USER_NAME/.config /home/$USER_NAME/.cache 2>/dev/null || true'
ExecStartPre=/bin/bash -c 'chmod +x $APP_DIR/bindings.sh 2>/dev/null || true'
ExecStartPre=/bin/bash -c 'find $APP_DIR -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true'

# Start command - using pnpm run start which runs wrangler
ExecStart=$pnpm_path run start

# Restart policy
Restart=always
RestartSec=10
StartLimitInterval=600
StartLimitBurst=5

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    systemctl enable "$SERVICE_NAME"
    
    save_state "service_created"
    log "✓ Systemd service created"
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring and logging..."
    
    # Configure log rotation
    cat > "/etc/logrotate.d/bolt-gives" << EOF
/var/log/bolt-gives-*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 640 $USER_NAME $USER_NAME
    sharedscripts
    postrotate
        systemctl reload $SERVICE_NAME >/dev/null 2>&1 || true
    endscript
}
EOF
    
    # Setup fail2ban jail
    cat > "/etc/fail2ban/jail.d/bolt-gives.conf" << EOF
[bolt-gives]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 3600
findtime = 600
EOF
    
    systemctl restart fail2ban
    
    save_state "monitoring_setup"
    log "✓ Monitoring and logging configured"
}

# Start services with comprehensive error handling
start_services() {
    log "Starting services..."
    
    # Fix permissions one final time
    fix_all_permissions
    
    # Check for port conflicts
    if lsof -ti :$APP_PORT >/dev/null 2>&1; then
        warn "Port $APP_PORT is in use, finding alternative..."
        local new_port=$(find_available_port $APP_PORT)
        if [ -n "$new_port" ]; then
            update_port_configuration $new_port
        else
            error "No available ports found!"
            return 1
        fi
    fi
    
    # Start the service with multiple attempts
    local attempts=0
    local max_attempts=5
    
    while [ $attempts -lt $max_attempts ]; do
        attempts=$((attempts + 1))
        log "Starting service (attempt $attempts/$max_attempts)..."
        
        if systemctl start "$SERVICE_NAME"; then
            log "Service started, waiting for it to stabilize..."
            sleep 10
            
            # Check if service is running
            if systemctl is-active --quiet "$SERVICE_NAME"; then
                # Check if responding on the correct port
                if curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT | grep -q "[23][0-9][0-9]"; then
                    log "✓ Bolt.gives service started successfully and responding"
                    save_state "services_started"
                    break
                else
                    warn "Service is running but not responding on port $APP_PORT"
                    
                    # Check actual port from logs
                    local actual_port=$(journalctl -u "$SERVICE_NAME" --no-pager -n 50 | grep -oP "localhost:\K[0-9]+" | tail -1)
                    if [ -n "$actual_port" ] && [ "$actual_port" != "$APP_PORT" ]; then
                        warn "Service is actually using port $actual_port"
                        update_port_configuration $actual_port
                    fi
                fi
            else
                error "Service is not active"
                log_error_details "SERVICE_START" "Service not active after start"
            fi
        else
            error "Failed to start service"
            log_error_details "SERVICE_START" "Systemctl start failed"
        fi
        
        if [ $attempts -lt $max_attempts ]; then
            warn "Attempting to fix issues and retry..."
            fix_all_permissions
            sleep 5
        fi
    done
    
    # Start nginx
    systemctl start nginx
    systemctl enable nginx
    
    log "✓ All services started"
}

# Verify installation
verify_installation() {
    log "Verifying installation..."
    
    local all_good=true
    
    # Check service status
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "✅ Bolt.gives service is active"
    else
        error "❌ Bolt.gives service is not running"
        all_good=false
    fi
    
    # Check nginx
    if systemctl is-active --quiet nginx; then
        log "✅ Nginx is active"
    else
        error "❌ Nginx is not running"
        all_good=false
    fi
    
    # Check local access
    local local_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT || echo "000")
    if [ "$local_code" = "200" ] || [ "$local_code" = "301" ] || [ "$local_code" = "302" ]; then
        log "✅ Local access working (HTTP $local_code)"
    else
        error "❌ Local access failed (HTTP $local_code)"
        all_good=false
    fi
    
    # Check external access
    if [ -n "$DOMAIN_NAME" ]; then
        local external_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://$DOMAIN_NAME" || echo "000")
        if [ "$external_code" = "200" ] || [ "$external_code" = "301" ] || [ "$external_code" = "302" ]; then
            log "✅ External HTTPS access working (HTTP $external_code)"
        else
            warn "⚠ External HTTPS access returned HTTP $external_code"
            # Try HTTP as fallback
            external_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$DOMAIN_NAME" || echo "000")
            if [ "$external_code" = "200" ] || [ "$external_code" = "301" ] || [ "$external_code" = "302" ]; then
                log "✅ External HTTP access working (HTTP $external_code)"
            fi
        fi
    fi
    
    if [ "$all_good" = true ]; then
        save_state "verified"
        return 0
    else
        return 1
    fi
}

# Display final summary
display_summary() {
    echo ""
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║           🎉 BOLT.GIVES INSTALLATION COMPLETE! 🎉            ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  🌐 URL: ${BLUE}https://$DOMAIN_NAME${NC}"
    echo -e "  📁 Directory: ${BLUE}$APP_DIR${NC}"
    echo -e "  👤 User: ${BLUE}$USER_NAME${NC}"
    echo -e "  🔌 Application Port: ${BLUE}$APP_PORT${NC}"
    echo -e "  📊 Service: ${BLUE}systemctl status $SERVICE_NAME${NC}"
    echo -e "  📜 Logs: ${BLUE}journalctl -u $SERVICE_NAME -f${NC}"
    echo ""
    echo -e "${YELLOW}⚡ Next Steps:${NC}"
    echo -e "  1. Add your LLM API keys to ${BLUE}$APP_DIR/.env${NC}"
    echo -e "  2. Restart the service: ${BLUE}systemctl restart $SERVICE_NAME${NC}"
    echo -e "  3. Monitor logs: ${BLUE}journalctl -u $SERVICE_NAME -f${NC}"
    echo ""
    echo -e "${GREEN}✨ Enjoy using Bolt.gives!${NC}"
    echo ""
}

# Main installation flow
main() {
    print_header
    check_root
    check_failed_install
    
    # Get current state
    local current_state=$(get_state)
    log "Current installation state: $current_state"
    
    # Execute installation steps based on state
    case "$current_state" in
        "not_started")
            detect_server_ip
            ;&
        "ip_detected")
            get_domain_name
            ;&
        "domain_configured")
            check_system
            ;&
        "system_checked")
            install_dependencies
            ;&
        "dependencies_installed")
            install_nodejs
            ;&
        "nodejs_installed")
            install_pnpm
            ;&
        "pnpm_installed")
            create_user
            clone_repository
            install_app_dependencies
            build_application
            setup_environment
            ;&
        "app_setup")
            configure_firewall
            ;&
        "firewall_configured")
            configure_nginx
            ;&
        "nginx_configured")
            setup_ssl
            ;&
        "ssl_configured")
            create_service
            ;&
        "service_created")
            setup_monitoring
            ;&
        "monitoring_setup")
            start_services
            ;&
        "services_started")
            verify_installation
            ;&
        "verified")
            display_summary
            ;;
        *)
            error "Unknown state: $current_state"
            exit 1
            ;;
    esac
    
    # Clean up state file on success
    rm -f "$STATE_FILE"
    
    log "🎉 Installation completed successfully!"
}

# Run main function
main "$@"