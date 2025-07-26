/**
 * Enhanced AI Agent Adapter Base Class
 * 
 * Provides version management, capability detection, and graceful degradation
 * for all AI terminal adapters. This resilient design ensures RepoChief
 * remains compatible with rapidly evolving AI terminals.
 */

const { EventEmitter } = require('events');
const { z } = require('zod');

// Capability schema for validation
const AdapterCapabilitiesSchema = z.object({
    // Core capabilities
    maxContextTokens: z.number().positive(),
    supportedLanguages: z.array(z.string()),
    multiFile: z.boolean(),
    streaming: z.boolean(),
    
    // Advanced features
    subAgents: z.optional(z.object({
        supported: z.boolean(),
        maxConcurrent: z.number().optional(),
        delegationTypes: z.array(z.string()).optional()
    })),
    
    // Feature flags with flexible configuration
    features: z.record(z.union([z.boolean(), z.object({
        enabled: z.boolean(),
        config: z.any()
    })]))
});

// Task schema with extensions
const TaskSchema = z.object({
    id: z.string(),
    type: z.string(),
    objective: z.string(),
    description: z.string(),
    context: z.any().optional(),
    
    // Forward-compatible extensions
    extensions: z.record(z.record(z.any())).optional()
});

/**
 * Abstract base class for all AI agent adapters
 * Provides resilience against API changes and vendor differences
 */
class AIAgentAdapter extends EventEmitter {
    constructor() {
        super();
        this.name = 'base-adapter';
        this.initialized = false;
        this._capabilities = null;
        this._migrationHandlers = new Map();
    }
    
    // Version management - must be implemented by subclasses
    get apiVersion() {
        throw new Error('apiVersion getter must be implemented');
    }
    
    get adapterVersion() {
        return '2.0.0'; // Base adapter version
    }
    
    get supportedApiVersions() {
        throw new Error('supportedApiVersions getter must be implemented');
    }
    
    // Capability detection - must be implemented by subclasses
    get capabilities() {
        if (!this._capabilities) {
            throw new Error('capabilities getter must be implemented');
        }
        return this._capabilities;
    }
    
    /**
     * Check if adapter supports a specific feature
     * @param {string} feature - Feature name to check
     * @returns {boolean} Whether feature is supported
     */
    supportsFeature(feature) {
        if (!this._capabilities) return false;
        
        // Check top-level capabilities
        if (feature in this._capabilities) {
            return Boolean(this._capabilities[feature]);
        }
        
        // Check feature flags
        if (this._capabilities.features && feature in this._capabilities.features) {
            const featureValue = this._capabilities.features[feature];
            if (typeof featureValue === 'boolean') {
                return featureValue;
            }
            return featureValue.enabled || false;
        }
        
        // Check sub-features (e.g., 'subAgents.delegationTypes')
        if (feature.includes('.')) {
            const [parent, child] = feature.split('.', 2);
            if (parent in this._capabilities) {
                const parentValue = this._capabilities[parent];
                if (parentValue && typeof parentValue === 'object' && child in parentValue) {
                    return Boolean(parentValue[child]);
                }
            }
        }
        
        return false;
    }
    
    /**
     * Get feature configuration if available
     * @param {string} feature - Feature name
     * @returns {any} Feature configuration or null
     */
    getFeatureConfig(feature) {
        if (!this._capabilities?.features) return null;
        
        const featureValue = this._capabilities.features[feature];
        if (typeof featureValue === 'object' && featureValue.config) {
            return featureValue.config;
        }
        
        return null;
    }
    
    // Core methods - must be implemented by subclasses
    async initialize(config) {
        throw new Error('initialize method must be implemented');
    }
    
    async healthCheck() {
        throw new Error('healthCheck method must be implemented');
    }
    
    async shutdown() {
        throw new Error('shutdown method must be implemented');
    }
    
    // Versioned execution methods
    async executeTask(task) {
        // Validate task
        const validatedTask = TaskSchema.parse(task);
        
        // Determine best execution method based on API version
        const currentVersion = this.apiVersion;
        
        if (currentVersion.startsWith('2.') && this.executeTaskV2) {
            return await this.executeTaskV2(validatedTask);
        } else if (currentVersion.startsWith('1.') && this.executeTaskV1) {
            return await this.executeTaskV1(validatedTask);
        } else if (this.executeTaskV1) {
            // Default to V1 for unknown versions
            console.warn(`Unknown API version ${currentVersion}, falling back to V1`);
            return await this.executeTaskV1(validatedTask);
        } else {
            throw new Error('No suitable executeTask implementation found');
        }
    }
    
    // Versioned execution methods - implement as needed
    async executeTaskV1(task) {
        throw new Error('executeTaskV1 must be implemented');
    }
    
    async executeTaskV2(task) {
        // Default implementation that falls back to V1
        if (this.executeTaskV1) {
            console.warn('executeTaskV2 not implemented, falling back to V1');
            return await this.executeTaskV1(task);
        }
        throw new Error('executeTaskV2 must be implemented');
    }
    
