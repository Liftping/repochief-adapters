# Capability Detection Protocol

**Version**: 1.0.0  
**Status**: Implemented  
**Last Updated**: 2025-07-26

## Overview

The Capability Detection Protocol enables RepoChief to dynamically discover and leverage the features of different AI terminal adapters. This protocol ensures that RepoChief can work optimally with any AI assistant, automatically using advanced features when available and gracefully degrading when they're not.

## Core Concepts

### 1. Capability Structure

Each adapter exposes its capabilities through a standardized structure:

```javascript
{
    // Core capabilities
    maxContextTokens: 1000000,        // Maximum context window size
    supportedLanguages: ['js', 'py'], // Language support
    multiFile: true,                  // Can handle multiple files
    streaming: true,                  // Supports streaming output
    
    // Advanced features
    subAgents: {
        supported: true,              // Has sub-agent capability
        maxConcurrent: 5,             // Max parallel sub-agents
        delegationTypes: ['analysis'] // Types of delegation supported
    },
    
    // Feature flags with optional configuration
    features: {
        'generation': true,           // Simple boolean flag
        'visionSupport': {            // Complex feature with config
            enabled: true,
            config: {
                supportedFormats: ['png', 'jpg'],
                maxImageSize: 20971520
            }
        }
    }
}
```

### 2. Feature Detection Methods

The protocol provides multiple ways to check capabilities:

#### Simple Feature Check
```javascript
// Check if adapter supports a feature
if (adapter.supportsFeature('multiFile')) {
    // Use multi-file functionality
}
```

#### Nested Feature Check
```javascript
// Use dot notation for nested features
if (adapter.supportsFeature('subAgents.supported')) {
    // Use sub-agent functionality
}
```

#### Feature Configuration
```javascript
// Get detailed configuration for complex features
const visionConfig = adapter.getFeatureConfig('visionSupport');
if (visionConfig) {
    console.log('Supported formats:', visionConfig.supportedFormats);
}
```

### 3. Dynamic Capability Adjustment

Adapters can adjust their capabilities based on runtime conditions:

```javascript
// Example: Adjust based on CLI version
async _adjustCapabilitiesForVersion(version) {
    if (version < '2.0.0') {
        this._capabilities.streaming = false;
        this.emitCapabilityChange('streaming', true, false);
    }
}

// Example: Adjust based on model selection
async _validateModelCapabilities() {
    if (this.model === 'gemini-pro') {
        this._capabilities.maxContextTokens = 32768;
    }
}
```

## Implementation Guide

### Creating a Capability-Aware Adapter

1. **Extend the Base Adapter**
```javascript
const AIAgentAdapter = require('./base/AIAgentAdapter');

class MyAdapter extends AIAgentAdapter {
    constructor() {
        super();
        this._capabilities = {
            maxContextTokens: 100000,
            supportedLanguages: ['javascript', 'python'],
            multiFile: true,
            streaming: false,
            features: {
                'generation': true,
                'refactoring': true
            }
        };
    }
}
```

2. **Implement Version Management**
```javascript
get apiVersion() {
    return '1.0.0';
}

get supportedApiVersions() {
    return ['0.9.0', '1.0.0'];
}
```

3. **Dynamic Capability Detection**
```javascript
async initialize(config) {
    // Check actual capabilities
    const cliVersion = await this.checkCLIVersion();
    
    if (cliVersion >= '2.0') {
        this._capabilities.streaming = true;
        this._capabilities.features.advancedMode = true;
    }
    
    // Emit changes
    this.emit('adapter:initialized', {
        capabilities: this._capabilities
    });
}
```

### Using the Task Router

The Task Router automatically matches tasks to adapters based on capabilities:

```javascript
const router = new TaskRouter(registry);

// Router analyzes the task
const task = {
    type: 'generation',
    description: 'Generate TypeScript React components',
    context: {
        files: ['comp1.tsx', 'comp2.tsx']
    }
};

// Automatically routes to best adapter
const routing = await router.route(task);
console.log(`Selected: ${routing.adapterName} v${routing.adapterVersion}`);
console.log(`Strategy: ${routing.strategy}`);
```

### Capability Matching Algorithm

The registry scores adapters based on how well they match requirements:

1. **Required Features** (10 points each)
   - Must have all required features or score is 0

2. **Context Window** (5 points + bonus)
   - Must meet minimum requirement
   - Bonus points for significantly larger context

