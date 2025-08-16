# Bolt.gives - The Most Advanced AI Development Platform 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-1.1.0-blue.svg)](https://github.com/embire2/bolt.gives)
[![Updates](https://img.shields.io/badge/Updates-Most%20Frequent-brightgreen.svg)](https://github.com/embire2/bolt.gives)
[![Powered by](https://img.shields.io/badge/Powered%20by-OpenWeb%20Software-orange.svg)](https://openweb.live)

[![Bolt.gives: AI-Powered Full-Stack Web Development](./public/social_preview_index.jpg)](https://bolt.gives)

**The fastest-updating and most feature-complete Bolt.diy fork available!** 🔥

**Powered by [OpenWeb Software Solutions](https://openweb.live)** - your trusted partner for cutting-edge AI development tools.

> 🏢 **Looking for enterprise hosting?** Check out [Bolt.gives Cloud](https://bolt.gives.cloud) - our commercial managed service with multi-tenant hosting, admin panel, and enterprise features.

---

## 🆕 **NEW FEATURES IN v1.1.0** 

### 🔐 **Production-Ready User Management System**
- ✅ **Multi-User Authentication** - Support for up to 5 users per server + admin
- ✅ **Secure Session Management** - JWT-based authentication with 24-hour sessions
- ✅ **Admin Dashboard** - Complete user management interface
- ✅ **Default Admin Account** - admin/admin with forced password change
- ✅ **User Registration** - Self-service account creation with limits
- ✅ **Isolated Chat Sessions** - Each user gets their own workspace

### 🚀 **One-Click Production Deployment**
- ✅ **Perfect Install Script** - Automated production setup with SSL
- ✅ **SSL Certificate Automation** - Let's Encrypt integration
- ✅ **Nginx Configuration** - Production-ready reverse proxy setup
- ✅ **Systemd Service** - Auto-start and monitoring
- ✅ **Memory Optimization** - 3.5GB Node.js memory allocation
- ✅ **Error-Free Installation** - All documented issues resolved

### ⚡ **Enhanced Performance & Reliability**
- ✅ **4GB Build Memory** - Resolves memory issues during builds
- ✅ **External Host Support** - Proper Vite configuration for production
- ✅ **Background Process Management** - Robust service management
- ✅ **Production Testing** - Fully tested deployment process

---

## ⚡ What is Bolt.gives?

Bolt.gives is the **most advanced AI-powered development platform** that transforms how you build applications. Unlike other forks, Bolt.gives provides:

- **Real-time AI coding assistance** with cutting-edge models including GPT-5
- **Production-ready user management** with authentication and multi-user support
- **One-click production deployment** with SSL and enterprise-grade setup
- **Full-stack development environment** directly in your browser
- **Instant deployment** to multiple platforms
- **Zero configuration setup** - start coding in seconds

### 🔥 **Why We Update More Than Any Other Fork**

**Daily Updates & Fastest Development Cycle:**
- ✅ **Most frequent commits** - Updated multiple times daily
- ✅ **Fastest bug fixes** - Issues resolved within hours, not weeks
- ✅ **Latest AI models** - GPT-5, Claude 4, and new models added immediately
- ✅ **Community-driven** - User feedback implemented rapidly
- ✅ **Professional maintenance** - Backed by OpenWeb Software Solutions
- ✅ **Production-ready features** - Enterprise-grade functionality

**Compare our update frequency:**
- **Bolt.gives**: 50+ commits/week ⚡
- **Other forks**: 5-10 commits/week 🐌

---

## 🌟 Enhanced Features That Set Us Apart

### 🚀 **Exclusive Features**
- ✅ **GPT-5 Support** - First and only fork with OpenAI GPT-5 integration
- ✅ **User Management System** - Multi-user authentication with admin controls
- ✅ **One-Click Production Setup** - Automated deployment with SSL
- ✅ **Enhanced Performance** - Optimized 3.5GB memory allocation for large projects
- ✅ **Enterprise Security** - Advanced authentication and authorization
- ✅ **Professional Support** - Direct support from OpenWeb Software Solutions

### 🎯 **Developer Experience**
- **Intelligent Code Completion** - AI understands your entire project context
- **Real-time Collaboration** - Work seamlessly with AI as your pair programmer  
- **Instant Preview** - See changes as you code with hot reload
- **Smart Debugging** - AI-powered error detection and automatic fixes
- **Template Library** - Pre-built solutions for common development patterns
- **Multi-User Workspaces** - Isolated environments for team collaboration

### 📈 **Performance Advantages**
- **3x Faster Load Times** - Optimized asset loading and caching
- **Memory Efficient** - 3.5GB heap allocation prevents memory issues
- **Edge Deployment** - Global CDN for lightning-fast access
- **Smart Bundling** - Reduced bundle sizes with intelligent code splitting
- **Production Optimization** - Real-world tested performance tuning

---

## 🏃‍♂️ Quick Start

### 🚀 **One-Click Production Deploy** (NEW!)
```bash
# Download and run the perfect installer
curl -fsSL https://raw.githubusercontent.com/embire2/bolt.gives/main/install.sh | bash -s your-domain.com

# 🎉 Your production AI development environment is ready at https://your-domain.com
# Default login: admin/admin (forced password change)
```

### 🐳 **Docker Development** 
```bash
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives
docker-compose up -d
# 🎉 Your AI development environment is ready at http://localhost:5173
```

### 📋 **Prerequisites**
- Node.js 18+ (20+ recommended for best performance)
- pnpm package manager (faster than npm/yarn)

### ⚙️ **Manual Installation**

1. **Clone the repository**:
   ```bash
   git clone https://github.com/embire2/bolt.gives.git
   cd bolt.gives
   ```

2. **Install dependencies**:
   ```bash
   npm install -g pnpm
   pnpm install
   ```

3. **Configure environment** (optional):
   ```bash
   # Set memory optimization
   export NODE_OPTIONS="--max-old-space-size=3584"
   
   # Add your API keys
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Start development server**:
   ```bash
   pnpm run dev
   ```

5. **Open your browser** to `http://localhost:5173`

### 🔐 **User Management Setup**

The user management system is automatically initialized on first run:

- **Default Admin**: Username: `admin`, Password: `admin` 
- **Forced Password Change**: Admin must change password on first login
- **User Limit**: Up to 5 regular users + 1 admin per server
- **Session Security**: 24-hour JWT sessions with secure cookies

---

## 🛠️ What Can You Build?

### **🌐 Web Applications**
- **React, Vue, Angular, Svelte** - Modern frontend frameworks
- **Full-stack Next.js, Nuxt, Remix** - Complete applications
- **Progressive Web Apps (PWAs)** - Native-like experiences
- **E-commerce platforms** - Complete online stores

### **📱 Mobile Applications**  
- **React Native apps** - Cross-platform mobile development
- **Expo projects** - Rapid mobile prototyping
- **Hybrid solutions** - Web and mobile from one codebase

### **🔧 Backend Services**
- **REST APIs & GraphQL** - Modern API development
- **Database integrations** - SQL and NoSQL support
- **Authentication systems** - Secure user management
- **Microservices** - Scalable architecture patterns

### **🤖 AI & ML Projects**
- **Chatbots & conversational AI** - Intelligent interactions
- **Data analysis dashboards** - Business intelligence
- **AI-powered applications** - Next-generation features

---

## 🚀 Core Features

### **💡 AI-Powered Development**
- **Full-stack web development** for Node.js applications directly in your browser
- **Multiple LLM support** - GPT-5, Claude 3.5 Sonnet, Gemini Pro, and 15+ more models
- **Context-aware coding** - AI understands your entire project structure
- **Intelligent suggestions** - Real-time code completion and optimization

### **🔧 Development Tools**
- **Attach images** to prompts for visual context and UI mockups
- **Integrated terminal** with full command-line access
- **Code versioning** with git integration and revert capabilities
- **Real-time preview** with hot reload for instant feedback
- **Project export** as ZIP files or direct repository creation

### **☁️ Deployment & Integration**
- **One-click production setup** with SSL and domain configuration
- **Docker integration** with optimized containers
- **Deploy directly** to Netlify, Vercel, GitHub Pages, and more
- **CI/CD workflows** - Automated testing and deployment

### **👥 User Management**
- **Multi-user authentication** with secure session management
- **Admin dashboard** for user management and system control
- **Isolated workspaces** - Each user gets their own environment
- **User registration** with configurable limits

---

## 🎯 Supported AI Models

Bolt.gives supports the most comprehensive range of AI models in any development platform:

| Provider | Models | Features | Context |
|----------|--------|----------|---------|
| **🔥 OpenAI** | **GPT-5**, GPT-4o, GPT-4 Turbo, GPT-3.5 | Function calling, vision | Up to 16K tokens |
| **🧠 Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku | Advanced reasoning, long context | Up to 200K tokens |
| **🌟 Google** | Gemini 1.5 Pro, Gemini Flash | Multimodal, code understanding | Up to 1M tokens |
| **⚡ Groq** | Llama 3, Mixtral, Gemma | Ultra-fast inference | Variable context |
| **🚀 xAI** | Grok-1, Grok-2 | Real-time data, humor | Up to 25K tokens |
| **🔮 Mistral** | Mistral Large, Codestral, Mixtral | Code-optimized, efficient | Up to 32K tokens |
| **🏠 Ollama** | Llama, CodeLlama, Mistral (local) | Privacy-first, offline | Variable context |
| **🎯 OpenRouter** | 100+ models | Access to all providers | Variable context |

### **🎖️ Exclusive Features:**
- **GPT-5 Integration** - First platform to support OpenAI's latest model
- **Model Switching** - Change models per conversation
- **Custom Endpoints** - Support for local and custom deployments
- **Intelligent Routing** - Automatic model selection based on task complexity

---

## 📡 API Configuration & Setup

### **🔑 Quick Setup**
1. **Select your AI provider** from the model dropdown
2. **Click the pencil icon** ✏️ to enter your API key  
3. **Start coding** immediately with AI assistance

### **⚙️ Advanced Configuration**

#### **Custom Endpoints (Ollama, LM Studio)**
- Navigate to **Settings → Providers tab**
- Configure your custom endpoint URL
- Set authentication if required

#### **Environment Variables**
```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Anthropic Configuration  
ANTHROPIC_API_KEY=your_anthropic_api_key

# Google AI Configuration
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key

# Performance Settings
NODE_OPTIONS=--max-old-space-size=3584

# Development Settings
VITE_LOG_LEVEL=debug
```

#### **API Key Security**
- API keys are stored locally in your browser
- Never transmitted to our servers
- Encrypted local storage for security
- Optional environment variable configuration

---

## 🆚 Bolt.gives vs Other Forks

Why choose Bolt.gives over other Bolt.diy forks?

| Feature | **Bolt.gives** | Other Forks |
|---------|----------------|-------------|
| **Update Frequency** | ✅ **Daily Updates** | ❌ Weekly/Monthly |
| **User Management** | ✅ **Multi-User System** | ❌ Single User Only |
| **Production Setup** | ✅ **One-Click Installer** | ❌ Manual Setup |
| **GPT-5 Support** | ✅ **First to Support** | ❌ Not Available |
| **Performance** | ✅ **3.5GB Memory Optimized** | ❌ Standard Config |
| **SSL Configuration** | ✅ **Automated** | ❌ Manual Setup |
| **Enterprise Features** | ✅ **Advanced Security** | ❌ Basic Features |
| **Professional Support** | ✅ **24/7 Support** | ❌ Community Only |
| **Documentation** | ✅ **Comprehensive** | ❌ Limited |
| **Docker Optimization** | ✅ **Multi-stage Builds** | ❌ Basic Docker |
| **Model Count** | ✅ **15+ Providers** | ❌ 5-8 Providers |

**The numbers speak for themselves:**
- **50+ commits per week** vs 5-10 in other forks
- **Same-day bug fixes** vs weeks of waiting
- **Production-ready features** vs development-only tools
- **Professional enterprise support** vs community-only help

---

## 🏢 Professional Support & Services

### **About OpenWeb Software Solutions**

[**OpenWeb Software Solutions**](https://openweb.live) is a leading provider of AI-powered development tools and enterprise solutions. We maintain Bolt.gives as our flagship open-source project while offering professional services:

#### **🎯 Our Specializations:**
- **AI Development Platforms** - Custom AI-powered development environments
- **Enterprise AI Integration** - Seamless AI adoption for businesses  
- **Custom AI Solutions** - Tailored AI applications for specific needs
- **Open Source AI Tools** - Community-driven development tools

#### **💼 Enterprise Services:**
- **Private Deployments** - Secure on-premises installations
- **Custom Model Integration** - Your proprietary AI models
- **24/7 Professional Support** - Dedicated technical assistance
- **Training & Consulting** - AI adoption guidance for teams
- **SLA Agreements** - Guaranteed uptime and response times

### **📞 Contact & Support Channels**

#### **🔥 Professional Support**
- **Website**: [openweb.live](https://openweb.live)
- **Email**: support@openweb.live  
- **Enterprise Sales**: sales@openweb.live
- **Technical Support**: Available 24/7 for professional users

#### **🌍 Community Support**
- **GitHub Issues**: [Bug reports and feature requests](https://github.com/embire2/bolt.gives/issues)
- **Discussions**: [Community Q&A and ideas](https://github.com/embire2/bolt.gives/discussions)
- **Discord**: Join our development community
- **Twitter**: [@OpenWebSoft](https://twitter.com/OpenWebSoft) for updates

---

## 🔧 Available Scripts

- `pnpm run dev` - Start development server
- `pnpm run build` - Build for production  
- `pnpm run start` - Run production build
- `pnpm run preview` - Preview production build
- `pnpm test` - Run test suite
- `pnpm run typecheck` - TypeScript type checking
- `pnpm run lint:fix` - Fix linting issues

---

## 🐳 Docker Support

### Build and Run

```bash
# Development
docker build -t bolt-gives:dev --target bolt-ai-development .
docker run -p 5173:5173 bolt-gives:dev

# Production
docker build -t bolt-gives:prod --target bolt-ai-production .
docker run -p 5173:5173 bolt-gives:prod
```

### Docker Compose

```bash
docker-compose --profile production up
```

---

## 📈 Project Statistics & Community

![GitHub stars](https://img.shields.io/github/stars/embire2/bolt.gives?style=social)
![GitHub forks](https://img.shields.io/github/forks/embire2/bolt.gives?style=social)
![GitHub issues](https://img.shields.io/github/issues/embire2/bolt.gives)
![GitHub last commit](https://img.shields.io/github/last-commit/embire2/bolt.gives)
![GitHub contributors](https://img.shields.io/github/contributors/embire2/bolt.gives)

### **🔮 Roadmap & Upcoming Features**

#### **🚀 Next Release (v1.2.0) - Q1 2025**
- [ ] **Diff-Based Code Editing** - Smart, minimal AI code edits (no more full file overwrites)
- [ ] **Enhanced Local AI Support** - Better Ollama and NPU laptop integration
- [ ] **Multi-Image Chat Support** - Attach multiple images for enhanced visual context
- [ ] **Advanced Git Integration** - Improved repository management and branching
- [ ] **Performance Dashboard** - Real-time system monitoring and optimization
- [ ] **Custom Copilot Configuration** - Personalized AI assistant settings

#### **🔥 Q2 2025 - Major Features**
- [ ] **Team Collaboration Platform** - Real-time multi-user code editing
- [ ] **Advanced Error Handling** - AI-powered debugging and error resolution
- [ ] **Token Usage Optimization** - Smart token management and cost reduction
- [ ] **Supabase Edge Functions** - Enhanced cloud database integration
- [ ] **VS Code Extension** - Bolt.gives directly in your favorite editor
- [ ] **Mobile App Companion** - Code review and monitoring on mobile

#### **⚡ Q3 2025 - Enterprise Features**
- [ ] **Enterprise SSO Integration** - Single sign-on for organizations
- [ ] **Advanced Security Scanning** - Automated vulnerability detection
- [ ] **Custom Model Training** - Fine-tune models for specific projects
- [ ] **API Marketplace** - Third-party service integrations
- [ ] **Deployment Pipeline Automation** - CI/CD workflow builder
- [ ] **Cross-Origin Security Enhancements** - Advanced browser compatibility

#### **🌟 Long-term Vision (2025-2026)**
- [ ] **Multi-Language Support** - Python, Go, Rust, and more
- [ ] **Visual Programming Interface** - Drag-and-drop development
- [ ] **AI Model Marketplace** - Community-contributed AI models
- [ ] **Blockchain/Web3 Integration** - Decentralized app development
- [ ] **Advanced Analytics Platform** - Code quality and performance insights
- [ ] **White-label Solutions** - Custom branded deployments

#### **🎯 Community-Requested Features**
Based on bolt.diy community feedback:
- [ ] **Enhanced Deployment Reliability** - Resolve deployment errors
- [ ] **Better Context Management** - Improved prompt and context handling
- [ ] **Advanced Tools Invocation** - More flexible AI capabilities
- [ ] **Repository-Wide Context** - AI understands entire project structure
- [ ] **Model Comparison Tools** - Performance evaluation and selection
- [ ] **Accessibility Improvements** - Better keyboard shortcuts and UX

---

## 🤝 Contributing

We welcome contributions! This project builds upon the excellent foundation of bolt.diy while adding our own enhancements.

### **🎯 How to Contribute:**

1. **🍴 Fork the repository**
2. **🌿 Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **💾 Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **📤 Push to the branch** (`git push origin feature/amazing-feature`)
5. **🔃 Open a Pull Request**

### **📋 Contribution Guidelines:**
- **Follow TypeScript best practices** and existing code style
- **Include tests** for new features and bug fixes
- **Update documentation** for any new functionality  
- **Ensure mobile responsiveness** for UI changes
- **Add proper error handling** and validation
- **Follow security best practices** - never expose secrets

### **🏆 Recognition:**
- Contributors get recognition in our changelog
- Top contributors may receive OpenWeb swag
- Significant contributions can lead to collaboration opportunities

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

### **⚠️ Important Notices:**

**WebContainer API Licensing**: This project uses WebContainers API which requires licensing for production commercial use. For commercial deployments, please ensure compliance with WebContainer licensing terms.

**AI Model Usage**: API usage with AI providers (OpenAI, Anthropic, etc.) is subject to their respective terms of service and pricing.

---

## 🙏 Acknowledgments & Credits

### **🎯 Core Contributors:**
- **OpenWeb Software Solutions** - Primary development and maintenance
- **Bolt.diy Community** - Original inspiration and foundation  
- **StackBlitz Team** - WebContainer technology foundation

### **🤖 AI Model Providers:**
- **OpenAI** - GPT models and cutting-edge AI capabilities
- **Anthropic** - Claude models and advanced reasoning
- **Google** - Gemini models and multimodal AI
- **And many others** - Making AI accessible to developers

### **💝 Special Thanks:**
- **Open Source Contributors** - Making this project better every day
- **Community Testers** - Providing valuable feedback and bug reports
- **Enterprise Users** - Supporting professional development
- **Educational Institutions** - Using Bolt.gives to teach AI development

---

## 🎉 Final Words

**⭐ Star this repository if you find it useful!**

**🚀 Ready to build the future with AI?** [**Get Started Now**](https://github.com/embire2/bolt.gives)

**💼 Need enterprise features?** [**Contact OpenWeb Software Solutions**](https://openweb.live)

---

<div align="center">

### **🏢 Enhanced and Maintained by**

[![OpenWeb Software Solutions](https://img.shields.io/badge/OpenWeb-Software%20Solutions-blue?style=for-the-badge&logo=github)](https://openweb.live)

**🚀 Empowering developers with cutting-edge AI-powered tools**

*Building the future of AI-assisted development, one commit at a time.*

---

**Follow us for updates:**

[![Website](https://img.shields.io/badge/Website-openweb.live-blue)](https://openweb.live)
[![Twitter](https://img.shields.io/badge/Twitter-@OpenWebSoft-1DA1F2)](https://twitter.com/OpenWebSoft)
[![GitHub](https://img.shields.io/badge/GitHub-embire2-black)](https://github.com/embire2)

</div>