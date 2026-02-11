# Bolt.gives - Enhanced AI Development Platform

![Bolt.gives](public/boltgives.jpeg)

## 🚀 About This Fork

**Bolt.gives** is an advanced fork of bolt.diy that takes AI-powered development to the next level. While maintaining compatibility with the original, we're developing in a different direction focused on enterprise features, enhanced deployment capabilities, and multi-user collaboration.

### 🎯 Our Vision

We believe in making AI development accessible to everyone while providing professional-grade features for teams and enterprises. Bolt.gives is evolving beyond a simple development tool into a comprehensive platform for collaborative AI-assisted development.

## 🌟 Exclusive Features Not Available in bolt.diy

Our fork includes numerous advanced features that were submitted as PRs to bolt.diy but were not integrated into the main application:

### 🤖 **NEW: SmartAI - Detailed Conversational Coding (Bolt.gives Exclusive)**
- **Real-time explanations** of what the AI is doing and why
- **Educational feedback** that helps you learn as you code
- **Step-by-step narration** of the coding process
- **Best practices insights** shared during implementation
- **Debugging explanations** showing how issues are identified and fixed
- **Available for Claude Sonnet 4** with more models coming soon
- Transform "Generating Response..." into an interactive coding companion!

### ✨ **Comprehensive Save All System** 
- **One-click save** for all modified files
- **Auto-save functionality** with customizable intervals
- **Visual indicators** showing file modification status
- **Keyboard shortcuts** (Ctrl/Cmd+S) for quick saving
- **Smart file tracking** with modification timestamps
- Never lose your work again!

### 🚀 **Advanced Import Capabilities**
- **Import existing projects** from local folders
- **GitHub template integration** for quick starts
- **Automatic dependency detection**
- **File structure preservation**
- **Support for complex project hierarchies**
- Seamlessly migrate your existing projects

### 🔐 **Multi-User Authentication System**
- **User registration and login**
- **Workspace isolation** for security
- **Personalized settings** per user
- **File-based secure storage**
- **JWT authentication**
- **Optional guest mode** for quick access
- Perfect for teams and organizations

### ⚡ **Enhanced Deployment Options**
- **Simplified Netlify deployment** with inline connection
- **GitHub deployment** with repository creation
- **Vercel integration** 
- **Quick deploy buttons** for instant publishing
- **Deployment history tracking**
- Deploy anywhere with a single click

### 🤖 **Extended AI Model Support**
- **Claude 4 models** (Opus, Sonnet, Haiku)
- **Claude Sonnet 4 (SmartAI)** - Exclusive conversational coding variant
- **Auto-detection of Ollama** when configured
- **Enhanced provider management**
- **Automatic provider enablement** based on environment
- Access to the latest and most powerful AI models

### 🎨 **UI/UX Enhancements**
- **Modern deploy dialog** instead of dropdown menus
- **Improved file status indicators**
- **Better error handling and user feedback**
- **Responsive design improvements**
- **Animation and transition effects**
- A more polished and professional experience

## 🎁 Coming Soon: Hosted Instances

We're excited to announce that **Hosted Bolt.gives Instances** will be available soon!

### 💰 Pricing
- **Basic Instance**: Starting from just **$5 per month**
- **Scalable Resources**: Donors can upgrade CPU, RAM, and storage
- **Team Plans**: Collaborative workspaces for organizations
- **Enterprise Solutions**: Custom deployments with dedicated support

### 🌐 Benefits of Hosted Instances
- No setup required - start coding immediately
- Automatic updates and maintenance
- Enhanced security and backups
- Priority support
- Custom domain support
- Team collaboration features

## 🛠️ Installation

### Prerequisites
- Node.js 18+ 
- pnpm package manager

### Quick Start

```bash
# Clone the repository
git clone https://github.com/embire2/bolt.gives.git
cd bolt.gives

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Start development server
pnpm run dev
```

### Production Deployment

```bash
# Build for production
pnpm run build

# Start production server
pnpm run start
```

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file with:

```env
# AI Providers
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
OLLAMA_API_BASE_URL=http://localhost:11434  # Auto-detected when set

# Deployment Providers
NETLIFY_AUTH_TOKEN=your_netlify_token
VERCEL_TOKEN=your_vercel_token
GITHUB_TOKEN=your_github_token

# Optional: Multi-User System
JWT_SECRET=your_jwt_secret
ENABLE_MULTI_USER=true
```

## 📚 Documentation

### Key Features Documentation

- [Save All System Guide](docs/features/save-all.md)
- [Import Projects Tutorial](docs/features/import-projects.md)
- [Multi-User Setup](docs/features/multi-user.md)
- [Deployment Guide](docs/features/deployment.md)
- [AI Provider Configuration](docs/features/ai-providers.md)

## 🤝 Contributing

We welcome contributions! Our fork is actively maintained and we review PRs promptly.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation
- Keep commits atomic and descriptive

## 🔄 Differences from bolt.diy

While we maintain compatibility with bolt.diy's core functionality, Bolt.gives includes:

| Feature | bolt.diy | Bolt.gives |
|---------|----------|------------|
| Save All System | ❌ | ✅ |
| Import Existing Projects | ❌ | ✅ |
| Multi-User Support | ❌ | ✅ |
| Claude 4 Models | ❌ | ✅ |
| Auto-detect Ollama | ❌ | ✅ |
| Enhanced Deploy Dialog | ❌ | ✅ |
| GitHub Repository Creation | ❌ | ✅ |
| Workspace Isolation | ❌ | ✅ |
| Auto-save | ❌ | ✅ |
| Hosted Instances | ❌ | ✅ Coming Soon |

## 📈 Roadmap

### Q1 2025
- ✅ Save All System
- ✅ Import Projects
- ✅ Multi-User Authentication
- ✅ Enhanced Deployment
- 🔄 Hosted Instance Beta

### Q2 2025
- 📱 Mobile responsive editor
- 🤝 Real-time collaboration
- 📊 Analytics dashboard
- 🔌 Plugin system
- 🌐 Custom domain support

### Future
- 🤖 AI code review
- 📦 Package registry integration
- 🔒 Enterprise SSO
- 📈 Performance monitoring
- 🌍 Global CDN deployment

## 💪 Why Choose Bolt.gives?

1. **More Features**: We integrate community-requested features that aren't in bolt.diy
2. **Active Development**: Regular updates and new features
3. **Community Driven**: We listen to and implement user feedback
4. **Professional Support**: Hosted instances come with dedicated support
5. **Enterprise Ready**: Multi-user support and workspace isolation
6. **Better UX**: Refined interface with modern design patterns

## 📞 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/embire2/bolt.gives/issues)
- **Discord**: Join our community (coming soon)
- **Email**: support@bolt.gives (for hosted instances)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Original bolt.diy team for the foundation
- All contributors who submitted PRs
- The open-source community for continuous support
- Our users for valuable feedback and suggestions

## 🚀 Get Started Now!

Ready to experience the enhanced features of Bolt.gives?

1. **Try it locally**: Follow the installation guide above
2. **Wait for hosted**: Join the waitlist for hosted instances
3. **Contribute**: Help us make it even better

---

<p align="center">
  <strong>Bolt.gives - Where AI Development Meets Professional Features</strong><br>
  <em>Fork of bolt.diy with enterprise-grade enhancements</em>
</p>

<p align="center">
  Made with ❤️ by the Bolt.gives community
</p>