3. **Language Support** (5 points)
   - Full match required for maximum score
   - Partial credit for partial matches

4. **Special Capabilities** (variable points)
   - Multi-file support: 3 points
   - Streaming: 2 points
   - Sub-agents: 5 points

## Advanced Features

### 1. Graceful Degradation

When an adapter lacks a requested feature, the system automatically falls back:

```javascript
async executeWithFallback(task, strategies) {
    for (const strategy of strategies) {
        try {
            switch (strategy) {
                case 'subAgents':
                    if (this.supportsFeature('subAgents')) {
                        return await this.executeWithSubAgents(task);
                    }
                    break;
                
                case 'parallel':
                    if (this.supportsFeature('parallelExecution')) {
                        return await this.executeInParallel(task);
                    }
                    break;
                
                case 'sequential':
                default:
                    return await this.executeSequentially(task);
            }
        } catch (error) {
            continue; // Try next strategy
        }
    }
}
```

### 2. Vendor Extensions

Tasks can include vendor-specific extensions that are only used by compatible adapters:

```javascript
const task = {
    id: 'task-1',
    type: 'generation',
    description: 'Generate code',
    
    // Vendor-specific features
    extensions: {
        'claude-code': {
            subAgents: {
                orchestrationMode: 'hierarchical',
                agentRoles: ['architect', 'developer', 'reviewer']
            }
        },
        'gemini-cli': {
            temperature: 0.7,
            streaming: true
        }
    }
};
```

### 3. Performance-Based Selection

The router can consider performance metrics when selecting adapters:

```javascript
const router = new TaskRouter(registry, {
    considerPerformance: true
});

// Router will boost score for faster adapters
// based on historical performance data
```

## Monitoring and Events

### Capability Change Events
```javascript
adapter.on('capability:changed', (event) => {
    console.log(`Capability ${event.capability} changed:`);
    console.log(`  Old: ${event.oldValue}`);
    console.log(`  New: ${event.newValue}`);
});
```

### Routing Events
```javascript
router.on('task:routed', (event) => {
    console.log(`Task ${event.taskId} → ${event.adapter}`);
});

router.on('route:cache-hit', (event) => {
    console.log(`Cache hit for ${event.taskId}`);
});
```

## Best Practices

### 1. Capability Declaration
- Be honest about capabilities
- Update dynamically based on runtime checks
- Emit events when capabilities change

### 2. Feature Granularity
- Use boolean flags for simple features
- Use configuration objects for complex features
- Group related features logically

### 3. Version Compatibility
- Support multiple API versions when possible
- Provide migration paths between versions
- Document breaking changes clearly

### 4. Performance Optimization
- Cache capability checks
- Batch similar tasks for routing
- Monitor and report performance metrics

## Testing Capabilities

### Unit Testing
```javascript
describe('Adapter Capabilities', () => {
    it('should report correct capabilities', () => {
        const adapter = new MyAdapter();
        
        expect(adapter.supportsFeature('generation')).to.be.true;
        expect(adapter.supportsFeature('streaming')).to.be.false;
    });
    
    it('should adjust capabilities dynamically', async () => {
        const adapter = new MyAdapter();
        await adapter.initialize({ model: 'advanced' });
        
        expect(adapter.supportsFeature('advancedMode')).to.be.true;
    });
});
```

### Integration Testing
```javascript
describe('Task Routing', () => {
    it('should route to capable adapter', async () => {
        const task = {
            type: 'generation',
            description: 'Multi-file TypeScript generation',
            context: { files: ['a.ts', 'b.ts'] }
        };
        
        const routing = await router.route(task);
        
        expect(routing.adapter.supportsFeature('multiFile')).to.be.true;
        expect(routing.adapter.supportsFeature('generation')).to.be.true;
    });
});
```

## Future Enhancements

### Planned Features
1. **Capability Negotiation Protocol**
   - Two-way capability negotiation
   - Dynamic feature enabling/disabling

2. **Capability Marketplace**
   - Share capability definitions
   - Community-contributed feature detectors

3. **Machine Learning Integration**
   - Learn optimal adapter selection
   - Predict task success based on capabilities

4. **Real-time Capability Updates**
   - Live capability discovery
   - Hot-swappable adapters

## Conclusion

The Capability Detection Protocol makes RepoChief truly vendor-agnostic while ensuring optimal use of each AI terminal's unique features. By following this protocol, adapter developers can ensure their integrations work seamlessly with RepoChief's intelligent orchestration system.