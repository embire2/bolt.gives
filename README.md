# Bolt.gives - Special Edition

[![Bolt.gives Special Edition: Enhanced AI-Powered Full-Stack Web Development](./public/boltlogo.png)](https://openweb.co.za)

Welcome to **Bolt.gives - Special Edition**, a powerful alternative to StackBlitz's Bolt.new that puts community-driven development at the forefront. This special edition is maintained by a dedicated team of volunteers who are continuously adding highly requested features and improvements to create the most comprehensive open-source AI coding assistant.

## 🚀 What Makes This Special?

Bolt.gives - Special Edition represents the next evolution of AI-powered web development, offering:

- **Community-Driven Development**: Built by volunteers who listen to user feedback and implement the features you actually want
- **Advanced Feature Set**: Enhanced capabilities that go beyond the basic Bolt.new experience
- **Multiple LLM Support**: Choose from OpenAI, Anthropic, Ollama, OpenRouter, Gemini, LMStudio, Mistral, xAI, HuggingFace, DeepSeek, Groq, and more
- **Production-Ready**: Robust features like user authentication, chat history management, and advanced deployment options
- **Extensible Architecture**: Easy to extend with new models and capabilities

## 🎯 Our Mission

We believe that the best AI coding tools should be open source, community-driven, and accessible to everyone. Our team of volunteers is dedicated to:

- **Listening to the Community**: Every feature request is considered and prioritized based on user needs
- **Rapid Innovation**: Faster development cycles than traditional corporate alternatives
- **Quality First**: Thorough testing and code review processes ensure stability and performance
- **Transparency**: Open development process with clear roadmaps and progress tracking

## 🛠️ Enhanced Features

### 🔐 User Authentication & Session Management
- **Multi-user Support**: Create separate accounts with isolated chat histories
- **Secure Authentication**: bcryptjs-powered password hashing
- **Session Persistence**: 7-day session management with automatic cleanup
- **User Profiles**: Manage account settings and preferences

### 💬 Advanced Chat Management
- **Private Chat History**: Each user has completely isolated chat data
- **Chat Export/Import**: Backup and restore your conversations
- **Chat Duplication**: Clone successful conversations for reuse
- **Smart Chat Metadata**: Enhanced organization and search capabilities

### 🎨 Enhanced UI/UX
- **Mobile-Friendly**: Responsive design that works on all devices
- **Dark/Light Theme**: Toggle between themes for comfort
- **Improved Navigation**: Streamlined interface with better user flow
- **Visual Feedback**: Real-time status indicators and progress tracking

### 🧠 AI Mode Selection & Multi-Model Orchestration
- **Smart Mode Selection**: Choose between Standard Mode and Multi-Model Orchestration
- **Multi-Agent Execution**: Run multiple AI models in parallel for complex tasks
- **Task Decomposition**: Intelligent breaking down of complex requirements
- **Consensus-Based Results**: Cross-model validation and quality assurance
- **Advanced Error Detection**: Self-healing capabilities with automated error recovery

### 🔧 Developer Tools
- **Advanced Terminal**: Full terminal output with error detection
- **Git Integration**: Clone, commit, and push directly to GitHub
- **File Diff View**: See exactly what changes are being made
- **Project Templates**: Quick start with pre-configured templates

### 🌐 Deployment & Integration
- **Multiple Deployment Options**: Direct deployment to Netlify, Vercel, and more
- **Supabase Integration**: Database integration for dynamic applications
- **Docker Support**: Containerized deployment for easy scaling
- **API Integration**: Connect with external services and APIs

## 📋 Volunteer Team Priorities

Our team is actively working on these high-priority features:

### 🔥 Recently Completed
- **AI Mode Selection**: Choose between Standard Mode and Multi-Model Orchestration before starting
- **Multi-Model Orchestration**: Complete system for running multiple AI agents in parallel
- **Advanced Task Management**: Visual interface for complex task decomposition and execution
- **Consensus Mechanisms**: Cross-model validation and result aggregation

### 🔥 Currently in Development
- **Advanced File Locking**: Prevent unnecessary rewrites with intelligent diff detection
- **Enhanced Prompting**: Optimized prompts for smaller LLMs and better code generation
- **VSCode Integration**: Seamless integration with popular development environments

### 🎯 Next Up
- **Document Upload**: Add knowledge base with design templates and coding standards
- **Voice Commands**: Natural language voice prompting for hands-free coding
- **Project Planning**: LLM-generated project plans with transparent decision-making
- **Advanced Error Handling**: Automatic error detection and resolution

### 🔮 Future Enhancements
- **Plugin System**: Extensible architecture for community-contributed features
- **Advanced Analytics**: Usage insights and performance metrics
- **Collaborative Features**: Real-time collaboration on projects
- **Enterprise Features**: SSO, audit logs, and advanced security options

## 🎯 AI Mode Selection

When you start a new chat session, Bolt.gives now offers you two powerful modes to choose from:

### 🔸 Standard Mode
Perfect for quick tasks and straightforward development:
- **Single AI conversation** with fast response times
- **Direct interaction** for immediate feedback
- **Cost-effective** for simple coding tasks
- **Ideal for**: Quick questions, simple coding tasks, learning, general conversations

### 🔸 Multi-Model Orchestration Mode
Advanced mode for complex projects requiring multiple perspectives:
- **Multiple AI agents** working in parallel
- **Task decomposition** and intelligent delegation
- **Cross-model validation** and review
- **Consensus-based results** for higher quality output
- **Advanced error detection** with self-healing capabilities
- **Ideal for**: Complex software development, code review, multi-perspective analysis, large-scale refactoring

The system automatically presents you with a comparison interface to help you choose the right mode for your specific task.

## 🚀 Quick Start

### Prerequisites
- Node.js (LTS version recommended)
- pnpm (recommended) or npm

### Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/embire2/bolt.gives.git
   cd bolt.gives
   ```

2. **Install Dependencies**:
   ```bash
   pnpm install
   ```

3. **Install Required Remix Dependencies** (if not already installed):
   ```bash
   pnpm add @remix-run/dev @remix-run/node
   ```

4. **Start Development Server**:
   ```bash
   pnpm run dev
   ```

5. **Open in Browser**:
   Navigate to `http://localhost:5173`

## 🔧 System Configuration

### Node.js Memory Configuration

For optimal performance, especially when building large projects, you may need to increase Node.js memory allocation:

#### Option 1: Temporary (for current session)
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
pnpm run dev
```

#### Option 2: Permanent (recommended)
Add to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
```

Then reload your shell or run:
```bash
source ~/.bashrc  # or ~/.zshrc
```

#### Option 3: Using npm/pnpm scripts (already configured)
The project is already configured to use 4GB memory in the dev script:
```json
"dev": "node --max-old-space-size=4096 pre-start.cjs && remix vite:dev --host=0.0.0.0 --port=5173"
```

### Essential Dependencies Checklist

Before running the application, ensure you have installed:

✅ **Core Dependencies**:
- `@remix-run/dev` - Remix development tools
- `@remix-run/node` - Remix Node.js adapter
- `@remix-run/react` - Remix React integration
- `@remix-run/cloudflare` - Cloudflare deployment support

✅ **Build Dependencies**:
- `vite` - Build tool
- `typescript` - Type checking
- `@types/node` - Node.js type definitions

✅ **Runtime Dependencies**:
- `react` and `react-dom` - React framework
- `@webcontainer/api` - WebContainer integration
- All AI provider SDKs (OpenAI, Anthropic, etc.)

### Common Installation Issues & Solutions

**Issue**: "Remix Vite plugin not found in Vite config"
**Solution**: 
```bash
pnpm add @remix-run/dev @remix-run/node
```

**Issue**: "Cannot find module '@remix-run/nod'"
**Solution**: Fix the typo - it should be `@remix-run/node`

**Issue**: "JavaScript heap out of memory"
**Solution**: Increase Node.js memory limit (see Memory Configuration above)

**Issue**: "Port 5173 already in use"
**Solution**: 
```bash
# Find and kill process using port 5173
sudo lsof -i :5173
sudo kill -9 <PID>
```

### External Access Configuration

To make your development server accessible from external networks:

1. **Configure Vite for external access** (already set in `vite.config.ts`):
   ```typescript
   server: {
     host: '0.0.0.0',  // Allows external connections
     port: 5173,
   }
   ```

2. **Start with external host binding**:
   ```bash
   pnpm run dev  # Already configured to bind to 0.0.0.0
   ```

3. **Configure firewall** (if applicable):
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 5173/tcp
   
   # CentOS/RHEL
   sudo firewall-cmd --permanent --add-port=5173/tcp
   sudo firewall-cmd --reload
   ```

4. **Access your application**:
   - Local: `http://localhost:5173`
   - External: `http://your-server-ip:5173`

### Docker Setup (Alternative)

1. **Build Docker Image**:
   ```bash
   docker build . --target bolt-ai-development
   ```

2. **Run Container**:
   ```bash
   docker compose --profile development up
   ```

## 🖥️ Ubuntu VPS/Server Installation

### Prerequisites
- Ubuntu 20.04 LTS or newer
- Node.js 18+ (LTS recommended)
- pnpm or npm
- Git
- Basic firewall (UFW recommended)

### Step 1: Server Setup

1. **Update System**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Install Node.js (using NodeSource)**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Install pnpm**:
   ```bash
   npm install -g pnpm
   ```

4. **Install Git** (if not already installed):
   ```bash
   sudo apt install git -y
   ```

### Step 2: Application Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/embire2/bolt.gives.git
   cd bolt.gives
   ```

2. **Install Dependencies**:
   ```bash
   pnpm install
   ```

3. **Install Required Remix Dependencies** (if missing):
   ```bash
   pnpm add @remix-run/dev @remix-run/node
   ```

4. **Configure Node.js Memory** (for optimal performance):
   ```bash
   echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> ~/.bashrc
   source ~/.bashrc
   ```

5. **Build the Application**:
   ```bash
   pnpm run build
   ```

### Step 3: Remote Access Configuration

#### Option A: Direct Port Access (Development/Testing)

1. **Configure Firewall**:
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 5173/tcp
   sudo ufw enable
   ```

2. **Start Development Server** (binds to all interfaces):
   ```bash
   pnpm run dev -- --host 0.0.0.0 --port 5173
   ```

3. **Access Application**:
   - Open browser to `http://your-server-ip:5173`

#### Option B: Production Setup with Reverse Proxy (Recommended)

1. **Install Nginx**:
   ```bash
   sudo apt install nginx -y
   ```

2. **Configure Nginx**:
   ```bash
   sudo nano /etc/nginx/sites-available/bolt-gives
   ```

   Add this configuration:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;  # Replace with your domain or IP
       
       location / {
           proxy_pass http://localhost:5173;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
           proxy_read_timeout 86400;
       }
   }
   ```

3. **Enable Site**:
   ```bash
   sudo ln -s /etc/nginx/sites-available/bolt-gives /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Configure Firewall**:
   ```bash
   sudo ufw allow 'Nginx Full'
   sudo ufw enable
   ```

