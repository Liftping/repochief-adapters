# @repochief/adapters

> **Open Source AI Terminal Adapter Framework** - Community-driven integrations for any AI coding assistant

[![npm version](https://badge.fury.io/js/%40repochief%2Fadapters.svg)](https://badge.fury.io/js/%40repochief%2Fadapters)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/repochief/adapters/workflows/CI/badge.svg)](https://github.com/repochief/adapters/actions)
[![Contributors](https://img.shields.io/github/contributors/repochief/adapters.svg)](https://github.com/repochief/adapters/graphs/contributors)

## 🚀 What is @repochief/adapters?

The **@repochief/adapters** package is an open source framework that enables any AI terminal tool to work seamlessly with RepoChief's orchestration engine. It provides a standardized interface and intelligent routing system that allows the community to contribute adapters for their favorite AI coding assistants.

### Supported AI Tools

| Tool | Status | Maintainer | Features |
|------|--------|------------|----------|
| 🔷 **Claude Code** | ✅ Planned | RepoChief Team | Sub-agents, Streaming, Multi-file |
| 🤖 **Gemini CLI** | ✅ Available | RepoChief Team | Large context, JSON output, Fast |
| 🔧 **Aider** | 🚧 Community | Help wanted! | Git integration, Multiple models |
| 🎯 **Cursor** | 🚧 Community | Help wanted! | IDE integration, Code completion |
| ⚡ **Continue** | 🚧 Community | Help wanted! | VS Code extension, Autocomplete |
| 🧠 **Codeium** | 🚧 Community | Help wanted! | Code suggestions, Chat interface |

## 📦 Installation

```bash
npm install @repochief/adapters
```

## 🎯 Quick Start

### Using an Existing Adapter

```javascript
const { AdapterRegistry, TaskRouter, GeminiCLIAdapterV2 } = require('@repochief/adapters');

// Create and configure adapter
const adapter = new GeminiCLIAdapterV2({
    apiKey: 'your-gemini-api-key',
    model: 'gemini-2.0-flash',
    maxTokens: 1000000
});

// Initialize the adapter
await adapter.initialize();

// Register with the router
const registry = new AdapterRegistry();
registry.registerAdapter('gemini-cli', adapter, '2.0.0');

// Route tasks intelligently
const router = new TaskRouter(registry);
const task = {
    type: 'generation',
    description: 'Create a React component',
    context: { files: ['component.jsx'] }
};

const routing = await router.route(task);
const result = await routing.adapter.executeTask(task);
```

### Creating a New Adapter

```javascript
const { AIAgentAdapter } = require('@repochief/adapters');

class MyCustomAdapter extends AIAgentAdapter {
    constructor(config) {
        super();
        this.config = config;
        this._capabilities = {
            maxContextTokens: 50000,
            supportedLanguages: ['javascript', 'python'],
            multiFile: true,
            streaming: false,
            features: {
                'generation': true,
                'analysis': true
            }
        };
    }

    async initialize() {
        // Initialize your AI tool here
        console.log('MyCustomAdapter initialized');
        this.emit('adapter:initialized');
    }

    async executeTask(task) {
        // Implement your task execution logic
        return {
            success: true,
            output: `Completed task: ${task.description}`,
            files: task.context?.files || []
        };
    }

    async healthCheck() {
        return { status: 'healthy', timestamp: new Date() };
    }

    async shutdown() {
        console.log('MyCustomAdapter shutting down');
    }
}

module.exports = MyCustomAdapter;
```

## 🏗️ Architecture

### Core Components

- **🏪 AdapterRegistry**: Manages adapter registration, versioning, and capability matching
- **🛣️ TaskRouter**: Intelligently routes tasks to the best available adapter
- **🔌 AIAgentAdapter**: Base class that all adapters must extend
- **📋 OrchestrationStrategy**: Defines patterns for multi-adapter coordination

### Capability Detection

The framework includes sophisticated capability detection that allows adapters to:

- **Declare Features**: Specify what they can do (generation, analysis, refactoring, etc.)
- **Dynamic Adjustment**: Update capabilities based on runtime conditions
- **Graceful Degradation**: Automatically fallback when features aren't available
- **Performance Tracking**: Monitor and optimize adapter selection

```javascript
// Example capability declaration
const capabilities = {
    maxContextTokens: 1000000,
    supportedLanguages: ['js', 'py', 'ts'],
    multiFile: true,
    streaming: true,
    subAgents: {
        supported: true,
        maxConcurrent: 3,
        delegationTypes: ['analysis', 'generation']
    },
    features: {
        'generation': true,
        'refactoring': { 
            enabled: true,
            config: { preserveComments: true }
        }
    }
};
```

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### 🎯 High Priority Contributions Needed

1. **Claude Code Adapter** - Official adapter for Anthropic's Claude Code
2. **Aider Adapter** - Integration with Paul Gauthier's Aider
3. **Cursor Adapter** - Support for Cursor IDE's AI features
4. **Continue Adapter** - VS Code Continue extension integration

### 📋 Contribution Types

- **🔌 New Adapters**: Add support for new AI tools
- **🐛 Bug Fixes**: Fix issues in existing adapters
- **📚 Documentation**: Improve guides and examples
- **🧪 Tests**: Add test coverage for adapters
- **✨ Features**: Enhance the core framework

### 🚀 Getting Started

1. **Fork the repository**
2. **Clone your fork**: `git clone https://github.com/yourusername/repochief-adapters.git`
3. **Install dependencies**: `npm install`
4. **Run tests**: `npm test`
5. **Create your adapter**: Use `src/examples/adapter-template.js` as a starting point
6. **Add tests**: Create comprehensive tests for your adapter
7. **Submit a pull request**

See our [Contributing Guide](CONTRIBUTING.md) for detailed instructions.

## 📖 Documentation

- **[Capability Detection Protocol](docs/CAPABILITY_DETECTION_PROTOCOL.md)** - Understanding adapter capabilities
- **[Adapter Development Guide](docs/ADAPTER_DEVELOPMENT_GUIDE.md)** - Creating new adapters
- **[Testing Framework](docs/TESTING_FRAMEWORK.md)** - Writing adapter tests
- **[API Reference](docs/API_REFERENCE.md)** - Complete API documentation

## 🏆 Community Showcase

### Featured Community Adapters

*Coming soon! Be the first to contribute an adapter and get featured here.*

### Success Stories

*Share how you're using RepoChief adapters in your workflow!*

## 📊 Roadmap

### v1.1.0 (Q2 2025)
- [ ] Claude Code official adapter
- [ ] Adapter performance benchmarking
- [ ] Hot-swappable adapter loading

### v1.2.0 (Q3 2025)
- [ ] Adapter marketplace integration
- [ ] Visual adapter builder
- [ ] Multi-adapter orchestration patterns

### v2.0.0 (Q4 2025)
- [ ] Federated adapter discovery
- [ ] Machine learning adapter selection
- [ ] Enterprise adapter governance

## 💬 Community

- **Discord**: [Join our community](https://discord.gg/repochief)
- **GitHub Discussions**: [Ask questions and share ideas](https://github.com/repochief/adapters/discussions)
- **Twitter**: [@repochief](https://twitter.com/repochief)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Paul Gauthier** - Creator of Aider, inspiration for adapter patterns
- **Anthropic** - Claude Code integration possibilities  
- **Google** - Gemini CLI reference implementation
- **Community Contributors** - Making RepoChief better for everyone

---

**Made with ❤️ by the RepoChief community**

*Help us build the future of AI-powered development tools!*