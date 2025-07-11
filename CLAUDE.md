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