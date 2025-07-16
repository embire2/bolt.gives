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
- **Multi-Model Orchestration**: NEW! Coordinate multiple AI models working together

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
- **Mode Selection**: Choose between Standard Mode and Multi-Model Orchestration
- **Multi-Model Selector**: Interface for selecting 2 AI models with API key configuration

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

### Multi-Model Orchestration System

#### Components
1. **ModeSelector** (`app/components/chat/ModeSelector.tsx`)
   - Initial mode selection interface
   - Comparison between Standard and Orchestration modes
   - Triggers MultiModelSelector when orchestration is chosen

2. **MultiModelSelector** (`app/components/chat/MultiModelSelector.tsx`)
   - Grid-based provider selection (exactly 2 models)
   - Dynamic model fetching per provider
   - Individual API key configuration
   - Detailed explanation of orchestration benefits

3. **OrchestrationManager** (`app/lib/modules/orchestration/OrchestrationManager.ts`)
   - Singleton pattern for orchestration coordination
   - Task decomposition (code, review, test, documentation)
   - Parallel model execution with streaming
   - Consensus analysis for result validation

4. **OrchestrationStore** (`app/lib/stores/orchestration.ts`)
   - Session and task state management
   - Real-time metrics tracking
   - Panel visibility control

5. **OrchestrationPanel** (`app/components/chat/OrchestrationPanel.tsx`)
   - Real-time task monitoring UI
   - Metrics display (total, active, completed, failed)
   - Task status visualization with icons

#### Orchestration Flow
1. User selects "Multi-Model Orchestration" mode
2. MultiModelSelector opens for choosing 2 AI models
3. API keys configured for each selected model
4. OrchestrationManager decomposes user request into tasks
5. Tasks distributed between models for parallel execution
6. Real-time streaming of responses from both models
7. Consensus analysis determines best solutions
8. Combined results presented to user

### Key Design Patterns

- **Singleton Pattern**: LLMManager and OrchestrationManager for centralized management
- **Observer Pattern**: Nanostores for reactive state management
- **Queue Pattern**: Sequential execution of actions to prevent conflicts
- **Factory Pattern**: Provider registration and instantiation
- **Store Pattern**: Centralized state management with WorkbenchStore and OrchestrationStore
- **Guard Pattern**: AuthGuard component protects authenticated routes
- **Strategy Pattern**: Different execution strategies for Standard vs Orchestration modes

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

Bolt.gives includes a production-ready installation script (`install.sh`) that sets up everything needed for a production deployment on Ubuntu/Debian servers. The script has been thoroughly tested and fixed based on real-world deployment experiences.

#### Key Features