5. **Create Systemd Service**:
   ```bash
   sudo nano /etc/systemd/system/bolt-gives.service
   ```

   Add this configuration:
   ```ini
   [Unit]
   Description=Bolt.gives Application
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   WorkingDirectory=/home/ubuntu/bolt.gives
   ExecStart=/usr/bin/pnpm run start
   Restart=always
   RestartSec=5
   Environment=NODE_ENV=production
   Environment=PORT=5173
   Environment=HOST=127.0.0.1
   Environment=NODE_OPTIONS=--max-old-space-size=4096

   [Install]
   WantedBy=multi-user.target
   ```

6. **Start and Enable Service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable bolt-gives
   sudo systemctl start bolt-gives
   ```

### Step 4: SSL Certificate (Optional but Recommended)

1. **Install Certbot**:
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   ```

2. **Obtain SSL Certificate**:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. **Auto-renewal**:
   ```bash
   sudo systemctl enable certbot.timer
   ```

### Security Considerations

⚠️ **Important Security Notes**:

- **Change Default Passwords**: Always change any default credentials
- **Use Strong Authentication**: Enable user authentication in the application
- **Regular Updates**: Keep the system and application updated
- **Firewall Rules**: Only open necessary ports
- **SSL/TLS**: Always use HTTPS in production
- **Access Control**: Consider IP whitelisting for admin access
- **Backup Strategy**: Regular backups of configuration and data
- **Monitor Logs**: Regular monitoring of application and system logs

