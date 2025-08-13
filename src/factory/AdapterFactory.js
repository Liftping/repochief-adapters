/**
 * AI Agent Adapter Factory
 * 
 * Central registry for AI tool adapters, enabling dynamic adapter selection
 * and instantiation for the RepoCHief orchestration system.
 */

const { EventEmitter } = require('events');

// Import available adapters
const ClaudeCodeAdapter = require('../adapters/claude-code/ClaudeCodeAdapter');

/**
 * Singleton factory for managing AI agent adapters
 */
class AdapterFactory extends EventEmitter {
    constructor() {
        super();
        
        // Registry of adapter constructors
        this.registry = new Map();
        
        // Cache of instantiated adapters
        this.instances = new Map();
        
        // Register built-in adapters
        this.registerBuiltInAdapters();
    }
    
    /**
     * Register built-in adapters
     */
    registerBuiltInAdapters() {
        // Register Claude Code adapter
        this.register('claude-code', () => new ClaudeCodeAdapter());
        
        // Future adapters can be registered here
        // this.register('aider', () => new AiderAdapter());
        // this.register('github-copilot', () => new GitHubCopilotAdapter());
        
        console.log(`✅ Registered ${this.registry.size} built-in adapter(s)`);
    }
    
    /**
     * Register a new adapter
     * @param {string} name - Adapter name
     * @param {Function} constructor - Function that returns adapter instance
     */
    register(name, constructor) {
        if (typeof constructor !== 'function') {
            throw new Error(`Adapter constructor must be a function for: ${name}`);
        }
        
        this.registry.set(name, constructor);
        
        this.emit('adapter:registered', {
            name,
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Get an adapter instance
     * @param {string} name - Adapter name
     * @param {Object} options - Adapter configuration options
     * @returns {AIAgentAdapter} Adapter instance
     */
    get(name, options = {}) {
        // Check if adapter is registered
        const constructor = this.registry.get(name);
        if (!constructor) {
            const available = Array.from(this.registry.keys()).join(', ');
            throw new Error(
                `Unknown adapter: ${name}. Available adapters: ${available}`
            );
        }
        
        // Create cache key from name and options
        const cacheKey = this.getCacheKey(name, options);
        
        // Return cached instance if available and reuse is allowed
        if (!options.forceNew && this.instances.has(cacheKey)) {
            return this.instances.get(cacheKey);
        }
        
        try {
            // Create new instance
            const adapter = constructor();
            
            // Initialize if options provided
            if (Object.keys(options).length > 0) {
                // Note: Initialization is async, caller must await if needed
                adapter.initializationPromise = adapter.initialize(options);
            }
            
            // Cache instance if caching is enabled
            if (!options.noCache) {
                this.instances.set(cacheKey, adapter);
            }
            
            this.emit('adapter:created', {
                name,
                cacheKey,
                cached: !options.noCache,
                timestamp: new Date().toISOString()
            });
            
            return adapter;
            
        } catch (error) {
            this.emit('adapter:error', {
                name,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }
    
    /**
     * Create adapter with initialization
     * @param {string} name - Adapter name
     * @param {Object} options - Adapter configuration
     * @returns {Promise<AIAgentAdapter>} Initialized adapter
     */
    async create(name, options = {}) {
        const adapter = this.get(name, options);
        
        // Wait for initialization if promise exists
        if (adapter.initializationPromise) {
            await adapter.initializationPromise;
        } else if (!adapter.initialized) {
            await adapter.initialize(options);
        }
        
        return adapter;
    }
    
    /**
     * Check if adapter is registered
     * @param {string} name - Adapter name
     * @returns {boolean} Whether adapter is registered
     */
    has(name) {
        return this.registry.has(name);
    }
    
    /**
     * Get list of registered adapters
     * @returns {string[]} List of adapter names
     */
    list() {
        return Array.from(this.registry.keys());
    }
    
    /**
     * Get adapter capabilities without instantiation
     * @param {string} name - Adapter name
     * @returns {Object} Adapter capabilities or null
     */
    async getCapabilities(name) {
        if (!this.has(name)) {
            return null;
        }
        
        try {
            // Create temporary instance to get capabilities
            const adapter = this.get(name, { noCache: true });
            const capabilities = adapter.capabilities;
            
            // Clean up if adapter has shutdown method
            if (typeof adapter.shutdown === 'function') {
                await adapter.shutdown();
            }
            
            return capabilities;
            
        } catch (error) {
            console.warn(`Failed to get capabilities for ${name}:`, error.message);
            return null;
        }
    }
    
    /**
     * Clear adapter cache
     * @param {string} name - Optional adapter name to clear specific cache
     */
    clearCache(name = null) {
        if (name) {
            // Clear specific adapter instances
            for (const [key, adapter] of this.instances.entries()) {
                if (key.startsWith(`${name}:`)) {
                    this.instances.delete(key);
                }
            }
        } else {
            // Clear all cached instances
            this.instances.clear();
        }
        
        this.emit('cache:cleared', {
            specific: name || 'all',
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Shutdown all adapters
     */
    async shutdown() {
        const shutdownPromises = [];
        
        for (const [key, adapter] of this.instances.entries()) {
            if (typeof adapter.shutdown === 'function') {
                shutdownPromises.push(
                    adapter.shutdown()
                        .catch(error => {
                            console.warn(`Error shutting down adapter ${key}:`, error.message);
                        })
                );
            }
        }
        
        await Promise.all(shutdownPromises);
        this.instances.clear();
        
        this.emit('factory:shutdown', {
            timestamp: new Date().toISOString()
        });
    }
    
    /**
     * Generate cache key from name and options
     * @private
     */
    getCacheKey(name, options) {
        // Use name and workspace root as cache key
        const workspaceRoot = options.workspaceRoot || 'default';
        return `${name}:${workspaceRoot}`;
    }
}

// Export singleton instance
const factory = new AdapterFactory();

module.exports = factory;
module.exports.AdapterFactory = AdapterFactory;