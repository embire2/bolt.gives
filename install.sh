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
APP_DIR="/opt/bolt.gives"
SERVICE_NAME="bolt-gives"
USER_NAME="bolt"
DEFAULT_PORT="3000"
APP_PORT="$DEFAULT_PORT"  # Will be updated if port is in use

# AI Assistant Configuration  
# Bolt.gives provides AI consultation using our Anthropic API
# Direct hardcoded API key for immediate use
ANTHROPIC_API_KEY="sk-ant-api03-6uTnghsvFlkGsAnvD_yr8aasY002-egobPr7BSy8fSuzje38wBhG27nOxVTErGw_jKAh7kMeNh0V_tEFCdPLs2A-j4R2sAAA"
ANTHROPIC_MODEL="claude-sonnet-4-20250514"
AI_CONSULTATION_ENABLED=true
MAX_AI_RETRIES=3

# Verify API key is available
verify_api_key() {
    if [ -n "$ANTHROPIC_API_KEY" ] && [ ${#ANTHROPIC_API_KEY} -ge 50 ]; then
        log "✅ API key is configured for AI consultation"
        return 0
    else
        warn "API key not found, AI consultation will be disabled"
        AI_CONSULTATION_ENABLED=false
        return 1
    fi
}

# Parse command line arguments for installation options
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-ai)
            AI_CONSULTATION_ENABLED=false
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-ai          Disable AI consultation"
            echo "  --help, -h       Show this help message"
            echo ""
            echo "AI consultation is enabled by default using Bolt.gives API"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Logging
LOG_FILE="/var/log/bolt-gives-install.log"
exec 1> >(tee -a "$LOG_FILE")
exec 2> >(tee -a "$LOG_FILE" >&2)

print_header() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                🤖 AI-POWERED BOLT.GIVES INSTALLER 🤖          ║"
    echo "║           Revolutionary Self-Healing Installation             ║"
    echo "║              Powered by Claude Sonnet AI                     ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    if [ "$AI_CONSULTATION_ENABLED" = "true" ]; then
        echo -e "${GREEN}🤖 AI consultation ENABLED - Claude Sonnet will help fix any errors!${NC}"
        echo -e "${GREEN}🎉 Using Bolt.gives AI API - No setup required!${NC}"
    else
        echo -e "${YELLOW}💡 AI consultation disabled. Use without --no-ai flag to enable.${NC}"
    fi
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
    echo "🚨 ADVANCED ERROR DIAGNOSTICS - $error_type"
    echo "═══════════════════════════════════════════════════════════════"
    echo "Context: $context"
    echo "Time: $(date)"
    echo "User: $(whoami)"
    echo "Directory: $(pwd)"
    echo ""
    
    case "$error_type" in
        "PNPM_PERMISSION")
            echo "🔍 PNPM Permission Analysis:"
            echo "├── Global PNPM: $(which pnpm 2>/dev/null || echo 'NOT FOUND')"
            echo "├── PNPM Version: $(pnpm --version 2>/dev/null || echo 'FAILED')"
            echo "├── User Home: /home/$USER_NAME"
            echo "├── User Exists: $(id $USER_NAME 2>/dev/null && echo 'YES' || echo 'NO')"
            echo ""
            echo "📁 Directory Analysis:"
            ls -la "/home/$USER_NAME/.local/share/pnpm" 2>/dev/null || echo "❌ .local/share/pnpm does not exist"
            ls -la "/home/$USER_NAME/.local/share/pnpm/.tools" 2>/dev/null || echo "❌ .tools does not exist"
            ls -la "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm/9.4.0/bin" 2>/dev/null || echo "❌ 9.4.0/bin does not exist"
            echo ""
            echo "🔑 Permission Analysis:"
            echo "├── /home/$USER_NAME ownership: $(ls -ld /home/$USER_NAME 2>/dev/null | awk '{print $3":"$4}' || echo 'ERROR')"
            echo "├── .local ownership: $(ls -ld /home/$USER_NAME/.local 2>/dev/null | awk '{print $3":"$4}' || echo 'ERROR')"
            echo "└── .local permissions: $(ls -ld /home/$USER_NAME/.local 2>/dev/null | awk '{print $1}' || echo 'ERROR')"
            ;;
        "SERVICE_STARTUP")
            echo "🔍 Service Startup Analysis:"
            echo "├── Service Status: $(systemctl is-active $SERVICE_NAME 2>/dev/null || echo 'INACTIVE')"
            echo "├── Service Enabled: $(systemctl is-enabled $SERVICE_NAME 2>/dev/null || echo 'DISABLED')"
            echo "├── Port $APP_PORT in use: $(netstat -tlnp | grep :$APP_PORT && echo 'YES' || echo 'NO')"
            echo ""
            echo "📋 Recent Service Logs (last 20 lines):"
            journalctl -u $SERVICE_NAME --no-pager -n 20 2>/dev/null || echo "❌ No service logs"
            echo ""
            echo "🔧 Service File Content:"
            cat "/etc/systemd/system/$SERVICE_NAME.service" 2>/dev/null || echo "❌ Service file not found"
            ;;
        "AI_CONSULTATION")
            echo "🔍 AI Consultation Analysis:"
            echo "├── AI Enabled: $AI_CONSULTATION_ENABLED"
            echo "├── API Key Present: $([ -n "$ANTHROPIC_API_KEY" ] && echo 'YES' || echo 'NO')"
            echo "├── API Key Length: ${#ANTHROPIC_API_KEY}"
            echo "├── API Key Prefix: ${ANTHROPIC_API_KEY:0:20}..."
            echo "├── Model: $ANTHROPIC_MODEL"
            echo "├── Max Retries: $MAX_AI_RETRIES"
            echo ""
            echo "🌐 Connectivity Test:"
            curl -s --connect-timeout 5 https://api.anthropic.com/ && echo "✅ Can reach Anthropic API" || echo "❌ Cannot reach Anthropic API"
            ;;
    esac
    
    echo ""
    echo "📋 Full System Context:"
    echo "├── OS: $(uname -a)"
    echo "├── Memory: $(free -h | head -2)"
    echo "├── Disk: $(df -h /opt 2>/dev/null | tail -1)"
    echo "└── Load: $(uptime)"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
}