### Troubleshooting

**Common Issues**:

1. **"Remix Vite plugin not found in Vite config"**:
   ```bash
   pnpm add @remix-run/dev @remix-run/node
   sudo systemctl restart bolt-gives
   ```

2. **"JavaScript heap out of memory"**:
   ```bash
   echo 'export NODE_OPTIONS="--max-old-space-size=4096"' >> ~/.bashrc
   source ~/.bashrc
   sudo systemctl restart bolt-gives
   ```

3. **Port Already in Use**:
   ```bash
   sudo lsof -i :5173
   sudo kill -9 PID
   ```

4. **Permission Errors**:
   ```bash
   sudo chown -R $USER:$USER /home/ubuntu/bolt.gives
   ```

5. **Service Not Starting**:
   ```bash
   sudo journalctl -u bolt-gives -f
   ```

6. **Nginx Configuration Test**:
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

7. **External Access Not Working**:
   ```bash
   # Check if firewall is blocking
   sudo ufw status
   sudo ufw allow 5173/tcp
   
   # Check if service is binding to correct interface
   sudo netstat -tlnp | grep 5173
   ```

### Monitoring and Maintenance

1. **Check Application Status**:
   ```bash
   sudo systemctl status bolt-gives
   ```

2. **View Logs**:
   ```bash
   sudo journalctl -u bolt-gives -f
   ```

