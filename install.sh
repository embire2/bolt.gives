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

# Advanced retry with exponential backoff and custom error handling
retry_with_backoff() {
    local max_attempts=5
    local delay=2
    local command="$1"
    local description="$2"
    local error_handler="$3"
    
    for ((i=1; i<=max_attempts; i++)); do
        log "Attempting: $description (Try $i/$max_attempts)"
        if eval "$command"; then
            log "Success: $description"
            return 0
        else
            local exit_code=$?
            if [ $i -eq $max_attempts ]; then
                error "Failed: $description after $max_attempts attempts (Exit code: $exit_code)"
                if [ -n "$error_handler" ]; then
                    log "Running error handler for: $description"
                    eval "$error_handler"
                fi
                return 1
            else
                warn "Failed: $description (Exit code: $exit_code). Retrying in ${delay}s..."
                sleep $delay
                delay=$((delay * 2))  # Exponential backoff
            fi
        fi
    done
}

# Self-healing function to fix common issues
self_heal() {
    local issue="$1"
    log "Self-healing: Attempting to fix $issue"
    
    case "$issue" in
        "nginx_config")
            log "Fixing nginx configuration issues..."
            # Remove all potentially problematic configurations
            rm -f /etc/nginx/sites-enabled/bolt-gives*
            rm -f /etc/nginx/sites-available/bolt-gives*
            rm -f /etc/nginx/sites-enabled/default
            
            # Reset nginx to clean state
            nginx -s stop 2>/dev/null || true
            sleep 2
            systemctl start nginx || true
            ;;
            
        "port_conflict")
            log "Checking for port conflicts..."
            local pids=$(lsof -ti :3000 2>/dev/null || true)
            if [ -n "$pids" ]; then
                warn "Found processes using port 3000: $pids"
                for pid in $pids; do
                    local process_name=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
                    warn "Killing process $pid ($process_name) using port 3000"
                    kill -9 $pid 2>/dev/null || true
                done
                sleep 2
            fi
            ;;
            
        "package_locks")
            log "Fixing package manager locks..."
            rm -f /var/lib/dpkg/lock-frontend
            rm -f /var/lib/dpkg/lock
            rm -f /var/cache/apt/archives/lock
            rm -f /var/lib/apt/lists/lock
            dpkg --configure -a
            ;;
            
        "dns_resolution")
            log "Fixing DNS resolution..."
            echo "nameserver 8.8.8.8" >> /etc/resolv.conf
            echo "nameserver 8.8.4.4" >> /etc/resolv.conf
            systemctl restart systemd-resolved 2>/dev/null || true
            ;;
            
        "memory_issues")
            log "Optimizing memory usage..."
            # Clear package cache
            apt-get clean
            apt-get autoremove -y
            
            # Clear system caches
            sync && echo 3 > /proc/sys/vm/drop_caches
            
            # Increase swap if needed
            local swap_size=$(free -m | awk '/^Swap:/ {print $2}')
            if [ "$swap_size" -lt 2048 ]; then
                log "Creating 2GB swap file..."
                fallocate -l 2G /swapfile
                chmod 600 /swapfile
                mkswap /swapfile
                swapon /swapfile
                echo '/swapfile none swap sw 0 0' >> /etc/fstab
            fi
            ;;
            
        *)
            warn "Unknown issue: $issue"
            ;;
    esac
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
        warn "Insufficient disk space. Required: 5GB, Available: $(($available_space / 1024 / 1024))GB"
        
        # Try to free up space
        log "Attempting to free up disk space..."
        apt-get clean
        apt-get autoremove -y
        rm -rf /var/log/*.gz
        rm -rf /var/log/*.[0-9]
        
        # Recheck
        available_space=$(df / | awk 'NR==2{print $4}')
        if [ "$available_space" -lt "$required_space" ]; then
            error "Still insufficient disk space after cleanup"
            exit 1
        else
            log "✓ Freed up enough disk space"
        fi
    fi
    
    # Check memory
    local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
    if [ "$total_mem" -lt 1024 ]; then
        warn "Low memory detected: ${total_mem}MB. Minimum recommended: 2GB"
        warn "Installation will continue but may be slow"
        
        # Enable swap if not present
        if [ $(free -m | awk '/^Swap:/ {print $2}') -eq 0 ]; then
            self_heal "memory_issues"
        fi
    fi
    
    log "✓ System compatibility check passed"
}

# Update system
update_system() {
    log "Updating system packages..."
    
    # Self-heal package locks if needed
    if ! dpkg --configure -a 2>/dev/null; then
        self_heal "package_locks"
    fi
    
    # Fix any broken packages first
    retry_with_backoff "dpkg --configure -a" "Configuring packages" "self_heal package_locks"
    retry_with_backoff "apt-get update --fix-missing" "Updating package lists" "self_heal dns_resolution"
    retry_with_backoff "apt-get install -f -y" "Fixing broken packages"
    
    # Update packages
    retry_with_backoff "apt-get update" "Updating package lists"
    retry_with_backoff "DEBIAN_FRONTEND=noninteractive apt-get upgrade -y" "Upgrading packages"
    
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
    
    # Clear any old NodeSource repositories
    rm -f /etc/apt/sources.list.d/nodesource.list*
    
    # Install NodeSource repository with retry and error handling
    local nodejs_setup_url="https://deb.nodesource.com/setup_${NODE_VERSION}.x"
    
    retry_with_backoff "curl -fsSL $nodejs_setup_url | bash -" "Adding NodeSource repository" "self_heal dns_resolution"
    
    # Install Node.js with memory optimization
    if ! retry_with_backoff "apt-get install -y nodejs" "Installing Node.js"; then
        warn "Standard installation failed, trying alternative method..."
        
        # Alternative installation method
        curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}.0.0/node-v${NODE_VERSION}.0.0-linux-x64.tar.xz -o /tmp/node.tar.xz
        tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
        rm -f /tmp/node.tar.xz
    fi
    
    # Verify installation
    local node_version=$(node --version 2>/dev/null || echo "")
    local npm_version=$(npm --version 2>/dev/null || echo "")
    
    if [ -z "$node_version" ] || [ -z "$npm_version" ]; then
        error "Node.js installation failed"
        exit 1
    fi
    
    log "✓ Node.js installed: $node_version"
    log "✓ npm installed: $npm_version"
    
    # Configure Node.js memory limit based on available memory
    local total_mem=$(free -m | awk '/^Mem:/ {print $2}')
    local node_mem=4096
    
    if [ "$total_mem" -lt 4096 ]; then
        node_mem=$((total_mem * 3 / 4))  # Use 75% of available memory
        warn "Limited memory detected. Setting Node.js memory to ${node_mem}MB"
    fi
    
    export NODE_OPTIONS="--max-old-space-size=$node_mem"
    echo "export NODE_OPTIONS=\"--max-old-space-size=$node_mem\"" >> /etc/environment
    
    log "✓ Node.js memory limit set to ${node_mem}MB"
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
    
    # Ensure proper ownership of all files and directories
    chown -R "$USER_NAME:$USER_NAME" "$APP_DIR"
    
    # Create and set permissions for pnpm directories
    log "Setting up pnpm environment for user $USER_NAME..."
    sudo -u "$USER_NAME" mkdir -p "/home/$USER_NAME/.local/share/pnpm"
    sudo -u "$USER_NAME" mkdir -p "/home/$USER_NAME/.config/pnpm"
    sudo -u "$USER_NAME" mkdir -p "/home/$USER_NAME/.cache/pnpm"
    
    # Set proper permissions
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.local"
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config"
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.cache" 2>/dev/null || true
    
    # Install dependencies with self-healing
    log "Installing application dependencies..."
    
    # Clear any cache issues first
    sudo -u "$USER_NAME" pnpm store prune 2>/dev/null || true
    
    # Attempt installation with retry
    local install_success=false
    for attempt in {1..3}; do
        log "Dependency installation attempt $attempt/3..."
        
        if sudo -u "$USER_NAME" NODE_OPTIONS="--max-old-space-size=4096" pnpm install --no-frozen-lockfile 2>&1 | tee /tmp/pnpm-install.log; then
            install_success=true
            log "✓ Dependencies installed successfully"
            rm -f /tmp/pnpm-install.log
            break
        else
            # Analyze installation failure
            if grep -q "ECONNREFUSED\|ETIMEDOUT\|ENOTFOUND" /tmp/pnpm-install.log; then
                warn "Network issues detected"
                self_heal "dns_resolution"
                
                # Try with different registry
                log "Switching to alternative npm registry..."
                sudo -u "$USER_NAME" pnpm config set registry https://registry.npmmirror.com
            elif grep -q "ENOSPC\|EACCES" /tmp/pnpm-install.log; then
                warn "Disk space or permission issues"
                
                # Fix permissions
                chown -R "$USER_NAME:$USER_NAME" "$APP_DIR"
                
                # Clean up
                rm -rf node_modules
                rm -rf ~/.pnpm-store
                self_heal "memory_issues"
            fi
            
            if [ $attempt -lt 3 ]; then
                sleep 10
            fi
        fi
    done
    
    if ! $install_success; then
        error "Failed to install dependencies after multiple attempts"
        [ -f /tmp/pnpm-install.log ] && tail -50 /tmp/pnpm-install.log
        return 1
    fi
    
    # Build application with self-healing
    log "Building application..."
    
    # Check available memory before building
    local available_mem=$(free -m | awk '/^Available:/ {print $2}')
    if [ -z "$available_mem" ]; then
        available_mem=$(free -m | awk '/^Mem:/ {print $7}')
    fi
    
    if [ "$available_mem" -lt 1024 ]; then
        warn "Low available memory: ${available_mem}MB. Optimizing..."
        self_heal "memory_issues"
    fi
    
    # Attempt build with retry and memory optimization
    local build_success=false
    local node_mem=4096
    
    for attempt in {1..3}; do
        log "Build attempt $attempt/3 with ${node_mem}MB memory..."
        
        if sudo -u "$USER_NAME" NODE_OPTIONS="--max-old-space-size=$node_mem" pnpm run build 2>&1 | tee /tmp/build.log; then
            build_success=true
            log "✓ Build completed successfully"
            rm -f /tmp/build.log
            break
        else
            # Analyze build failure
            if grep -q "JavaScript heap out of memory" /tmp/build.log; then
                warn "Build failed due to memory issues"
                
                # Reduce memory allocation and try again
                node_mem=$((node_mem * 3 / 4))
                warn "Reducing Node.js memory to ${node_mem}MB"
                
                # Free up more memory
                self_heal "memory_issues"
            elif grep -q "ENOSPC" /tmp/build.log; then
                warn "Build failed due to disk space"
                
                # Clean up disk space
                log "Cleaning up disk space..."
                rm -rf node_modules/.cache
                rm -rf .parcel-cache
                rm -rf build
                pnpm store prune
                
                # System cleanup
                apt-get clean
                apt-get autoremove -y
            else
                warn "Build failed with unknown error"
            fi
            
            if [ $attempt -lt 3 ]; then
                sleep 5
            fi
        fi
    done
    
    if ! $build_success; then
        error "Build failed after multiple attempts"
        [ -f /tmp/build.log ] && cat /tmp/build.log
        return 1
    fi
    
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

# Validate nginx configuration syntax
validate_nginx_config() {
    local config_file="$1"
    local temp_file="/tmp/nginx_test_$(date +%s).conf"
    
    # Create a temporary nginx config for testing
    cat > "$temp_file" << 'EOF'
events {
    worker_connections 1024;
}
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
EOF
    
    # Include our config in the test
    echo "    include $config_file;" >> "$temp_file"
    echo "}" >> "$temp_file"
    
    # Test the configuration
    if nginx -t -c "$temp_file" 2>/dev/null; then
        rm -f "$temp_file"
        return 0
    else
        rm -f "$temp_file"
        return 1
    fi
}

# Fix common nginx configuration issues
fix_nginx_config() {
    local config_file="$1"
    local temp_file="${config_file}.tmp"
    
    log "Attempting to fix nginx configuration..."
    
    # Common fixes
    sed -e 's/add_header Cache-Control "\([^"]*\)"/add_header Cache-Control '\''\1'\''/' \
        -e 's/listen 80 default_server/listen 80/' \
        -e 's/listen \[::\]:80 default_server/listen [::]:80/' \
        -e 's/server_name _;/server_name localhost;/' \
        "$config_file" > "$temp_file"
    
    # Test the fixed configuration
    if validate_nginx_config "$temp_file"; then
        mv "$temp_file" "$config_file"
        log "✓ Fixed nginx configuration"
        return 0
    else
        rm -f "$temp_file"
        return 1
    fi
}

# Configure Nginx
configure_nginx() {
    log "Configuring Nginx..."
    
    # Self-heal nginx if needed
    if ! systemctl is-active --quiet nginx; then
        self_heal "nginx_config"
    fi
    
    # Clean up any problematic existing configurations
    if [ -f "$NGINX_ENABLED_PATH" ] || [ -f "$NGINX_CONF_PATH" ]; then
        log "Found existing nginx configuration, backing up and removing..."
        
        # Backup existing configuration
        if [ -f "$NGINX_CONF_PATH" ]; then
            cp "$NGINX_CONF_PATH" "${NGINX_CONF_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
            log "Backed up existing nginx configuration"
        fi
        
        # Remove potentially problematic configurations
        rm -f "$NGINX_ENABLED_PATH"
        rm -f "$NGINX_CONF_PATH"
        
        # Also check for any other bolt-gives configurations
        rm -f /etc/nginx/sites-enabled/bolt-gives*
        rm -f /etc/nginx/sites-available/bolt-gives*
    fi
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx before making changes
    if ! nginx -t 2>/dev/null; then
        log "Existing nginx configuration has errors, attempting to fix..."
        self_heal "nginx_config"
    fi
    
    # Create Nginx configuration with proper syntax
    cat > "$NGINX_CONF_PATH" << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    # Cache control
    add_header Cache-Control 'no-cache, no-store, must-revalidate' always;
    add_header Pragma 'no-cache' always;
    add_header Expires '0' always;
    
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
        warn "Nginx configuration test failed, attempting to fix..."
        
        # Try to fix the configuration
        if fix_nginx_config "$NGINX_CONF_PATH"; then
            log "Configuration fixed, retesting..."
            if nginx -t; then
                log "✓ Nginx configuration is now valid"
            else
                error "Configuration still invalid after fixes"
                
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
                        self_heal "nginx_config"
                    fi
                else
                    # Remove invalid configuration
                    rm -f "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
                    self_heal "nginx_config"
                fi
                
                return 1
            fi
        else
            error "Could not fix nginx configuration"
            rm -f "$NGINX_CONF_PATH" "$NGINX_ENABLED_PATH"
            self_heal "nginx_config"
            return 1
        fi
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
    
    # Check if port 80 is available
    if lsof -i :80 >/dev/null 2>&1; then
        log "Port 80 is in use, stopping nginx..."
        systemctl stop nginx
        sleep 2
        
        # Double-check port is free
        if lsof -i :80 >/dev/null 2>&1; then
            self_heal "port_conflict"
        fi
    fi
    
    # Multiple attempts with different methods
    local cert_obtained=false
    
    # Method 1: Standalone
    if ! $cert_obtained; then
        log "Attempting standalone certificate request..."
        if certbot certonly --standalone --non-interactive --agree-tos \
            --email "admin@$DOMAIN" -d "$DOMAIN" \
            --http-01-port 80 2>/dev/null; then
            cert_obtained=true
            log "✓ SSL certificate obtained successfully (standalone)"
        fi
    fi
    
    # Method 2: Webroot (if nginx is running)
    if ! $cert_obtained && systemctl is-active --quiet nginx; then
        log "Attempting webroot certificate request..."
        mkdir -p /var/www/certbot
        if certbot certonly --webroot --non-interactive --agree-tos \
            --email "admin@$DOMAIN" -d "$DOMAIN" \
            -w /var/www/certbot 2>/dev/null; then
            cert_obtained=true
            log "✓ SSL certificate obtained successfully (webroot)"
        fi
    fi
    
    # Method 3: DNS challenge fallback
    if ! $cert_obtained; then
        warn "Standard methods failed. Manual DNS verification may be required."
        # Start nginx back up
        systemctl start nginx 2>/dev/null || true
        return 1
    fi
    
    # Start nginx if it was stopped
    systemctl start nginx 2>/dev/null || true
    
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
    listen 443 ssl;
    http2 on;
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
    
    # Cache control
    add_header Cache-Control 'no-cache, no-store, must-revalidate' always;
    add_header Pragma 'no-cache' always;
    add_header Expires '0' always;
    
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
    
    # Cache control
    add_header Cache-Control 'no-cache, no-store, must-revalidate' always;
    add_header Pragma 'no-cache' always;
    add_header Expires '0' always;
    
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
    
    # Get the actual node and pnpm paths
    local node_path=$(which node)
    local pnpm_path=$(which pnpm)
    
    cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Bolt.gives Application
After=network.target nginx.service
Wants=nginx.service

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=NODE_OPTIONS="--max-old-space-size=4096"
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=HOME=/home/$USER_NAME
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=PNPM_HOME=/home/$USER_NAME/.local/share/pnpm
ExecStartPre=/bin/bash -c 'chown -R $USER_NAME:$USER_NAME /home/$USER_NAME/.local /home/$USER_NAME/.config || true'
ExecStart=$pnpm_path run start
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=$APP_DIR /home/$USER_NAME/.local /home/$USER_NAME/.config /home/$USER_NAME/.cache

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

# Start services with self-healing
start_services() {
    log "Starting services..."
    
    # Check for port conflicts before starting
    self_heal "port_conflict"
    
    # Start application with retry
    local service_started=false
    for i in {1..3}; do
        if systemctl start "$SERVICE_NAME"; then
            sleep 5
            if systemctl is-active --quiet "$SERVICE_NAME"; then
                service_started=true
                log "✓ Bolt.gives service started successfully"
                break
            fi
        fi
        
        if [ $i -lt 3 ]; then
            warn "Service start attempt $i failed, checking for issues..."
            
            # Check for common issues
            if journalctl -u "$SERVICE_NAME" --no-pager -n 10 | grep -q "EADDRINUSE"; then
                self_heal "port_conflict"
            elif journalctl -u "$SERVICE_NAME" --no-pager -n 10 | grep -q "JavaScript heap out of memory"; then
                self_heal "memory_issues"
            fi
            
            sleep 5
        fi
    done
    
    if ! $service_started; then
        error "Failed to start Bolt.gives service after multiple attempts"
        log "Last 20 lines of service logs:"
        journalctl -u "$SERVICE_NAME" --no-pager -n 20
        
        # Don't exit, continue with partial installation
        warn "Service failed to start, but installation will continue"
        warn "You may need to manually troubleshoot the service"
    fi
    
    # Check nginx
    if ! systemctl is-active --quiet nginx; then
        warn "Nginx is not running, attempting to start..."
        self_heal "nginx_config"
        systemctl start nginx || warn "Failed to start nginx"
    else
        log "✓ Nginx service is running"
    fi
}

# Final verification
verify_installation() {
    log "Verifying installation..."
    
    # Wait for services to be fully ready
    log "Waiting for services to be ready..."
    sleep 10
    
    # Check if application service is running
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log "✓ Bolt.gives service is running"
    else
        warn "Bolt.gives service is not running"
        systemctl status "$SERVICE_NAME" --no-pager -l || true
        return 1
    fi
    
    # Check if nginx is running
    if systemctl is-active --quiet nginx; then
        log "✓ Nginx service is running"
    else
        warn "Nginx service is not running"
        return 1
    fi
    
    # Test local application with retries
    local max_attempts=6
    local attempt=1
    local http_code="000"
    
    while [ $attempt -le $max_attempts ]; do
        log "Testing local application (attempt $attempt/$max_attempts)..."
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000" || echo "000")
        
        if [ "$http_code" = "200" ] || [ "$http_code" = "301" ] || [ "$http_code" = "302" ]; then
            log "✓ Application is responding locally (HTTP $http_code)"
            break
        else
            if [ $attempt -eq $max_attempts ]; then
                warn "Application may not be responding correctly after $max_attempts attempts (HTTP $http_code)"
                # Show service logs for debugging
                log "Recent service logs:"
                journalctl -u "$SERVICE_NAME" --no-pager -n 10 || true
            else
                log "Waiting 10 seconds before retry..."
                sleep 10
            fi
        fi
        attempt=$((attempt + 1))
    done
    
    # Test external access with retries
    attempt=1
    local external_code="000"
    
    while [ $attempt -le $max_attempts ]; do
        log "Testing external HTTPS access (attempt $attempt/$max_attempts)..."
        external_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "https://$DOMAIN" || echo "000")
        
        if [ "$external_code" = "200" ]; then
            log "✓ Application is accessible externally via HTTPS"
            break
        elif [ "$external_code" = "301" ] || [ "$external_code" = "302" ]; then
            log "✓ Application is accessible externally (redirecting: HTTP $external_code)"
            break
        else
            if [ $attempt -eq $max_attempts ]; then
                warn "External HTTPS access may not be working correctly after $max_attempts attempts (HTTP $external_code)"
                # Test nginx configuration
                log "Testing nginx configuration:"
                nginx -t || true
                
                # Check SSL certificate
                log "Checking SSL certificate:"
                openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" </dev/null 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || true
            else
                log "Waiting 10 seconds before retry..."
                sleep 10
            fi
        fi
        attempt=$((attempt + 1))
    done
    
    # Final status summary
    log "=== Installation Verification Summary ==="
    log "Service Status: $(systemctl is-active "$SERVICE_NAME")"
    log "Nginx Status: $(systemctl is-active nginx)"
    log "Local Access: HTTP $http_code"
    log "External Access: HTTP $external_code"
    log "Domain: https://$DOMAIN"
    
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

# Pre-flight checks
preflight_check() {
    log "Running pre-flight checks..."
    
    # Check for previous failed installations
    if [ -f "/var/log/bolt-gives-install.failed" ]; then
        warn "Previous installation failed. Cleaning up..."
        
        # Stop any running services
        systemctl stop bolt-gives 2>/dev/null || true
        systemctl stop nginx 2>/dev/null || true
        
        # Clean up files
        rm -rf "$APP_DIR"
        rm -f /etc/systemd/system/bolt-gives.service
        rm -f /etc/nginx/sites-*/bolt-gives*
        
        # Remove failed marker
        rm -f /var/log/bolt-gives-install.failed
    fi
    
    # Check for conflicting services
    local conflicting_services=("apache2" "httpd" "lighttpd")
    for service in "${conflicting_services[@]}"; do
        if systemctl is-active --quiet "$service"; then
            warn "Found conflicting service: $service"
            log "Stopping $service..."
            systemctl stop "$service"
            systemctl disable "$service"
        fi
    done
    
    # Ensure critical commands are available
    local required_commands=("curl" "wget" "git" "tar" "systemctl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            error "Required command not found: $cmd"
            log "Installing basic utilities..."
            apt-get update && apt-get install -y curl wget git tar systemd
        fi
    done
    
    log "✓ Pre-flight checks completed"
}