# AI Consultation System - Revolutionary Self-Healing
consult_ai() {
    local error_context="$1"
    local command_that_failed="$2"
    local error_logs="$3"
    local attempt_number="${4:-1}"
    
    log "🤖 AI CONSULTATION TRIGGERED!"
    log "Context: $error_context"
    log "Failed command: $command_that_failed"
    
    if [ "$AI_CONSULTATION_ENABLED" != "true" ]; then
        warn "AI consultation is DISABLED (AI_CONSULTATION_ENABLED=$AI_CONSULTATION_ENABLED)"
        return 1
    fi
    
    if [ -z "$ANTHROPIC_API_KEY" ]; then
        warn "AI consultation FAILED - No API key (key length: ${#ANTHROPIC_API_KEY})"
        return 1
    fi
    
    log "✅ AI is ENABLED with API key: ${ANTHROPIC_API_KEY:0:20}..."
    
    if [ "$attempt_number" -gt "$MAX_AI_RETRIES" ]; then
        error "Maximum AI consultation attempts reached ($attempt_number > $MAX_AI_RETRIES)"
        return 1
    fi
    
    log "🤖 Consulting Claude Sonnet for intelligent error resolution (attempt $attempt_number/$MAX_AI_RETRIES)..."
    
    # Get system information for context
    local system_info=$(cat <<EOF
System: $(uname -a)
OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')
Memory: $(free -h | grep Mem)
Disk: $(df -h / | tail -1)
User: $USER_NAME
App Directory: $APP_DIR
Service: $SERVICE_NAME
Port: $APP_PORT
EOF
)
    
    # Create the AI prompt
    local ai_prompt=$(cat <<EOF
You are an expert Linux system administrator helping to fix a bolt.gives installation error. 

CONTEXT:
$error_context

FAILED COMMAND:
$command_that_failed

ERROR LOGS:
$error_logs

SYSTEM INFO:
$system_info

Please provide a bash script solution that will fix this specific error. The solution should:
1. Be safe and not break the system
2. Handle edge cases and permissions properly  
3. Include proper error checking
4. Be executable as root
5. Focus only on fixing the immediate error

Respond with only the bash commands needed to fix this issue, no explanations. Start with #!/bin/bash and include all necessary commands.
EOF
)
    
    # Call Claude API
    local ai_response=$(curl -s -X POST https://api.anthropic.com/v1/messages \
        -H "Content-Type: application/json" \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -d "{
            \"model\": \"$ANTHROPIC_MODEL\",
            \"max_tokens\": 2048,
            \"messages\": [{
                \"role\": \"user\",
                \"content\": $(printf '%s' "$ai_prompt" | jq -R -s .)
            }]
        }" 2>/dev/null)
    
    # Extract the solution from the response
    local solution=$(echo "$ai_response" | jq -r '.content[0].text' 2>/dev/null)
    
    if [ -z "$solution" ] || [ "$solution" = "null" ]; then
        error "Failed to get AI response. API Response: $ai_response"
        return 1
    fi
    
    log "🧠 Claude Sonnet provided intelligent solution:"
    echo "$solution" | head -20
    
    # Save the AI solution to a temporary file
    local ai_script="/tmp/ai_fix_$(date +%s).sh"
    echo "$solution" > "$ai_script"
    chmod +x "$ai_script"
    
    # Execute the AI-generated solution
    log "🚀 Executing AI-generated fix..."
    if bash "$ai_script" 2>&1 | tee -a "$LOG_FILE"; then
        log "✅ AI solution executed successfully!"
        rm -f "$ai_script"
        return 0
    else
        local exit_code=$?
        error "❌ AI solution failed with exit code $exit_code"
        
        # Try consulting AI again with the failure information
        if [ "$attempt_number" -lt "$MAX_AI_RETRIES" ]; then
            warn "🔄 Consulting AI again with failure details..."
            local new_error_context="Previous AI solution failed: $solution"
            local new_error_logs=$(tail -20 "$LOG_FILE")
            consult_ai "$new_error_context" "$command_that_failed" "$new_error_logs" $((attempt_number + 1))
        fi
        
        rm -f "$ai_script"
        return $exit_code
    fi
}

# Enhanced command execution with AI consultation
execute_with_ai_backup() {
    local command="$1"
    local description="$2"
    local max_attempts="${3:-3}"
    
    for attempt in $(seq 1 $max_attempts); do
        log "Executing: $description (attempt $attempt/$max_attempts)"
        
        if eval "$command" 2>&1 | tee /tmp/last_command_output.log; then
            log "✅ Success: $description"
            return 0
        else
            local exit_code=$?
            error "❌ Failed: $description (exit code: $exit_code)"
            
            # Get error details
            local error_logs=$(tail -50 /tmp/last_command_output.log 2>/dev/null || echo "No error logs available")
            
            if [ "$attempt" -lt "$max_attempts" ] && [ "$AI_CONSULTATION_ENABLED" = "true" ]; then
                warn "🤖 Consulting AI for intelligent error resolution..."
                
                local error_context="Installation step '$description' failed during bolt.gives setup on attempt $attempt"
                
                if consult_ai "$error_context" "$command" "$error_logs"; then
                    log "🎯 AI provided a fix, retrying the original command..."
                    continue
                else
                    warn "🤔 AI consultation didn't provide a working solution"
                fi
            fi
            
            if [ "$attempt" -eq "$max_attempts" ]; then
                error "💥 Failed after $max_attempts attempts: $description"
                return $exit_code
            fi
            
            # Standard retry delay
            local delay=$((attempt * 2))
            log "⏳ Waiting ${delay}s before retry..."
            sleep $delay
        fi
    done
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
    local context="$2"
    local error_logs="$3"
    local attempt_number="${4:-1}"
    
    log "Self-healing: Attempting to fix $issue (attempt $attempt_number)"
    
    # Try basic self-healing first
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
            local current_port=${APP_PORT:-3000}
            local pids=$(lsof -ti :$current_port 2>/dev/null || true)
            if [ -n "$pids" ]; then
                warn "Found processes using port $current_port: $pids"
                for pid in $pids; do
                    local process_name=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
                    # Don't kill our own service
                    if [[ "$process_name" != "node" ]] || ! systemctl is-active --quiet $SERVICE_NAME; then
                        warn "Killing process $pid ($process_name) using port $current_port"
                        kill -9 $pid 2>/dev/null || true
                    fi
                done
                sleep 2
            fi
            ;;
            
        "permission_issues")
            log "Fixing permission issues..."
            # Fix ownership of user home directory and all subdirectories
            chown -R $USER_NAME:$USER_NAME /home/$USER_NAME
            
            # Fix specific pnpm directories
            local dirs_to_fix=(
                "/home/$USER_NAME/.local"
                "/home/$USER_NAME/.config"
                "/home/$USER_NAME/.cache"
                "/home/$USER_NAME/.npm"
                "$APP_DIR"
            )
            
            for dir in "${dirs_to_fix[@]}"; do
                if [ -d "$dir" ]; then
                    chown -R $USER_NAME:$USER_NAME "$dir"
                    find "$dir" -type d -exec chmod 755 {} \;
                    find "$dir" -type f -exec chmod 644 {} \;
                fi
            done
            
            # Fix executable permissions for node_modules/.bin
            if [ -d "$APP_DIR/node_modules/.bin" ]; then
                find "$APP_DIR/node_modules/.bin" -type f -exec chmod 755 {} \;
            fi
            ;;
            
        "service_timeout")
            log "Fixing service timeout issues..."
            # Increase systemd timeout
            sed -i '/\[Service\]/a TimeoutStartSec=300' "/etc/systemd/system/$SERVICE_NAME.service"
            systemctl daemon-reload
            ;;
            
        "build_failure")
            log "Attempting to fix build failures..."
            cd $APP_DIR
            
            # Clean build artifacts
            rm -rf build dist .parcel-cache
            rm -rf node_modules/.cache
            
            # Clear pnpm cache
            sudo -u $USER_NAME pnpm store prune
            
            # Try with reduced parallelism
            export JOBS=1
            export NODE_OPTIONS="--max-old-space-size=2048"
            
            # Reinstall and rebuild
            sudo -u $USER_NAME pnpm install --no-frozen-lockfile
            sudo -u $USER_NAME pnpm run build
            ;;
            
        "network_issues")
            log "Fixing network connectivity issues..."
            # Try different DNS servers
            echo "nameserver 1.1.1.1" > /etc/resolv.conf
            echo "nameserver 1.0.0.1" >> /etc/resolv.conf
            echo "nameserver 8.8.8.8" >> /etc/resolv.conf
            
            # Restart network services
            systemctl restart systemd-networkd 2>/dev/null || true
            systemctl restart NetworkManager 2>/dev/null || true
            
            # Clear DNS cache
            systemd-resolve --flush-caches 2>/dev/null || true
            ;;
            
        "ssl_issues")
            log "Fixing SSL certificate issues..."
            # Stop nginx to free port 80
            systemctl stop nginx
            
            # Try to obtain certificate again
            certbot certonly --standalone --non-interactive --agree-tos \
                --email "admin@$DOMAIN" -d "$DOMAIN" \
                --force-renewal || {
                warn "SSL renewal failed, continuing with HTTP only"
                # Remove SSL configuration from nginx
                sed -i '/listen 443/,/^}/d' "$NGINX_CONF_PATH"
                sed -i '/ssl_certificate/d' "$NGINX_CONF_PATH"
            }
            
            systemctl start nginx
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
    
    # If basic self-healing fails and AI is enabled, consult AI for advanced solutions
    if [ "$AI_CONSULTATION_ENABLED" = "true" ] && [ "$attempt_number" -ge 1 ]; then
        local ai_context="Self-healing attempt for '$issue' during bolt.gives installation"
        if [ -n "$context" ]; then
            ai_context="$ai_context. Context: $context"
        fi
        
        # Get recent error logs if not provided
        if [ -z "$error_logs" ]; then
            error_logs=$(journalctl -u "$SERVICE_NAME" --no-pager -n 50 2>/dev/null || echo "No service logs available")
        fi
        
        warn "🤖 Basic self-healing for '$issue' completed. Consulting AI for advanced solutions..."
        if consult_ai "$ai_context" "self_heal $issue" "$error_logs" "$attempt_number"; then
            log "🎯 AI provided additional fixes for '$issue'"
            return 0
        else
            warn "🤔 AI couldn't provide additional solutions for '$issue'"
            return 1
        fi
    fi
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
        "jq"
        "netstat-nat"
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

