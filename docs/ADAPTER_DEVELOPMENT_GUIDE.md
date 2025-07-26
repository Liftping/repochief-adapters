# Adapter Development Guide

This guide walks you through creating a new adapter for the RepoChief ecosystem.

## Quick Start

### 1. Create Your Adapter Class

```javascript
const { AIAgentAdapter } = require('@repochief/adapters');

class MyAdapter extends AIAgentAdapter {
    constructor(config = {}) {
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
        // Initialize your AI tool connection
        console.log('MyAdapter initialized');
        this.emit('adapter:initialized');
    }

    async executeTask(task) {
        // Your task execution logic here
        return {
            success: true,
            output: `Completed: ${task.description}`,
            files: task.context?.files || []
        };
    }

    async healthCheck() {
        return { status: 'healthy', timestamp: new Date() };
    }

    async shutdown() {
        console.log('MyAdapter shutting down');
    }
}

module.exports = MyAdapter;
```

### 2. Register Your Adapter

```javascript
const { AdapterRegistry } = require('@repochief/adapters');
const MyAdapter = require('./MyAdapter');

const registry = new AdapterRegistry();
const adapter = new MyAdapter({ apiKey: 'your-key' });

await adapter.initialize();
registry.registerAdapter('my-adapter', adapter, '1.0.0');
```

## Required Methods

All adapters must implement these methods:

### `initialize(config)`
Set up your adapter with configuration.

### `executeTask(task)`
Execute a task and return results in this format:
```javascript
{
    success: boolean,
    output: string,
    files: string[],
    metadata?: object
}
```

### `healthCheck()`
Verify adapter is working correctly.

### `shutdown()`
Clean up resources when adapter is no longer needed.

## Capability Declaration

Accurately declare what your adapter can do:

```javascript
this._capabilities = {
    // Maximum context window size
    maxContextTokens: 100000,
    
    // Supported programming languages
    supportedLanguages: ['javascript', 'python', 'typescript'],
    
    // Can handle multiple files at once
    multiFile: true,
    
    // Supports streaming output
    streaming: false,
    
    // Available features
    features: {
        'generation': true,      // Code generation
        'analysis': true,        // Code analysis
        'refactoring': false,    // Code refactoring
        'testing': true,         // Test generation
        'documentation': false   // Documentation generation
    }
};
```

## Best Practices

1. **Error Handling**: Always wrap external calls in try-catch
2. **Resource Management**: Clean up processes and files in shutdown()
3. **Configuration**: Support both env vars and config objects
4. **Logging**: Use structured logging for debugging
5. **Testing**: Include comprehensive tests

## Example Adapters

Check the `examples/` directory for reference implementations.

## Testing Your Adapter

Create comprehensive tests:

```javascript
const { expect } = require('chai');
const MyAdapter = require('../src/MyAdapter');

describe('MyAdapter', () => {
    let adapter;

    beforeEach(() => {
        adapter = new MyAdapter({ apiKey: 'test-key' });
    });

    it('should initialize correctly', async () => {
        await adapter.initialize();
        expect(adapter.isInitialized).to.be.true;
    });

    it('should execute tasks', async () => {
        await adapter.initialize();
        const task = {
            type: 'generation',
            description: 'Create a function'
        };
        
        const result = await adapter.executeTask(task);
        expect(result.success).to.be.true;
    });
});
```