    // Migration support
    /**
     * Register a migration handler for upgrading tasks between versions
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @param {Function} handler - Migration function
     */
    registerMigration(fromVersion, toVersion, handler) {
        const key = `${fromVersion}->${toVersion}`;
        this._migrationHandlers.set(key, handler);
    }
    
    /**
     * Migrate a task from one version to another
     * @param {any} task - Task to migrate
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @returns {any} Migrated task
     */
    async migrateTask(task, fromVersion, toVersion) {
        const key = `${fromVersion}->${toVersion}`;
        const handler = this._migrationHandlers.get(key);
        
        if (!handler) {
            // Try multi-hop migration
            const path = this._findMigrationPath(fromVersion, toVersion);
            if (path) {
                let migratedTask = task;
                for (let i = 0; i < path.length - 1; i++) {
                    migratedTask = await this.migrateTask(migratedTask, path[i], path[i + 1]);
                }
                return migratedTask;
            }
            
            throw new Error(`No migration path found from ${fromVersion} to ${toVersion}`);
        }
        
        return await handler(task);
    }
    
    /**
     * Find migration path between versions
     * @private
     */
    _findMigrationPath(fromVersion, toVersion) {
        // Simple BFS to find migration path
        const queue = [[fromVersion]];
        const visited = new Set([fromVersion]);
        
        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];
            
            if (current === toVersion) {
                return path;
            }
            
            // Check all possible next versions
            for (const [key, _] of this._migrationHandlers) {
                const [from, to] = key.split('->');
                if (from === current && !visited.has(to)) {
                    visited.add(to);
                    queue.push([...path, to]);
                }
            }
        }
        
        return null;
    }
    
    // Extension support for vendor-specific features
    /**
     * Extract vendor-specific extensions from a task
     * @param {any} task - Task with potential extensions
     * @param {string} vendorName - Vendor name (e.g., 'claude-code')
     * @returns {any} Vendor extensions or null
     */
    getVendorExtensions(task, vendorName) {
        return task.extensions?.[vendorName] || null;
    }
    
    /**
     * Add vendor-specific extensions to a task
     * @param {any} task - Task to extend
     * @param {string} vendorName - Vendor name
     * @param {any} extensions - Extensions to add
     * @returns {any} Extended task
     */
    addVendorExtensions(task, vendorName, extensions) {
        return {
            ...task,
            extensions: {
                ...task.extensions,
                [vendorName]: extensions
            }
        };
    }
    
    // Graceful degradation helpers
    /**
     * Execute task with automatic fallback strategies
     * @param {any} task - Task to execute
     * @param {Array<string>} strategies - Ordered list of strategies to try
     * @returns {any} Task result
     */
    async executeWithFallback(task, strategies) {
        const errors = [];
        
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
                    
                    case 'streaming':
                        if (this.supportsFeature('streaming')) {
                            return await this.executeWithStreaming(task);
                        }
                        break;
                    
                    case 'sequential':
                    default:
                        return await this.executeSequentially(task);
                }
            } catch (error) {
                errors.push({ strategy, error: error.message });
                continue;
            }
        }
        
        throw new Error(`All strategies failed: ${JSON.stringify(errors)}`);
    }
    
    // Strategy implementations - override in subclasses
    async executeWithSubAgents(task) {
        throw new Error('executeWithSubAgents not implemented');
    }
    
    async executeInParallel(task) {
        throw new Error('executeInParallel not implemented');
    }
    
    async executeWithStreaming(task) {
        throw new Error('executeWithStreaming not implemented');
    }
    
    async executeSequentially(task) {
        throw new Error('executeSequentially not implemented');
    }
    
    // Monitoring and diagnostics
    /**
     * Get adapter diagnostics
     * @returns {Object} Diagnostic information
     */
    getDiagnostics() {
        return {
            name: this.name,
            initialized: this.initialized,
            apiVersion: this.apiVersion,
            adapterVersion: this.adapterVersion,
            supportedApiVersions: this.supportedApiVersions,
            capabilities: this._capabilities,
            migrationPaths: Array.from(this._migrationHandlers.keys()),
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * Emit capability change event
     * @param {string} capability - Capability that changed
     * @param {any} oldValue - Previous value
     * @param {any} newValue - New value
     */
    emitCapabilityChange(capability, oldValue, newValue) {
        this.emit('capability:changed', {
            capability,
            oldValue,
            newValue,
            timestamp: new Date()
        });
    }
    
    /**
     * Emit version change event
     * @param {string} oldVersion - Previous version
     * @param {string} newVersion - New version
     */
    emitVersionChange(oldVersion, newVersion) {
        this.emit('version:changed', {
            oldVersion,
            newVersion,
            timestamp: new Date()
        });
    }
}

module.exports = AIAgentAdapter;