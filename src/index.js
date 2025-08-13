/**
 * @repochief/adapters - Open Source AI Terminal Adapter Framework
 * 
 * This package provides a standardized interface for integrating any AI terminal
 * tool with RepoChief's orchestration engine. It enables the community to
 * contribute adapters for their favorite AI coding assistants.
 * 
 * @version 1.0.0
 * @license MIT
 */

// Core adapter framework
const AdapterRegistry = require('./AdapterRegistry');
const TaskRouter = require('./TaskRouter');
const AIAgentAdapter = require('./base/AIAgentAdapter');
const OrchestrationStrategy = require('./strategies/OrchestrationStrategy');
const AdapterFactory = require('./factory/AdapterFactory');

// Enhanced adapters
const GeminiCLIAdapterV2 = require('./enhanced/GeminiCLIAdapterV2');

// Specialized adapters
const ClaudeCodeAdapter = require('./adapters/claude-code/ClaudeCodeAdapter');

// Export main classes
module.exports = {
    // Core Framework
    AdapterRegistry,
    TaskRouter,
    AIAgentAdapter,
    OrchestrationStrategy,
    AdapterFactory,
    
    // Enhanced Adapters
    GeminiCLIAdapterV2,
    
    // Specialized Adapters
    ClaudeCodeAdapter,
    
    // Utility functions
    createAdapter: (type, config) => {
        switch (type) {
            case 'gemini-cli-v2':
                return new GeminiCLIAdapterV2(config);
            case 'claude-code':
                return new ClaudeCodeAdapter(config);
            default:
                throw new Error(`Unknown adapter type: ${type}`);
        }
    },
    
    // Version info
    version: require('../package.json').version,
    
    // Constants
    SUPPORTED_FEATURES: {
        GENERATION: 'generation',
        ANALYSIS: 'analysis',
        REFACTORING: 'refactoring',
        TESTING: 'testing',
        DOCUMENTATION: 'documentation',
        MULTI_FILE: 'multiFile',
        STREAMING: 'streaming',
        SUB_AGENTS: 'subAgents'
    },
    
    ADAPTER_STATES: {
        UNINITIALIZED: 'uninitialized',
        INITIALIZING: 'initializing',
        READY: 'ready',
        BUSY: 'busy',
        ERROR: 'error',
        SHUTDOWN: 'shutdown'
    }
};

// Re-export classes for direct access
module.exports.AdapterRegistry = AdapterRegistry;
module.exports.TaskRouter = TaskRouter;
module.exports.AIAgentAdapter = AIAgentAdapter;
module.exports.OrchestrationStrategy = OrchestrationStrategy;
module.exports.AdapterFactory = AdapterFactory;
module.exports.GeminiCLIAdapterV2 = GeminiCLIAdapterV2;
module.exports.ClaudeCodeAdapter = ClaudeCodeAdapter;