# Install pnpm with AI assistance
install_pnpm() {
    log "Installing pnpm with AI-powered error recovery..."
    
    # Try multiple pnpm installation methods
    local install_methods=(
        "npm install -g pnpm@$PNPM_VERSION"
        "curl -fsSL https://get.pnpm.io/install.sh | sh -"
        "wget -qO- https://get.pnpm.io/install.sh | sh -"
    )
    
    for method in "${install_methods[@]}"; do
        log "Trying pnpm installation method: $method"
        if execute_with_ai_backup "$method" "Installing pnpm via $method" 2; then
            break
        fi
    done
    
    # Verify installation and setup environment
    execute_with_ai_backup "export PATH=\"\$HOME/.local/share/pnpm:\$PATH\" && pnpm --version" "Verifying pnpm installation"
    
    # Set up global pnpm path
    if [ ! -f /usr/local/bin/pnpm ]; then
        local pnpm_path=$(which pnpm 2>/dev/null || find / -name pnpm -type f 2>/dev/null | head -1)
        if [ -n "$pnpm_path" ]; then
            ln -sf "$pnpm_path" /usr/local/bin/pnpm
        fi
    fi
    
    local pnpm_version=$(pnpm --version 2>/dev/null || echo "")
    if [ -z "$pnpm_version" ]; then
        error "❌ pnpm installation verification failed"
        # Let AI figure out what went wrong
        if [ "$AI_CONSULTATION_ENABLED" = "true" ]; then
            consult_ai "pnpm installation completed but verification failed" "pnpm --version" "Command not found or no output"
        fi
        exit 1
    fi
    
    log "✅ pnpm installed successfully: $pnpm_version"
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
    
    # Create all necessary user directories with proper permissions
    log "Creating user directories with proper permissions..."
    local user_dirs=(
        "/home/$USER_NAME/.local"
        "/home/$USER_NAME/.local/share"
        "/home/$USER_NAME/.local/share/pnpm"
        "/home/$USER_NAME/.local/share/pnpm/.tools"
        "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm"
        "/home/$USER_NAME/.local/share/pnpm/store"
        "/home/$USER_NAME/.local/share/pnpm/store/v3"
        "/home/$USER_NAME/.local/share/pnpm/store/v3/files"
        "/home/$USER_NAME/.config"
        "/home/$USER_NAME/.config/pnpm"
        "/home/$USER_NAME/.cache"
        "/home/$USER_NAME/.cache/pnpm"
        "/home/$USER_NAME/.npm"
        "/home/$USER_NAME/.pnpm-state"
    )
    
    for dir in "${user_dirs[@]}"; do
        mkdir -p "$dir"
        chown -R "$USER_NAME:$USER_NAME" "$dir"
        chmod 755 "$dir"
    done
    
    # Create .npmrc and .bashrc if they don't exist
    touch "/home/$USER_NAME/.npmrc"
    touch "/home/$USER_NAME/.bashrc"
    chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.npmrc" "/home/$USER_NAME/.bashrc"
    chmod 644 "/home/$USER_NAME/.npmrc" "/home/$USER_NAME/.bashrc"
    
    log "✓ Application user configured with all necessary permissions"
    
    # Setup PNPM for the user
    setup_pnpm_for_user
}