3. **Update Application**:
   ```bash
   cd /home/ubuntu/bolt.gives
   git pull origin main
   pnpm install
   pnpm run build
   sudo systemctl restart bolt-gives
   ```

## 🔑 API Configuration

### Adding API Keys
1. Open the application in your browser
2. Select your preferred AI provider from the dropdown
3. Click the pencil icon to edit
4. Enter your API key securely

### Supported Providers
- **OpenAI**: GPT-3.5, GPT-4, GPT-4 Turbo models
- **Anthropic**: Claude 3 Opus, Sonnet, Haiku
- **Google**: Gemini Pro, Gemini Pro Vision
- **Ollama**: Local model support
- **OpenRouter**: Access to multiple models
- **LM Studio**: Local model server
- **Mistral**: Mistral 7B, Mixtral models
- **xAI**: Grok Beta models
- **HuggingFace**: Open source models
- **DeepSeek**: DeepSeek Coder models
- **Groq**: Fast inference models
- **Cohere**: Command models
- **Together**: Collaborative AI models
- **Perplexity**: Search-augmented models
- **AWS Bedrock**: Enterprise AI models

## 🤝 Contributing

We welcome contributions from developers of all skill levels! Here's how you can help:

### Ways to Contribute
- **Feature Development**: Help implement new features from our roadmap
- **Bug Fixes**: Report and fix issues to improve stability
- **Documentation**: Improve setup guides and feature documentation
- **Testing**: Help test new features and provide feedback
- **UI/UX**: Contribute to design improvements and user experience

### Getting Started
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Standards
- **TypeScript**: Strict type checking enabled
- **ESLint**: Code linting with Prettier formatting
- **Testing**: Jest/Vitest for unit tests
- **Documentation**: JSDoc comments for complex functions

## 📊 Available Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production
- `pnpm run start` - Run production build locally
- `pnpm run preview` - Preview production build
- `pnpm test` - Run test suite
- `pnpm run typecheck` - TypeScript type checking
- `pnpm run lint` - Run ESLint
- `pnpm run lint:fix` - Fix linting issues automatically
- `pnpm run deploy` - Deploy to Cloudflare Pages

## 🌟 Community & Support

### Join Our Community
- **Discord**: [Join our Discord server](https://discord.gg/bolt-diy) for real-time discussions
- **GitHub Issues**: Report bugs and request features
- **GitHub Discussions**: Ask questions and share ideas
- **Community Forum**: [oTTomator Think Tank](https://thinktank.ottomator.ai)

### Getting Help
- **Documentation**: Check our comprehensive docs
- **FAQ**: Common questions and solutions
- **Video Tutorials**: Step-by-step guides
- **Community Support**: Ask questions in our Discord

## 📈 Roadmap

We maintain a transparent roadmap showing our development priorities:

### Q1 2025
- Enhanced file management and diff system
- ✅ **Advanced AI model orchestration** (Completed)
- Improved mobile experience
- Plugin system foundation

### Q2 2025
- Voice command integration
- Advanced project templates
- Collaborative features
- Enterprise security features

### Q3 2025
- VSCode extension
- Advanced analytics dashboard
- Multi-language support
- Performance optimizations

View our detailed roadmap: [Roadmap](https://roadmap.sh/r/ottodev-roadmap-2ovzo)

## 🏆 Acknowledgments

This project is made possible by our amazing community of volunteers:

- **Core Team**: Dedicated developers maintaining the codebase
- **Contributors**: Community members who submit features and fixes
- **Testers**: Users who report bugs and test new features
- **Documentation Team**: Writers who keep our docs up-to-date
- **Community Moderators**: Helpers who support users in our forums

## 📄 License

**MIT License** - See [LICENSE](LICENSE) for details.

**Important**: This project uses WebContainers API which requires [commercial licensing](https://webcontainers.io/enterprise) for production use in commercial, for-profit settings. Prototypes and POCs do not require a commercial license.

## 🔗 Links

- **Live Demo**: [https://bolt.gives](https://bolt.gives)
- **Documentation**: [Bolt.gives Docs](https://stackblitz-labs.github.io/bolt.gives/)
- **Community**: [oTTomator Think Tank](https://thinktank.ottomator.ai)
- **Roadmap**: [Development Roadmap](https://roadmap.sh/r/ottodev-roadmap-2ovzo)
- **Support**: [GitHub Issues](https://github.com/embire2/bolt.gives/issues)

---

**Bolt.gives - Special Edition**: Where community-driven development meets cutting-edge AI technology. Join us in building the future of AI-powered web development! 🚀
