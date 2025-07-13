# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `pnpm install` - Install dependencies
- `pnpm run dev` - Start development server on port 5174
- `pnpm run build` - Build the project for production
- `pnpm run preview` - Build and run production build locally
- `pnpm run start` - Run built application using Wrangler Pages
- `pnpm run deploy` - Deploy to Cloudflare Pages

### Testing and Quality
- `pnpm test` - Run test suite with Vitest
- `pnpm run test:watch` - Run tests in watch mode
- `pnpm run typecheck` - Run TypeScript type checking
- `pnpm run lint` - Run ESLint on app directory
- `pnpm run lint:fix` - Fix linting issues and format with Prettier

### Electron Desktop App
- `pnpm run electron:build:deps` - Build main and preload processes
- `pnpm run electron:build:unpack` - Build unpacked Electron app
- `pnpm run electron:build:mac` - Build macOS app
- `pnpm run electron:build:win` - Build Windows app
- `pnpm run electron:build:linux` - Build Linux app

### Docker
- `pnpm run dockerbuild` - Build Docker image
- `pnpm run dockerrun` - Run Docker container
- `docker compose --profile development up` - Run with Docker Compose

## High-Level Architecture

### Core Structure
bolt.gives is a Remix-based web application that provides an AI-powered full-stack development environment in the browser. It uses WebContainers for sandboxed execution and supports multiple LLM providers.

### Key Components

#### 1. **LLM Provider System** (`app/lib/modules/llm/`)
- **Manager**: `LLMManager` singleton handles provider registration and model management
- **Base Provider**: All providers extend `BaseProvider` class
- **Registry**: Auto-registers providers from `providers/` directory
- **Supported Providers**: OpenAI, Anthropic, Ollama, Google, Mistral, xAI, DeepSeek, Groq, etc.

#### 2. **WebContainer Integration** (`app/lib/webcontainer/`)
- **Sandboxed Environment**: Uses `@webcontainer/api` for isolated Node.js execution
- **File System**: Virtual file system with real-time synchronization
- **Terminal Integration**: Connected to WebContainer process execution
- **Preview Support**: Live preview with error forwarding and inspector script injection

#### 3. **Store Architecture** (`app/lib/stores/`)
- **Nanostores**: Reactive state management using nanostores
- **WorkbenchStore**: Central store managing files, editor, terminal, and artifacts
- **Execution Queue**: Sequential action execution with global queue management
- **File Locking**: Prevents concurrent edits with lockFile/unlockFile methods

#### 4. **Action Runner System** (`app/lib/runtime/`)
- **Message Parser**: Parses AI responses into structured actions
- **Action Runner**: Executes file operations, shell commands, and other actions
- **Streaming Support**: Real-time action execution with sampling for performance
- **Error Handling**: Comprehensive error reporting and recovery

#### 5. **Editor Integration** (`app/components/editor/`)
- **CodeMirror**: Advanced code editor with syntax highlighting
- **Multi-file Support**: Tab-based file management
- **Diff View**: Shows changes between file versions
- **Binary File Support**: Handles binary files with proper content detection

#### 6. **Chat Interface** (`app/components/chat/`)
- **Streaming Chat**: Real-time conversation with AI models
- **Artifact System**: Manages generated code artifacts and their execution
- **Context Management**: Maintains conversation history and context
- **Import/Export**: Chat history backup and restoration

### Data Flow

1. **User Input**: Chat messages processed through message parser
2. **AI Response**: Parsed into structured actions (file operations, shell commands)
3. **Action Execution**: ActionRunner executes actions in WebContainer
4. **State Updates**: Stores update reactive state across components
5. **UI Updates**: Components re-render based on store changes

### File System Integration

- **Virtual Files**: All files exist in WebContainer's virtual file system
- **Real-time Sync**: Changes immediately reflected in editor and file tree
- **Modification Tracking**: Tracks file changes with reset capabilities
- **Export Options**: Download as ZIP or sync to local folder

### Authentication System

#### User Management
- **User Database**: IndexedDB-based user storage in `boltUsers` database
- **Session Management**: In-memory session tokens with 7-day expiration
- **Password Security**: bcrypt hashing with salt rounds of 12
- **User Isolation**: Each user has separate chat histories and snapshots

#### Authentication Flow
1. **Registration**: Username/email validation, password hashing, user creation
2. **Login**: Credential verification, session token generation
3. **Session Persistence**: localStorage token storage with automatic verification
4. **Logout**: Session cleanup and token removal

#### Database Schema
- **Users Store**: `id`, `username`, `email`, `password`, `createdAt`, `lastLogin`
- **User Chats Store**: User-specific chat histories with `userId` foreign key
- **User Snapshots Store**: User-specific project snapshots with composite key

#### API Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - Session termination
- `GET /api/auth/me` - Current user information