# Installation state tracking
save_state() {
    local step="$1"
    echo "$step" > /var/log/bolt-gives-install.state
}

get_state() {
    if [ -f /var/log/bolt-gives-install.state ]; then
        cat /var/log/bolt-gives-install.state
    else
        echo "start"
    fi
}

# Main installation flow with resume capability
main() {
    print_header
    
    # Create state file if starting fresh
    if [ ! -f /var/log/bolt-gives-install.state ]; then
        save_state "start"
    else
        local last_state=$(get_state)
        log "Resuming installation from: $last_state"
    fi
    
    # Run pre-flight checks
    preflight_check
    
    # Mark as potentially failed (will be removed on success)
    touch /var/log/bolt-gives-install.failed
    
    # Detect server IP first
    if [[ "$(get_state)" == "start" ]]; then
        detect_server_ip
        save_state "ip_detected"
    fi
    
    # Get domain configuration
    if [[ "$(get_state)" =~ ^(start|ip_detected)$ ]]; then
        get_domain
        save_state "domain_configured"
    fi
    
    # System checks and setup
    if [[ "$(get_state)" =~ ^(start|ip_detected|domain_configured)$ ]]; then
        check_system
        save_state "system_checked"
    fi
    
    if [[ "$(get_state)" =~ ^(start|ip_detected|domain_configured|system_checked)$ ]]; then
        update_system
        save_state "system_updated"
    fi
    
    if [[ "$(get_state)" =~ ^(start|ip_detected|domain_configured|system_checked|system_updated)$ ]]; then
        install_dependencies
        save_state "dependencies_installed"
    fi
    
    # Install runtime
    if [[ ! "$(get_state)" =~ ^(nodejs_installed|pnpm_installed|app_setup|firewall_configured|nginx_configured|ssl_configured|service_created|monitoring_setup|services_started|verified)$ ]]; then
        install_nodejs
        save_state "nodejs_installed"
    fi
    
    if [[ ! "$(get_state)" =~ ^(pnpm_installed|app_setup|firewall_configured|nginx_configured|ssl_configured|service_created|monitoring_setup|services_started|verified)$ ]]; then
        install_pnpm
        save_state "pnpm_installed"
    fi
    
    # Application setup
    if [[ ! "$(get_state)" =~ ^(app_setup|firewall_configured|nginx_configured|ssl_configured|service_created|monitoring_setup|services_started|verified)$ ]]; then
        create_app_user
        setup_application
        save_state "app_setup"
    fi
    
    # Security and web server
    if [[ ! "$(get_state)" =~ ^(firewall_configured|nginx_configured|ssl_configured|service_created|monitoring_setup|services_started|verified)$ ]]; then
        configure_firewall
        save_state "firewall_configured"
    fi
    
    if [[ ! "$(get_state)" =~ ^(nginx_configured|ssl_configured|service_created|monitoring_setup|services_started|verified)$ ]]; then
        if ! configure_nginx; then
            error "Nginx configuration failed. Continuing without web server proxy."
            warn "You may need to manually configure nginx later."
            warn "The application will still be accessible on port 3000."
        else
            save_state "nginx_configured"
            
            # Only attempt SSL setup if nginx configuration succeeded
            if ! setup_ssl; then
                warn "SSL setup failed. Application accessible via HTTP only."
                warn "You can manually configure SSL later using: certbot --nginx -d $DOMAIN"
            else
                save_state "ssl_configured"
            fi
        fi
    fi
    
    # Service management
    if [[ ! "$(get_state)" =~ ^(service_created|monitoring_setup|services_started|verified)$ ]]; then
        create_systemd_service
        save_state "service_created"
    fi
    
    if [[ ! "$(get_state)" =~ ^(monitoring_setup|services_started|verified)$ ]]; then
        setup_monitoring
        save_state "monitoring_setup"
    fi
    
    # Start everything
    if [[ ! "$(get_state)" =~ ^(services_started|verified)$ ]]; then
        start_services
        save_state "services_started"
    fi
    
    # Verification and cleanup
    verify_installation
    save_state "verified"
    
    cleanup
    
    # Mark as successful
    rm -f /var/log/bolt-gives-install.failed
    rm -f /var/log/bolt-gives-install.state
    
    # Success message
    print_success
}

# Trap errors and cleanup
trap 'error "Installation failed at line $LINENO. Check $LOG_FILE for details."; exit 1' ERR

# Run main installation
main "$@"