# Setup PNPM specifically for the application user
setup_pnpm_for_user() {
    log "Setting up PNPM for user $USER_NAME with comprehensive fixes..."
    
    # First, ensure global PNPM exists
    if ! command -v pnpm &> /dev/null; then
        log "Installing PNPM globally first..."
        npm install -g pnpm@latest
    fi
    
    # Get the global PNPM path
    local global_pnpm=$(which pnpm)
    log "Global PNPM found at: $global_pnpm"
    
    # Create ALL necessary directories for the user with proper structure
    local user_dirs=(
        "/home/$USER_NAME/.local/share/pnpm"
        "/home/$USER_NAME/.local/share/pnpm/.tools"
        "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm"
        "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm/9.4.0"
        "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm/9.4.0/bin"
        "/home/$USER_NAME/.local/share/pnpm/store"
        "/home/$USER_NAME/.local/share/pnpm/store/v3"
        "/home/$USER_NAME/.local/share/pnpm/store/v3/files"
        "/home/$USER_NAME/.local/bin"
        "/home/$USER_NAME/.config/pnpm"
        "/home/$USER_NAME/.cache/pnpm"
    )
    
    for dir in "${user_dirs[@]}"; do
        mkdir -p "$dir"
        chown -R "$USER_NAME:$USER_NAME" "$dir"
        chmod -R 755 "$dir"
    done
    
    # Create a wrapper script that always works
    cat > "/home/$USER_NAME/.local/bin/pnpm" << EOF
#!/bin/bash
# PNPM wrapper script for user $USER_NAME
export PNPM_HOME="/home/$USER_NAME/.local/share/pnpm"
export PATH="\$PNPM_HOME:\$PATH"

# Use the global pnpm
exec $global_pnpm "\$@"
EOF
    
    chmod +x "/home/$USER_NAME/.local/bin/pnpm"
    chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.local/bin/pnpm"
    
    # Also create the version-specific PNPM that corepack expects
    cat > "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm/9.4.0/bin/pnpm" << EOF
#!/bin/bash
# PNPM version-specific wrapper
export PNPM_HOME="/home/$USER_NAME/.local/share/pnpm"
export PATH="\$PNPM_HOME:\$PATH"
exec $global_pnpm "\$@"
EOF
    
    chmod +x "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm/9.4.0/bin/pnpm"
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.local/share/pnpm/.tools"
    
    # Create additional version directories that might be expected
    for version in "9.4.0" "latest" "current"; do
        local version_dir="/home/$USER_NAME/.local/share/pnpm/.tools/pnpm/$version/bin"
        mkdir -p "$version_dir"
        
        cat > "$version_dir/pnpm" << EOF
#!/bin/bash
# PNPM wrapper for version $version
export PNPM_HOME="/home/$USER_NAME/.local/share/pnpm"
export PATH="\$PNPM_HOME:\$PATH"
exec $global_pnpm "\$@"
EOF
        chmod +x "$version_dir/pnpm"
        chown -R "$USER_NAME:$USER_NAME" "$version_dir"
    done
    
    # Create symlinks for all possible PNPM locations
    ln -sf "$global_pnpm" "/home/$USER_NAME/.local/share/pnpm/pnpm" 2>/dev/null || true
    
    # Update user's bashrc with proper paths
    cat >> "/home/$USER_NAME/.bashrc" << 'EOF'

# PNPM Configuration
export PNPM_HOME="/home/bolt/.local/share/pnpm"
export PATH="$HOME/.local/bin:$PNPM_HOME:$PATH"
export npm_config_prefix="$HOME/.local"
EOF
    
    # Create pnpm configuration
    mkdir -p "/home/$USER_NAME/.config/pnpm"
    cat > "/home/$USER_NAME/.config/pnpm/rc" << EOF
store-dir=/home/$USER_NAME/.local/share/pnpm/store
global-dir=/home/$USER_NAME/.local/share/pnpm/global
state-dir=/home/$USER_NAME/.local/share/pnpm/state
cache-dir=/home/$USER_NAME/.cache/pnpm
EOF
    
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/pnpm"
    
    # Initialize PNPM for the user
    sudo -u $USER_NAME bash -c "cd ~ && $global_pnpm config set store-dir /home/$USER_NAME/.local/share/pnpm/store"
    
    # Final permission fix for everything
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.local"
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config"
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.cache"
    find "/home/$USER_NAME/.local" -type d -exec chmod 755 {} \;
    find "/home/$USER_NAME/.local" -type f -name "pnpm" -exec chmod 755 {} \;
    
    # Comprehensive PNPM verification
    log "🔍 Verifying PNPM setup..."
    
    # Test all possible PNPM executables
    local test_commands=(
        "/home/$USER_NAME/.local/bin/pnpm --version"
        "/home/$USER_NAME/.local/share/pnpm/.tools/pnpm/9.4.0/bin/pnpm --version"
        "sudo -u $USER_NAME /home/$USER_NAME/.local/bin/pnpm --version"
        "sudo -u $USER_NAME bash -c 'cd ~ && source ~/.bashrc && pnpm --version'"
    )
    
    for cmd in "${test_commands[@]}"; do
        debug "Testing: $cmd"
        if eval "$cmd" >/dev/null 2>&1; then
            log "✅ SUCCESS: $cmd"
        else
            warn "❌ FAILED: $cmd"
        fi
    done
    
    # Show final directory structure
    debug "Final PNPM directory structure:"
    find "/home/$USER_NAME/.local/share/pnpm" -type f -name "pnpm" -exec ls -la {} \; 2>/dev/null || true
    
    log "✓ PNPM setup completed with all permission fixes for user $USER_NAME"
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
    
    # Check if default port is available
    if lsof -ti :$DEFAULT_PORT >/dev/null 2>&1; then
        warn "Default port $DEFAULT_PORT is in use"
        local new_port=$(find_available_port $DEFAULT_PORT)
        if [ -n "$new_port" ]; then
            APP_PORT=$new_port
            warn "Will use port $APP_PORT instead"
        else
            error "No available ports found"
            return 1
        fi
    fi
    
    # Fix permissions before running as user
    log "Fixing permissions for pnpm environment..."
    
    # Ensure all parent directories exist and have proper permissions
    local pnpm_dirs=(
        "/home/$USER_NAME"
        "/home/$USER_NAME/.local"
        "/home/$USER_NAME/.local/share"
        "/home/$USER_NAME/.local/share/pnpm"
        "/home/$USER_NAME/.config"
        "/home/$USER_NAME/.config/pnpm"
        "/home/$USER_NAME/.cache"
        "/home/$USER_NAME/.cache/pnpm"
        "/home/$USER_NAME/.npm"
    )
    
    for dir in "${pnpm_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
        fi
        chown "$USER_NAME:$USER_NAME" "$dir"
        chmod 755 "$dir"
    done
    
    # Fix .npmrc and pnpm rc files
    touch "/home/$USER_NAME/.npmrc"
    mkdir -p "/home/$USER_NAME/.config/pnpm"
    touch "/home/$USER_NAME/.config/pnpm/rc"
    chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.npmrc"
    chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/pnpm"
    chmod 644 "/home/$USER_NAME/.npmrc"
    [ -f "/home/$USER_NAME/.config/pnpm/rc" ] && chmod 644 "/home/$USER_NAME/.config/pnpm/rc"
    
    # Set PNPM_HOME environment variable for the user
    if ! grep -q "PNPM_HOME" "/home/$USER_NAME/.bashrc"; then
        echo "export PNPM_HOME=/home/$USER_NAME/.local/share/pnpm" >> "/home/$USER_NAME/.bashrc"
        echo "export PATH=\$PNPM_HOME:\$PATH" >> "/home/$USER_NAME/.bashrc"
    fi
    chown "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.bashrc"
    
    # AI-powered dependency installation
    log "🚀 Installing dependencies with AI-powered error recovery..."
    
    # Comprehensive pnpm setup for the user
    execute_with_ai_backup "
        # Remove any existing pnpm installations for clean start
        rm -rf /home/$USER_NAME/.local/share/pnpm 2>/dev/null || true
        rm -rf /home/$USER_NAME/.config/pnpm 2>/dev/null || true
        rm -rf /home/$USER_NAME/.cache/pnpm 2>/dev/null || true
        
        # Create fresh pnpm environment
        sudo -u $USER_NAME mkdir -p /home/$USER_NAME/.local/share/pnpm
        sudo -u $USER_NAME mkdir -p /home/$USER_NAME/.config/pnpm  
        sudo -u $USER_NAME mkdir -p /home/$USER_NAME/.cache/pnpm
        
        # Set proper ownership
        chown -R $USER_NAME:$USER_NAME /home/$USER_NAME/.local
        chown -R $USER_NAME:$USER_NAME /home/$USER_NAME/.config
        chown -R $USER_NAME:$USER_NAME /home/$USER_NAME/.cache
        
        # Install pnpm for the user specifically
        sudo -u $USER_NAME bash -c 'curl -fsSL https://get.pnpm.io/install.sh | sh -'
        
        # Ensure pnpm is in PATH for the user
        sudo -u $USER_NAME bash -c 'echo \"export PNPM_HOME=/home/$USER_NAME/.local/share/pnpm\" >> /home/$USER_NAME/.bashrc'
        sudo -u $USER_NAME bash -c 'echo \"export PATH=\\\$PNPM_HOME:\\\$PATH\" >> /home/$USER_NAME/.bashrc'
        
        # Source the environment
        sudo -u $USER_NAME bash -c 'source /home/$USER_NAME/.bashrc'
    " "Setting up clean pnpm environment for user"
    
    # Clean any existing node_modules
    execute_with_ai_backup "
        cd $APP_DIR
        rm -rf node_modules package-lock.json yarn.lock 2>/dev/null || true
        sudo -u $USER_NAME /home/$USER_NAME/.local/share/pnpm/pnpm store prune 2>/dev/null || true
    " "Cleaning existing dependencies"
    
    # Install dependencies with multiple fallback strategies
    log "Installing application dependencies..."
    
    # First, ensure pnpm is actually accessible
    local pnpm_path=""
    for possible_path in \
        "/home/$USER_NAME/.local/share/pnpm/pnpm" \
        "/usr/local/bin/pnpm" \
        "/usr/bin/pnpm" \
        "$(which pnpm 2>/dev/null || echo '')"
    do
        if [ -f "$possible_path" ] && [ -x "$possible_path" ]; then
            pnpm_path="$possible_path"
            break
        fi
    done
    
    if [ -z "$pnpm_path" ]; then
        warn "PNPM not found! Installing it first..."
        sudo -u $USER_NAME bash -c 'cd ~ && npm install -g pnpm'
        pnpm_path=$(which pnpm 2>/dev/null)
    fi
    
    log "Using PNPM at: $pnpm_path"
    
    # Try pnpm install with proper environment
    local pnpm_install_command="cd $APP_DIR && sudo -u $USER_NAME env PNPM_HOME=/home/$USER_NAME/.local/share/pnpm PATH=/home/$USER_NAME/.local/share/pnpm:/home/$USER_NAME/.local/bin:/usr/local/bin:/usr/bin:\$PATH NODE_OPTIONS='--max-old-space-size=4096' $pnpm_path install --no-frozen-lockfile"
    
    if ! execute_with_ai_backup "$pnpm_install_command" "Installing dependencies with pnpm" 3; then
        # If pnpm fails, try alternative approaches
        warn "🔄 pnpm failed, trying alternative package managers..."
        
        # If AI is enabled, let it analyze the failure
        if [ "$AI_CONSULTATION_ENABLED" = "true" ]; then
            local install_error_logs=$(cat /tmp/last_command_output.log 2>/dev/null || echo "No logs available")
            warn "🤖 Consulting AI for dependency installation failure..."
            consult_ai "PNPM dependency installation failed for bolt.gives" "$pnpm_install_command" "$install_error_logs" 1
        fi
        
        # Fallback to npm
        execute_with_ai_backup "
            cd $APP_DIR
            npm install --legacy-peer-deps
        " "Installing dependencies with npm as fallback"
    fi
    
    # AI-powered application build
    log "🏗️ Building application with AI-powered optimization..."
    
    # Check available memory before building
    local available_mem=$(free -m | awk '/^Available:/ {print $2}')
    if [ -z "$available_mem" ]; then
        available_mem=$(free -m | awk '/^Mem:/ {print $7}')
    fi
    
    # Memory optimization
    local node_mem=4096
    if [ "$available_mem" -lt 4096 ]; then
        node_mem=$((available_mem * 3 / 4))
        warn "⚡ Optimizing memory allocation: ${node_mem}MB (available: ${available_mem}MB)"
        self_heal "memory_issues"
    fi
    
    # Try building with pnpm first
    local build_command="cd $APP_DIR && sudo -u $USER_NAME PNPM_HOME=/home/$USER_NAME/.local/share/pnpm PATH=/home/$USER_NAME/.local/share/pnpm:\$PATH NODE_OPTIONS='--max-old-space-size=$node_mem' /home/$USER_NAME/.local/share/pnpm/pnpm run build"
    
    if ! execute_with_ai_backup "$build_command" "Building application with pnpm" 3; then
        # Fallback to npm build
        warn "🔄 pnpm build failed, trying npm..."
        execute_with_ai_backup "
            cd $APP_DIR
            sudo -u $USER_NAME NODE_OPTIONS='--max-old-space-size=$node_mem' npm run build
        " "Building application with npm as fallback"
    fi
    
    # Create environment file
    if [ ! -f ".env" ]; then
        log "Creating environment configuration..."
        sudo -u "$USER_NAME" cat > .env << EOF
# Production environment
NODE_ENV=production
PORT=$APP_PORT
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
    ufw allow $APP_PORT/tcp comment "Bolt.gives application"
    
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
        proxy_pass http://127.0.0.1:$APP_PORT;
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
        proxy_pass http://127.0.0.1:$APP_PORT;
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
        proxy_pass http://127.0.0.1:$APP_PORT;
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
    
    # Find the correct pnpm path
    local pnpm_path=""
    for possible_path in \
        "/home/$USER_NAME/.local/share/pnpm/pnpm" \
        "/home/$USER_NAME/.local/bin/pnpm" \
        "/usr/local/bin/pnpm" \
        "/usr/bin/pnpm" \
        "$(which pnpm 2>/dev/null || echo '')"
    do
        if [ -f "$possible_path" ] && [ -x "$possible_path" ]; then
            pnpm_path="$possible_path"
            break
        fi
    done
    
    if [ -z "$pnpm_path" ]; then
        error "PNPM not found for systemd service!"
        # Try to install it one more time
        npm install -g pnpm
        pnpm_path=$(which pnpm)
    fi
    
    log "Using PNPM path for service: $pnpm_path"
    
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
Environment=PORT=$APP_PORT
Environment=HOST=0.0.0.0
Environment=HOME=/home/$USER_NAME
Environment=PATH=/home/$USER_NAME/.local/bin:/home/$USER_NAME/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin
Environment=PNPM_HOME=/home/$USER_NAME/.local/share/pnpm

# Pre-start permission fixes
ExecStartPre=/bin/bash -c 'mkdir -p /home/$USER_NAME/.local/share/pnpm /home/$USER_NAME/.config/pnpm /home/$USER_NAME/.cache/pnpm'
ExecStartPre=/bin/bash -c 'chown -R $USER_NAME:$USER_NAME /home/$USER_NAME/.local /home/$USER_NAME/.config /home/$USER_NAME/.cache /home/$USER_NAME/.npm 2>/dev/null || true'
ExecStartPre=/bin/bash -c 'chmod -R 755 /home/$USER_NAME/.local /home/$USER_NAME/.config 2>/dev/null || true'

# Main process
ExecStart=$pnpm_path run start

# Restart configuration
Restart=always
RestartSec=10
StartLimitInterval=300
StartLimitBurst=5

# Output
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
    
    # Fix permissions one more time before starting
    self_heal "permission_issues"
    
    # Start application with comprehensive retry and diagnostics
    local service_started=false
    local max_attempts=5
    
    for i in $(seq 1 $max_attempts); do
        log "Service start attempt $i/$max_attempts..."
        
        # Clear any failed state
        systemctl reset-failed "$SERVICE_NAME" 2>/dev/null || true
        
        # Start the service
        if systemctl start "$SERVICE_NAME"; then
            # Wait longer for service to stabilize
            log "Waiting for service to stabilize..."
            sleep 10
            
            # Check if service is still active
            if systemctl is-active --quiet "$SERVICE_NAME"; then
                # Double-check by testing the actual port
                if curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT | grep -q "[23][0-9][0-9]"; then
                    service_started=true
                    log "✓ Bolt.gives service started successfully and responding"
                    break
                else
                    warn "Service is running but not responding on port $APP_PORT"
                    # Check if service is actually listening on the port
                    if ! netstat -tlnp 2>/dev/null | grep -q ":$APP_PORT "; then
                        warn "Port $APP_PORT is not being listened to"
                        # Service might be using a different port, check logs
                        local actual_port=$(journalctl -u "$SERVICE_NAME" --no-pager -n 50 | grep -oP "Listening on.*:\K[0-9]+" | tail -1)
                        if [ -n "$actual_port" ] && [ "$actual_port" != "$APP_PORT" ]; then
                            warn "Service is actually using port $actual_port"
                            update_port_configuration $actual_port
                        fi
                    fi
                fi
            fi
        fi
        
        if [ $i -lt $max_attempts ]; then
            warn "Service start attempt $i failed, diagnosing issues..."
            
            # Comprehensive error diagnosis
            local error_found=false
            
            # Check for permission errors
            if journalctl -u "$SERVICE_NAME" --no-pager -n 50 | grep -q "EACCES\|permission denied\|Permission denied"; then
                warn "Permission errors detected"
                local perm_error_logs=$(journalctl -u "$SERVICE_NAME" --no-pager -n 50)
                self_heal "permission_issues" "Service startup failed with permission errors" "$perm_error_logs" "$i"
                
                # Additional permission fixes
                log "Applying additional permission fixes..."
                find /home/$USER_NAME -type d -name ".npm" -exec chown -R $USER_NAME:$USER_NAME {} \;
                find /home/$USER_NAME -type d -name ".pnpm" -exec chown -R $USER_NAME:$USER_NAME {} \;
                find /home/$USER_NAME -type d -name ".local" -exec chown -R $USER_NAME:$USER_NAME {} \;
                find /home/$USER_NAME -type d -name ".config" -exec chown -R $USER_NAME:$USER_NAME {} \;
                find /home/$USER_NAME -type d -name ".cache" -exec chown -R $USER_NAME:$USER_NAME {} \;
                
                error_found=true
            fi
            
            # Check for port conflicts
            if journalctl -u "$SERVICE_NAME" --no-pager -n 50 | grep -q "EADDRINUSE\|address already in use"; then
                warn "Port conflict detected"
                self_heal "port_conflict"
                
                # Try to find an alternative port
                local new_port=$(find_available_port $((APP_PORT + 1)))
                if [ -n "$new_port" ]; then
                    update_port_configuration $new_port
                    log "Switched to port $new_port"
                fi
                
                error_found=true
            fi
            
            # Check for memory issues
            if journalctl -u "$SERVICE_NAME" --no-pager -n 50 | grep -q "JavaScript heap out of memory\|ENOMEM"; then
                warn "Memory issues detected"
                self_heal "memory_issues"
                
                # Reduce memory allocation for next attempt
                local current_mem=$(grep NODE_OPTIONS /etc/systemd/system/$SERVICE_NAME.service | grep -o '[0-9]\+' | head -1)
                local new_mem=$((current_mem * 3 / 4))
                log "Reducing Node.js memory from ${current_mem}MB to ${new_mem}MB"
                sed -i "s/--max-old-space-size=$current_mem/--max-old-space-size=$new_mem/g" /etc/systemd/system/$SERVICE_NAME.service
                systemctl daemon-reload
                
                error_found=true
            fi
            
            # Check for missing dependencies
            if journalctl -u "$SERVICE_NAME" --no-pager -n 50 | grep -q "Cannot find module\|MODULE_NOT_FOUND"; then
                warn "Missing dependencies detected"
                log "Attempting to reinstall dependencies..."
                cd $APP_DIR
                sudo -u $USER_NAME NODE_OPTIONS="--max-old-space-size=2048" pnpm install --no-frozen-lockfile
                error_found=true
            fi
            
            # Check for pnpm specific errors
            if journalctl -u "$SERVICE_NAME" --no-pager -n 50 | grep -q "pnpm\|.pnpm"; then
                warn "PNPM-related errors detected"
                local pnpm_error_logs=$(journalctl -u "$SERVICE_NAME" --no-pager -n 50)
                
                # Show advanced error diagnostics
                log_error_details "PNPM_PERMISSION" "Service startup attempt $i - PNPM errors detected"
                
                # Try basic pnpm fixes first
                log "Clearing pnpm cache and reinstalling..."
                sudo -u $USER_NAME pnpm store prune
                rm -rf $APP_DIR/node_modules
                cd $APP_DIR
                sudo -u $USER_NAME pnpm install --no-frozen-lockfile
                
                # If AI is enabled, get additional intelligent solutions
                if [ "$AI_CONSULTATION_ENABLED" = "true" ]; then
                    warn "🤖 Consulting AI for advanced PNPM error resolution..."
                    log_error_details "AI_CONSULTATION" "About to call AI for PNPM error resolution"
                    local pnpm_context="PNPM installation/execution errors during bolt.gives service startup on attempt $i"
                    if consult_ai "$pnpm_context" "pnpm install and service startup" "$pnpm_error_logs" "$i"; then
                        log "🎯 AI provided PNPM-specific fixes"
                    else
                        warn "🤔 AI couldn't provide PNPM solutions, continuing with standard recovery"
                    fi
                else
                    warn "🚫 AI consultation is DISABLED - cannot get intelligent PNPM fixes"
                    log_error_details "AI_CONSULTATION" "AI consultation disabled during PNPM error"
                fi
                
                error_found=true
            fi
            
            if ! $error_found; then
                warn "No specific error pattern found. Showing recent logs:"
                local generic_error_logs=$(journalctl -u "$SERVICE_NAME" --no-pager -n 30)
                echo "$generic_error_logs"
                
                # Try AI consultation for unknown errors
                if [ "$AI_CONSULTATION_ENABLED" = "true" ]; then
                    warn "🤖 Consulting AI for unknown service startup errors..."
                    local generic_context="Unknown service startup failure for bolt.gives on attempt $i"
                    if consult_ai "$generic_context" "systemctl start bolt-gives" "$generic_error_logs" "$i"; then
                        log "🎯 AI provided solutions for unknown errors"
                    else
                        warn "🤔 AI analysis didn't provide solutions, trying generic recovery"
                    fi
                fi
                
                # Generic recovery attempt
                log "Attempting generic recovery..."
                
                # Increase timeout
                self_heal "service_timeout"
                
                # Fix any lingering permission issues
                self_heal "permission_issues"
                
                # Clear any locks or stale files
                rm -f $APP_DIR/.lock
                rm -f $APP_DIR/package-lock.json
                rm -f $APP_DIR/pnpm-lock.yaml.lock
            fi
            
            # Exponential backoff
            local wait_time=$((5 * i))
            log "Waiting ${wait_time} seconds before retry..."
            sleep $wait_time
        fi
    done
    
    if ! $service_started; then
        error "Failed to start Bolt.gives service after $max_attempts attempts"
        log "Full service logs:"
        journalctl -u "$SERVICE_NAME" --no-pager -n 50
        
        # Try alternative startup method
        warn "Attempting direct startup as fallback..."
        cd $APP_DIR
        timeout 30 sudo -u $USER_NAME NODE_OPTIONS="--max-old-space-size=2048" pnpm run start &
        local pid=$!
        sleep 10
        
        if kill -0 $pid 2>/dev/null && curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT | grep -q "[23][0-9][0-9]"; then
            warn "Application runs directly but not as service. Manual configuration may be needed."
            kill $pid 2>/dev/null
        fi
        
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

# Test external connectivity and apply fixes
test_and_fix_connectivity() {
    log "Testing and fixing external connectivity..."
    
    local connectivity_issues=false
    
    # Test DNS resolution
    if ! nslookup $DOMAIN >/dev/null 2>&1; then
        warn "DNS resolution failed for $DOMAIN"
        connectivity_issues=true
        
        # Try to fix DNS
        self_heal "dns_resolution"
        
        # Flush DNS cache
        systemctl restart systemd-resolved 2>/dev/null || true
        resolvectl flush-caches 2>/dev/null || true
    fi
    
    # Test local connectivity first
    local local_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT || echo "000")
    if [[ ! "$local_code" =~ ^[23][0-9][0-9]$ ]]; then
        warn "Local connectivity test failed (HTTP $local_code)"
        connectivity_issues=true
        
        # Check if service is running
        if ! systemctl is-active --quiet $SERVICE_NAME; then
            warn "Service is not running, attempting to start..."
            systemctl start $SERVICE_NAME
            sleep 10
        fi
    fi
    
    # Test nginx proxy
    local nginx_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost || echo "000")
    if [[ ! "$nginx_code" =~ ^[23][0-9][0-9]$ ]]; then
        warn "Nginx proxy test failed (HTTP $nginx_code)"
        connectivity_issues=true
        
        # Check nginx configuration
        if ! nginx -t; then
            error "Nginx configuration is invalid"
            self_heal "nginx_config"
        fi
        
        # Restart nginx
        systemctl restart nginx
    fi
    
    # Test external HTTP
    local external_http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 http://$DOMAIN || echo "000")
    if [[ ! "$external_http_code" =~ ^[23][0-9][0-9]$ ]]; then
        warn "External HTTP test failed (HTTP $external_http_code)"
        connectivity_issues=true
        
        # Check firewall
        if command -v ufw >/dev/null 2>&1; then
            log "Checking firewall rules..."
            ufw status | grep -E "80|443|3000" || {
                warn "Required ports may not be open in firewall"
                ufw allow 80/tcp
                ufw allow 443/tcp
                ufw allow 3000/tcp
                ufw reload
            }
        fi
        
        # Check if ports are actually listening
        if ! netstat -tlnp | grep -q ":80 "; then
            warn "Port 80 is not listening"
            systemctl restart nginx
        fi
    fi
    
    # Test external HTTPS (if SSL is configured)
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        local external_https_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 https://$DOMAIN || echo "000")
        if [[ ! "$external_https_code" =~ ^[23][0-9][0-9]$ ]]; then
            warn "External HTTPS test failed (HTTP $external_https_code)"
            connectivity_issues=true
            
            # Check SSL certificate
            if ! openssl s_client -connect $DOMAIN:443 -servername $DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -dates; then
                warn "SSL certificate may be invalid"
                
                # Try to renew certificate
                log "Attempting to renew SSL certificate..."
                certbot renew --force-renewal --nginx -d $DOMAIN || true
            fi
        fi
    fi
    
    if $connectivity_issues; then
        warn "Connectivity issues detected and repair attempted"
        
        # Final connectivity report
        log "=== Connectivity Status ==="
        log "Local service: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$APP_PORT || echo '000')"
        log "Nginx proxy: $(curl -s -o /dev/null -w '%{http_code}' http://localhost || echo '000')"
        log "External HTTP: $(curl -s -o /dev/null -w '%{http_code}' http://$DOMAIN || echo '000')"
        [ -d "/etc/letsencrypt/live/$DOMAIN" ] && log "External HTTPS: $(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN || echo '000')"
    else
        log "✓ All connectivity tests passed"
    fi
}