### Key Design Patterns

- **Singleton Pattern**: LLMManager for centralized provider management
- **Observer Pattern**: Nanostores for reactive state management
- **Queue Pattern**: Sequential execution of actions to prevent conflicts
- **Factory Pattern**: Provider registration and instantiation
- **Store Pattern**: Centralized state management with WorkbenchStore
- **Guard Pattern**: AuthGuard component protects authenticated routes

### Environment Configuration

- **Vite Configuration**: Custom setup with node polyfills and UnoCSS
- **TypeScript**: Strict mode with path aliases (`~/*` → `./app/*`)
- **Environment Variables**: Prefixed with `VITE_` for client-side access
- **Hot Module Replacement**: Preserves state during development

### Testing Strategy

- **Vitest**: Unit testing framework
- **JSDOM**: DOM simulation for component testing
- **Testing Library**: React component testing utilities
- **Mocking**: WebContainer and provider mocking for isolated tests

## Production Deployment

### Automated Installation Script

Bolt.gives includes a comprehensive installation script (`install.sh`) that sets up everything needed for a production deployment on Ubuntu/Debian servers. The script features advanced self-healing capabilities and intelligent error recovery mechanisms.

#### Self-Healing Features

**Automatic Issue Detection & Resolution:**
- **Nginx Configuration Validation**: Automatically detects and fixes common nginx syntax errors
- **Memory Management**: Dynamically adjusts Node.js memory allocation based on available system resources
- **Port Conflict Resolution**: Detects and resolves port 3000 conflicts automatically
- **DNS Resolution Fixes**: Automatically configures DNS servers if resolution issues are detected
- **Package Lock Recovery**: Cleans up APT locks and fixes broken packages
- **Disk Space Optimization**: Automatically cleans caches and old logs when disk space is low

**Intelligent Retry Mechanisms:**
- **Exponential Backoff**: Failed operations retry with increasing delays
- **Context-Aware Retries**: Different retry strategies based on failure type
- **Alternative Methods**: Falls back to alternative installation methods when primary fails
- **Network Resilience**: Switches to mirror registries on network failures

**Installation State Management:**
- **Resume Capability**: Installations can be resumed from the last successful step
- **Failed Installation Cleanup**: Automatically detects and cleans up previous failed installations
- **Progress Tracking**: Saves installation state for recovery purposes

**Build & Deployment Intelligence:**
- **Memory-Aware Building**: Reduces Node.js memory allocation if builds fail due to memory
- **Automatic Swap Creation**: Creates swap file on low-memory systems
- **Dependency Resolution**: Tries multiple NPM registries and cleans caches on failures
- **Permission Auto-Fixing**: Automatically corrects file ownership issues

#### Prerequisites

- Ubuntu 20.04+ or Debian 11+ server
- Root access or sudo privileges
- A domain name pointing to your server's IP address
- Minimum 5GB available disk space
- Minimum 2GB RAM (4GB recommended)

#### Quick Installation

1. **Download the installation script:**
   ```bash
   wget https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh
   chmod +x install.sh
   ```

2. **Run the installation script as root:**
   ```bash
   sudo ./install.sh
   ```

3. **Follow the prompts:**
   - The script will detect your server's public IP address
   - Configure your domain's A record to point to the displayed IP
   - Enter your domain name when prompted
   - Wait for the automated installation to complete

#### What the Script Does

**System Setup:**
- Updates all system packages
- Installs required dependencies (Node.js 20, pnpm, nginx, certbot, etc.)
- Configures firewall rules (ports 22, 80, 443)
- Creates dedicated application user (`bolt`)

**Application Deployment:**
- Clones the latest Bolt.gives repository to `/opt/bolt-gives`
- Installs all dependencies with pnpm
- Builds the production application
- Configures Node.js with 4GB memory limit
- Sets up environment variables for production

**Web Server & SSL:**
- Configures Nginx as reverse proxy
- Obtains and installs Let's Encrypt SSL certificate
- Sets up automatic SSL certificate renewal
- Configures security headers and gzip compression
- Redirects HTTP traffic to HTTPS

**Service Management:**
- Creates systemd service for automatic startup
- Configures log rotation
- Sets up fail2ban for additional security
- Configures monitoring and health checks

**Security Features:**
- Firewall configuration with UFW
- fail2ban protection against brute force attacks
- Security headers (HSTS, XSS protection, etc.)
- Non-root application execution
- Automatic security updates

#### Post-Installation

After successful installation, your Bolt.gives instance will be:

- **Accessible at:** `https://yourdomain.com`
- **Service status:** `systemctl status bolt-gives`
- **Logs:** `journalctl -u bolt-gives -f`
- **Configuration:** `/opt/bolt-gives/.env`

#### Service Management Commands