**Reliable Installation Process:**
- **PNPM Package Manager**: Uses PNPM exclusively for dependency management (no NPM fallbacks)
- **Correct Port Configuration**: Properly configured for port 8788 (wrangler's default port)
- **State Management**: Saves installation progress and can resume from failures
- **Domain Configuration Persistence**: Prevents configuration loops by saving domain settings

**Automatic Issue Detection & Resolution:**
- **Permission Management**: Comprehensive permission fixes for all pnpm and user directories
- **Nginx Configuration Validation**: Automatically detects and fixes common nginx syntax errors
- **Memory Management**: Dynamically adjusts Node.js memory allocation based on available system resources
- **Dynamic Port Detection**: Automatically finds available ports if default port 8788 is in use
- **Port Conflict Resolution**: Detects conflicts and intelligently switches to available ports
- **DNS Resolution Fixes**: Automatically configures DNS servers if resolution issues are detected
- **Package Lock Recovery**: Cleans up APT locks and fixes broken packages
- **Disk Space Optimization**: Automatically cleans caches and old logs when disk space is low
- **Service Recovery**: Enhanced service startup with comprehensive error diagnosis

**Intelligent Retry Mechanisms:**
- **Exponential Backoff**: Failed operations retry with increasing delays
- **Context-Aware Retries**: Different retry strategies based on failure type
- **Alternative Methods**: Falls back to alternative installation methods when primary fails
- **Network Resilience**: Switches to mirror registries on network failures
- **Service Startup Retries**: Up to 5 attempts with intelligent error analysis

**Installation State Management:**
- **Resume Capability**: Installations can be resumed from the last successful step
- **Failed Installation Cleanup**: Automatically detects and cleans up previous failed installations
- **Progress Tracking**: Saves installation state for recovery purposes
- **User Cleanup**: Removes created users and files from failed installations

**Build & Deployment Intelligence:**
- **Memory-Aware Building**: Reduces Node.js memory allocation if builds fail due to memory
- **Automatic Swap Creation**: Creates swap file on low-memory systems
- **Dependency Resolution**: Tries multiple NPM registries and cleans caches on failures
- **Permission Auto-Fixing**: Automatically corrects file ownership issues before each service start
- **Port Configuration Updates**: Dynamically updates all configuration files when port changes

**Service Startup Intelligence:**
- **Comprehensive Error Detection**: Identifies permission, port, memory, and dependency issues
- **Auto-Recovery Actions**: Applies specific fixes based on detected error patterns
- **Direct Startup Testing**: Falls back to direct execution testing if service fails
- **Port Usage Detection**: Detects if service is actually using a different port than configured

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
- Configures firewall rules (ports 22, 80, 443, and application port)
- Creates dedicated application user (`bolt`) with proper permissions

**Application Deployment:**
- Clones the latest Bolt.gives repository to `/opt/bolt-gives`
- Creates all necessary user directories (.local, .config, .cache, .npm)
- Sets proper permissions for pnpm operations
- Detects available ports and configures accordingly
- Installs all dependencies with pnpm (with retry mechanisms)
- Builds the production application (with memory optimization)
- Configures Node.js with dynamic memory allocation
- Sets up environment variables for production

**Web Server & SSL:**
- Configures Nginx as reverse proxy
- Automatically detects and uses available ports
- Obtains and installs Let's Encrypt SSL certificate
- Sets up automatic SSL certificate renewal
- Configures security headers and gzip compression
- Redirects HTTP traffic to HTTPS
- Falls back to HTTP if SSL setup fails

**Service Management:**
- Creates systemd service with pre-start permission fixes
- Implements comprehensive service startup validation
- Configures log rotation
- Sets up fail2ban for additional security
- Configures monitoring and health checks
- Automatic service recovery with intelligent error diagnosis

**Security Features:**
- Firewall configuration with UFW
- fail2ban protection against brute force attacks
- Security headers (HSTS, XSS protection, etc.)
- Non-root application execution
- Automatic security updates
- Comprehensive permission management

**Enhanced Installation Features:**
- **Smart Error Recovery**: Automatically detects and fixes common issues
- **Port Flexibility**: Finds available ports if defaults are in use
- **Permission Management**: Ensures all directories have correct ownership
- **Memory Optimization**: Adjusts based on available system resources
- **Network Resilience**: Falls back to alternative registries and methods
- **Service Validation**: Multiple checks to ensure service starts correctly
- **External Connectivity Testing**: Verifies the application is accessible
- **Progress Tracking**: Can resume failed installations

#### Post-Installation

After successful installation, your Bolt.gives instance will be:

- **Accessible at:** `https://yourdomain.com`
- **Service status:** `systemctl status bolt-gives`
- **Logs:** `journalctl -u bolt-gives -f`
- **Configuration:** `/opt/bolt-gives/.env`

#### Installation Options

```bash
# Standard installation
sudo ./install.sh
```

The script includes comprehensive error handling and automatic recovery mechanisms to ensure a smooth installation process.

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
5. **Permission errors (EACCES):** The script now automatically fixes permission issues:
   - Creates all necessary pnpm directories with correct ownership
   - Fixes .npmrc and .config/pnpm permissions
   - Sets proper permissions before each service start
   - Comprehensive permission healing mechanism
6. **Port conflicts:** The script automatically handles port issues:
   - Detects if port 3000 is in use
   - Automatically finds an available port (3000-3100)
   - Updates all configurations with the new port
   - Displays the actual port in use after installation
7. **Nginx configuration errors:** The script includes self-healing mechanisms that:
   - Automatically backs up existing configurations
   - Validates and fixes nginx configuration syntax errors
   - Converts problematic quote styles in headers
   - Tests nginx configuration before applying changes
   - Falls back to HTTP-only if SSL setup fails
   - Completely resets nginx to clean state if needed

**Recent Critical Fixes (v2.0.0):**

- **Removed AI Consultation**: Simplified installation by removing AI features that were causing issues
- **Fixed Port Configuration**: Now correctly uses port 8788 for wrangler instead of 3000
- **Fixed Domain Loop**: Added domain configuration persistence to prevent repeated prompts
- **Fixed Permission Errors**: Comprehensive permission fixes for all PNPM directories and bindings.sh
- **PNPM Only**: Removed all NPM fallbacks; uses PNPM exclusively as designed
- **Proper Build Process**: Uses `pnpm run build` for correct Remix/Vite builds
- **Service Configuration**: Correctly configured to use `pnpm run start` command

**Recent Critical Fixes (v1.0.3):**

- **API Key Configuration**: Removed hardcoded invalid Anthropic API key; now supports environment variable configuration
- **bindings.sh Permission Error**: Fixed "Permission denied" error by adding automatic execute permissions for all shell scripts
- **Installation State Management**: Fixed installation loop issues by implementing proper state persistence and resume capability
- **Domain Configuration Loop**: Script now saves domain configuration to avoid repeated DNS setup prompts
- **DNS Server Configuration**: Added automatic configuration of Cloudflare (1.1.1.1) and Google DNS for improved reliability
- **Application Deployment Verification**: Enhanced repository cloning with verification checks for critical files

**Recent Critical Fixes (v1.0.2):**

- **Swap Creation Error**: Fixed "fallocate: fallocate failed: Text file busy" by adding proper error handling with dd fallback and disk space checks
- **PNPM Permission Issues**: Fixed persistent EACCES permission errors by implementing comprehensive directory creation and permission management
- **Memory Optimization**: Added disk space checks before swap creation and improved error handling for low-memory systems
- **Build Process**: Streamlined build to use npm consistently throughout the installation for better reliability
- **Error Recovery**: Enhanced self-healing mechanisms to handle swap creation failures gracefully

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

**What Happens During Errors:**

When the script encounters errors, it will:

1. **Identify the Error Type**: Analyzes logs for specific error patterns
2. **Apply Targeted Fixes**: 
   - Permission errors → Fixes ownership and creates missing directories
   - Port conflicts → Finds available port and updates all configurations
   - Memory issues → Reduces Node.js memory allocation or creates swap
   - Network errors → Switches to mirror registries or fixes DNS
   - Build failures → Cleans caches and retries with reduced resources
3. **Retry with Intelligence**: Uses exponential backoff and different strategies
4. **Provide Context**: Shows helpful error messages and suggestions
5. **Save Progress**: Allows resuming from the last successful step

**Service Startup Issues:**

If the service fails to start, the script will:
- Perform up to 5 startup attempts
- Diagnose each failure (permissions, ports, memory, dependencies)
- Apply specific fixes for each issue type
- Test direct execution as a fallback
- Continue installation even if service fails (allowing manual fixes)

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
self_heal "permission_issues" # Fix permission problems
self_heal "service_timeout"   # Increase service timeouts
self_heal "build_failure"     # Clean and retry builds
self_heal "network_issues"    # Fix network connectivity
self_heal "ssl_issues"        # Handle SSL certificate problems
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

## Recent Updates

### Multi-Model Orchestration Enhancement (2025-07-16)

#### Updated Provider Model Lists

All AI providers have been updated with the latest 2025 model offerings:

**OpenAI:**
- GPT-4o (Multimodal) - 128k context
- GPT-4o Mini - 128k context
- GPT-4 Turbo & GPT-4 Turbo Preview - 128k context
- GPT-3.5 Turbo variants (0125, 1106) - 16k context

**Anthropic:**
- Claude Opus 4 & Claude Sonnet 4 - 200k context
- Claude 3.7 Sonnet - 128k context
- Claude 3.5 Sonnet (new), Claude 3.5 Haiku - 200k context
- Claude 3 series (Opus, Sonnet, Haiku) - 200k context

**Google Gemini:**
- Gemini 2.5 series (Pro, Flash, Flash Lite, Flash Live) - 1M+ context
- Gemini 2.0 series (Flash, Flash Lite, Pro Experimental) - 1M+ context
- Gemini 1.5 series (Flash, Flash 8B, Pro) - up to 2M context

**Mistral:**
- Mistral Medium 3, Small 3.1, Small 3 - 32k-128k context
- Mistral Large (24.11) - 128k context
- Codestral 2, Devstral Small - 32k context
- Magistral Small/Medium (Reasoning models) - 32k-128k context

**xAI:**
- Grok 4 & Grok 4 Heavy - 131k context
- Grok 3 & Grok 3 Mini - 131k context
- Grok 2 series - 32k context

**Groq:**
- Llama 3.3 70B (Versatile, SpecDec) - 128k context
- DeepSeek R1 Distill models - 131k context
- Qwen 2.5 series - 32k context
- Updated Mixtral and Llama Guard models

**DeepSeek:**
- DeepSeek Chat (V3) - 128k context
- DeepSeek Reasoner (R1) - 64k context
- DeepSeek Coder - 128k context

#### UI/UX Improvements

**MultiModelSelector Component:**
1. **Model Preview Display**
   - Shows first 3 available models below each provider card
   - Displays model labels with context window sizes
   - Shows "+X more models" indicator for providers with many options

2. **Enhanced Model Selection**
   - Dropdown organized into "Available Models" and "Additional Models" groups
   - Shows both display name and API name (e.g., "GPT-4o (Multimodal) (gpt-4o)")
   - Uses static models for immediate selection without API calls
   - Fetches dynamic models in background for better performance

3. **Visual Improvements**
   - Enhanced card styling with shadows and hover effects
   - Better selected state indication with blue borders
   - Improved disabled state (opacity-50) for unavailable providers
   - Responsive grid layout for different screen sizes

4. **Button Contrast Fix**
   - Changed from `bg-bolt-elements-focus` to `bg-blue-600`
   - Added hover state `hover:bg-blue-700`
   - White text with font-medium for better readability
   - Proper disabled state styling

5. **Validation Messages**
   - Updated to use `bg-orange-500/10` with proper opacity
   - Dark mode support with `dark:text-orange-400`
   - Improved icon sizing and spacing
   - Better visibility in all themes

#### Code Changes

**Provider Updates:**
- `app/lib/modules/llm/providers/openai.ts` - Updated with latest GPT models
- `app/lib/modules/llm/providers/anthropic.ts` - Added Claude 4 series
- `app/lib/modules/llm/providers/google.ts` - Added Gemini 2.5/2.0 series
- `app/lib/modules/llm/providers/mistral.ts` - Updated with dated versions
- `app/lib/modules/llm/providers/xai.ts` - Added Grok 4/3 series
- `app/lib/modules/llm/providers/groq.ts` - Updated Llama and DeepSeek models
- `app/lib/modules/llm/providers/deepseek.ts` - Updated with V3 and R1 models

**Component Updates:**
- `app/components/chat/MultiModelSelector.tsx` - Enhanced UI with model previews and better styling

#### Testing & Verification

All changes have been tested and verified:
- ✅ Provider model lists updated with 2025 latest models
- ✅ UI displays model previews correctly
- ✅ Button contrast issue resolved for accessibility
- ✅ Model selection shows both names and API identifiers
- ✅ Static models load immediately without API calls
- ✅ Validation messages are clearly visible in all themes