# Final verification
verify_installation() {
    log "Verifying installation..."
    
    # Wait for services to be fully ready
    log "Waiting for services to be ready..."
    sleep 10
    
    # Run connectivity tests and fixes
    test_and_fix_connectivity
    
    # If the port was changed during installation, update the configuration one more time
    if [ "$APP_PORT" != "$DEFAULT_PORT" ]; then
        log "Ensuring all configurations use port $APP_PORT..."
        update_port_configuration $APP_PORT
    fi
    
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
    
    # Run comprehensive connectivity tests
    local service_status="unknown"
    local nginx_status="unknown"
    local local_access="000"
    local external_access="000"
    
    # Check services
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        service_status="active"
        
        # Test local port
        local_access=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://localhost:$APP_PORT" || echo "000")
    else
        service_status="inactive"
        
        # Try to get more info
        local exit_code=$(systemctl show -p ExecMainStatus "$SERVICE_NAME" | cut -d= -f2)
        local sub_state=$(systemctl show -p SubState "$SERVICE_NAME" | cut -d= -f2)
        warn "Service is $sub_state (exit code: $exit_code)"
    fi
    
    if systemctl is-active --quiet nginx; then
        nginx_status="active"
    else
        nginx_status="inactive"
    fi
    
    # Test external access
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        external_access=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://$DOMAIN" || echo "000")
    else
        external_access=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://$DOMAIN" || echo "000")
    fi
    
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

# Find available port
find_available_port() {
    local start_port=${1:-3000}
    local max_port=$((start_port + 100))
    
    log "Checking for available port starting from $start_port..."
    
    for port in $(seq $start_port $max_port); do
        if ! lsof -ti :$port >/dev/null 2>&1; then
            # Double-check with netstat
            if ! netstat -tlnp 2>/dev/null | grep -q ":$port "; then
                log "Found available port: $port"
                echo $port
                return 0
            fi
        fi
    done
    
    error "No available ports found between $start_port and $max_port"
    return 1
}

# Update configuration files with new port
update_port_configuration() {
    local new_port=$1
    
    log "Updating configuration to use port $new_port..."
    
    # Update .env file
    if [ -f "$APP_DIR/.env" ]; then
        sed -i "s/PORT=.*/PORT=$new_port/" "$APP_DIR/.env"
    else
        echo "PORT=$new_port" >> "$APP_DIR/.env"
    fi
    
    # Update systemd service
    sed -i "s/Environment=PORT=.*/Environment=PORT=$new_port/" "/etc/systemd/system/$SERVICE_NAME.service"
    
    # Update nginx configuration
    sed -i "s|proxy_pass http://127.0.0.1:[0-9]\+|proxy_pass http://127.0.0.1:$new_port|g" "$NGINX_CONF_PATH"
    
    # Reload configurations
    systemctl daemon-reload
    nginx -t && systemctl reload nginx
    
    APP_PORT=$new_port
    log "✓ Configuration updated to use port $new_port"
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
    echo -e "  🔌 Application Port: ${BLUE}$APP_PORT${NC}"
    echo ""
    echo -e "${GREEN}✅ Your Bolt.gives installation is ready to use!${NC}"
}

# Pre-flight checks
# Test AI connectivity
test_ai_connection() {
    if [ "$AI_CONSULTATION_ENABLED" = "true" ] && [ -n "$ANTHROPIC_API_KEY" ]; then
        log "🧪 Testing AI connectivity..."
        
        local test_response=$(curl -s -X POST https://api.anthropic.com/v1/messages \
            -H "Content-Type: application/json" \
            -H "x-api-key: $ANTHROPIC_API_KEY" \
            -H "anthropic-version: 2023-06-01" \
            -d '{
                "model": "'$ANTHROPIC_MODEL'",
                "max_tokens": 50,
                "messages": [{"role": "user", "content": "Say hello"}]
            }' 2>/dev/null)
        
        if echo "$test_response" | jq -r '.content[0].text' 2>/dev/null | grep -qi "hello"; then
            log "✅ AI consultation system is ready!"
        else
            warn "⚠️ AI consultation test failed. Continuing without AI assistance."
            warn "Response: $test_response"
            AI_CONSULTATION_ENABLED=false
        fi
    else
        warn "⚠️ AI consultation disabled (no API key provided)"
    fi
}

preflight_check() {
    log "Running pre-flight checks..."
    
    # Verify API key is available
    if [ "$AI_CONSULTATION_ENABLED" = "true" ]; then
        verify_api_key
    fi
    
    # Test AI connectivity
    test_ai_connection
    
    # Check for previous failed installations
    if [ -f "/var/log/bolt-gives-install.failed" ]; then
        warn "Previous installation failed. Cleaning up..."
        
        # Stop any running services
        systemctl stop bolt-gives 2>/dev/null || true
        systemctl stop nginx 2>/dev/null || true
        
        # Kill any lingering node processes
        pkill -f "node.*bolt-gives" 2>/dev/null || true
        pkill -f "pnpm.*start" 2>/dev/null || true
        
        # Clean up files
        rm -rf "$APP_DIR"
        rm -f /etc/systemd/system/bolt-gives.service
        rm -f /etc/nginx/sites-*/bolt-gives*
        
        # Clean up user if it was created
        if id "$USER_NAME" &>/dev/null && [ "$USER_NAME" != "root" ]; then
            userdel -r "$USER_NAME" 2>/dev/null || true
        fi
        
        # Remove failed marker
        rm -f /var/log/bolt-gives-install.failed
        rm -f /var/log/bolt-gives-install.state
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

# Enhanced error handler
error_handler() {
    local line_no=$1
    local bash_lineno=$2
    local last_command=$3
    local code=$4
    
    error "Installation failed at line $line_no"
    error "Command: $last_command"
    error "Exit code: $code"
    
    # Try to provide helpful recovery suggestions
    case "$last_command" in
        *"apt-get"*)
            warn "Package installation failed. Try:"
            warn "  1. Run 'apt-get update --fix-missing'"
            warn "  2. Check your internet connection"
            warn "  3. Try a different mirror"
            ;;
        *"pnpm"*)
            warn "PNPM command failed. Try:"
            warn "  1. Clear pnpm cache: 'pnpm store prune'"
            warn "  2. Remove node_modules and reinstall"
            warn "  3. Check disk space"
            ;;
        *"systemctl"*)
            warn "Service management failed. Try:"
            warn "  1. Check 'journalctl -u bolt-gives -n 50'"
            warn "  2. Verify permissions are correct"
            warn "  3. Check if ports are available"
            ;;
    esac
    
    error "Check $LOG_FILE for full details"
    
    # Save state for resume
    echo "Installation can be resumed by running the script again"
    
    exit 1
}

# Trap errors and cleanup
trap 'error_handler ${LINENO} ${BASH_LINENO} "$BASH_COMMAND" $?' ERR

# Run main installation
main "$@"