```bash
# Check service status
systemctl status bolt-gives

# Start/stop/restart the service
systemctl start bolt-gives
systemctl stop bolt-gives
systemctl restart bolt-gives

# View real-time logs
journalctl -u bolt-gives -f

# Check nginx status
systemctl status nginx

# Test nginx configuration
nginx -t

# Renew SSL certificate manually
certbot renew --dry-run
```

#### Troubleshooting

**Common Issues:**

1. **DNS not propagated:** Wait 15-30 minutes for DNS changes to propagate globally
2. **SSL certificate failed:** Ensure domain points to correct IP and ports 80/443 are open
3. **Service won't start:** Check logs with `journalctl -u bolt-gives -n 50`
4. **Memory issues:** Monitor with `htop` and adjust Node.js memory if needed
5. **Nginx configuration errors:** The script now includes self-healing mechanisms that:
   - Automatically backs up existing configurations
   - Validates and fixes nginx configuration syntax errors
   - Converts problematic quote styles in headers
   - Tests nginx configuration before applying changes
   - Falls back to HTTP-only if SSL setup fails
   - Completely resets nginx to clean state if needed

**Nginx-Specific Troubleshooting:**

If you encounter nginx errors like "invalid value" or configuration test failures:

1. **Check nginx error logs:** `tail -f /var/log/nginx/error.log`
2. **Test current configuration:** `nginx -t`
3. **View current configuration:** `cat /etc/nginx/sites-enabled/bolt-gives`
4. **Manual fix:** Remove problematic config and restart:
   ```bash
   rm -f /etc/nginx/sites-enabled/bolt-gives*
   rm -f /etc/nginx/sites-available/bolt-gives*
   systemctl restart nginx
   ```
5. **Re-run installer:** The script will clean up and reconfigure nginx automatically

**Error Recovery:**

The installation script includes comprehensive error handling and retry mechanisms. If installation fails:

1. Check the installation log: `/var/log/bolt-gives-install.log`
2. Fix any network/DNS issues
3. Re-run the installation script - it's designed to resume from where it left off

**Using Self-Healing Features:**

The installer automatically detects and fixes common issues:

```bash
# The script will automatically:
# - Resume from the last successful step
# - Clean up failed installations
# - Fix configuration errors
# - Retry with exponential backoff
# - Switch to alternative methods

# To force a complete reinstall:
rm -f /var/log/bolt-gives-install.state
rm -f /var/log/bolt-gives-install.failed
sudo ./install.sh

# To manually trigger self-healing for specific issues:
# (These are normally called automatically by the script)
self_heal "nginx_config"      # Fix nginx issues
self_heal "port_conflict"     # Resolve port conflicts
self_heal "package_locks"     # Fix APT locks
self_heal "dns_resolution"    # Fix DNS issues
self_heal "memory_issues"     # Optimize memory
```

**Installation State Recovery:**

The script tracks installation progress and can resume from failures:

- State file: `/var/log/bolt-gives-install.state`
- Failed marker: `/var/log/bolt-gives-install.failed`
- Installation phases: ip_detected → domain_configured → system_checked → dependencies_installed → nodejs_installed → pnpm_installed → app_setup → firewall_configured → nginx_configured → ssl_configured → service_created → monitoring_setup → services_started → verified

**Manual Configuration:**

For custom configurations, edit `/opt/bolt-gives/.env` and restart the service:

```bash
sudo nano /opt/bolt-gives/.env
sudo systemctl restart bolt-gives
```

#### Performance Optimization

**Default Configuration:**
- Node.js memory limit: 4GB (`NODE_OPTIONS="--max-old-space-size=4096"`)
- Nginx worker processes: Auto-detected based on CPU cores
- Gzip compression enabled for static assets
- Proxy timeouts optimized for long-running operations

**Monitoring:**
- Application logs: `journalctl -u bolt-gives`
- Nginx logs: `/var/log/nginx/access.log` and `/var/log/nginx/error.log`
- System resources: `htop` or `top`
- Disk usage: `df -h`

#### Security Best Practices

The installation script implements security best practices:

- **Firewall:** Only essential ports (22, 80, 443) are open
- **SSL/TLS:** Modern TLS configuration with HSTS
- **fail2ban:** Protection against brute force attacks
- **Non-root execution:** Application runs as dedicated user
- **Security headers:** XSS protection, content type validation
- **Auto-updates:** Automatic security updates for system packages

#### Backup and Maintenance

**Automated Backups:** Consider setting up automated backups of:
- Application directory: `/opt/bolt-gives`
- SSL certificates: `/etc/letsencrypt`
- Nginx configuration: `/etc/nginx/sites-available/bolt-gives`

**Regular Maintenance:**
- SSL certificates auto-renew every 60 days
- System packages should be updated monthly
- Monitor disk space and clean logs as needed
- Review security logs in `/var/log/auth.log`