/**
 * Forward Compatibility Manager
 * 
 * Enables adapters to work with future features and API changes
 * through extensible interfaces and feature negotiation.
 */

const { EventEmitter } = require('events');
const semver = require('semver');

class ForwardCompatibilityManager extends EventEmitter {
    constructor() {
        super();
        
        // Feature registry for future capabilities
        this._featureRegistry = new Map();
        
        // Extension handlers for unknown features
        this._extensionHandlers = new Map();
        
        // Version compatibility matrix
        this._compatibilityMatrix = new Map();
        
        // Feature negotiation protocols
        this._negotiationProtocols = new Map();
        
        // Initialize core feature definitions
        this._initializeCoreFeatures();
    }
    
    /**
     * Register a new feature definition
     * @param {string} featureName - Name of the feature
     * @param {Object} definition - Feature definition
     */
    registerFeature(featureName, definition) {
        const featureDef = {
            name: featureName,
            version: definition.version || '1.0.0',
            schema: definition.schema,
            validators: definition.validators || [],
            transformers: definition.transformers || {},
            capabilities: definition.capabilities || {},
            metadata: {
                experimental: definition.experimental || false,
                deprecated: definition.deprecated || false,
                replacedBy: definition.replacedBy || null,
                addedIn: definition.addedIn || 'unknown',
                ...definition.metadata
            }
        };
        
        this._featureRegistry.set(featureName, featureDef);
        
        this.emit('feature:registered', {
            feature: featureName,
            definition: featureDef
        });
        
        return featureDef;
    }
    
    /**
     * Register an extension handler for unknown features
     * @param {string} pattern - Pattern to match (can use wildcards)
     * @param {Function} handler - Handler function
     */
    registerExtensionHandler(pattern, handler) {
        this._extensionHandlers.set(pattern, {
            pattern: new RegExp(pattern.replace('*', '.*')),
            handler,
            priority: this._extensionHandlers.size
        });
    }
    
    /**
     * Check if a feature is supported
     * @param {string} featureName - Feature to check
     * @param {string} version - Optional version requirement
     * @returns {boolean} Whether feature is supported
     */
    isFeatureSupported(featureName, version = null) {
        const feature = this._featureRegistry.get(featureName);
        if (!feature) return false;
        
        if (version && !semver.satisfies(feature.version, version)) {
            return false;
        }
        
        return !feature.metadata.deprecated;
    }
    
    /**
     * Negotiate feature compatibility between adapter and task
     * @param {Object} adapterCapabilities - What the adapter supports
     * @param {Object} taskRequirements - What the task needs
     * @returns {Object} Negotiated feature set
     */
    negotiateFeatures(adapterCapabilities, taskRequirements) {
        const negotiated = {
            supported: {},
            unsupported: {},
            alternatives: {},
            extensions: {}
        };
        
        // Check each required feature
        for (const [feature, requirement] of Object.entries(taskRequirements)) {
            const result = this._negotiateFeature(
                feature,
                requirement,
                adapterCapabilities
            );
            
            if (result.supported) {
                negotiated.supported[feature] = result.configuration;
            } else {
                negotiated.unsupported[feature] = result.reason;
                if (result.alternative) {
                    negotiated.alternatives[feature] = result.alternative;
                }
            }
        }
        
        // Handle unknown features through extensions
        for (const [feature, requirement] of Object.entries(taskRequirements)) {
            if (!this._featureRegistry.has(feature)) {
                const handler = this._findExtensionHandler(feature);
                if (handler) {
                    negotiated.extensions[feature] = handler(requirement, adapterCapabilities);
                }
            }
        }
        
        return negotiated;
    }
    
    /**
     * Transform task for forward compatibility
     * @param {Object} task - Original task
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @returns {Object} Transformed task
     */
    async transformTask(task, fromVersion, toVersion) {
        const transformed = { ...task };
        
        // Apply version-specific transformations
        const path = this._getTransformationPath(fromVersion, toVersion);
        
        for (const version of path) {
            const transformers = this._getTransformersForVersion(version);
            for (const transformer of transformers) {
                transformed = await transformer(transformed, version);
            }
        }
        
        // Apply feature transformations
        if (task.features) {
            transformed.features = await this._transformFeatures(
                task.features,
                fromVersion,
                toVersion
            );
        }
        
        // Handle extensions
        if (task.extensions) {
            transformed.extensions = await this._transformExtensions(
                task.extensions,
                fromVersion,
                toVersion
            );
        }
        
        return transformed;
    }
    
    /**
     * Create a future-proof task structure
     * @param {Object} baseTask - Basic task structure
     * @returns {Object} Future-proof task
     */
    createFutureProofTask(baseTask) {
        return {
            // Core fields (stable)
            id: baseTask.id,
            type: baseTask.type,
            objective: baseTask.objective,
            description: baseTask.description,
            
            // Versioned structure
            version: '2.0.0',
            apiVersion: '2.0.0',
            
            // Context with metadata
            context: {
                ...baseTask.context,
                metadata: {
                    created: new Date().toISOString(),
                    source: 'repochief',
                    ...baseTask.context?.metadata
                }
            },
            
            // Feature requirements
            features: {
                required: baseTask.requiredFeatures || [],
                optional: baseTask.optionalFeatures || [],
                preferred: baseTask.preferredFeatures || []
            },
            
            // Extensible configuration
            configuration: {
                ...baseTask.configuration,
                // Allow arbitrary configuration
                custom: {}
            },
            
            // Vendor extensions
            extensions: baseTask.extensions || {},
            
            // Forward compatibility
            _future: {
                // Reserved for future use
                schemaVersion: '1.0.0',
                capabilities: {},
                hints: {}
            }
        };
    }
    
    /**
     * Validate task against future compatibility rules
     * @param {Object} task - Task to validate
     * @returns {Object} Validation result
     */
    validateForwardCompatibility(task) {
        const errors = [];
        const warnings = [];
        const suggestions = [];
        
        // Check for required version info
        if (!task.version && !task.apiVersion) {
            warnings.push('Task lacks version information');
            suggestions.push('Add version field for better compatibility');
        }
        
        // Check for deprecated features
        if (task.features) {
            for (const feature of Object.keys(task.features)) {
                const def = this._featureRegistry.get(feature);
                if (def?.metadata.deprecated) {
                    warnings.push(`Feature '${feature}' is deprecated`);
                    if (def.metadata.replacedBy) {
                        suggestions.push(`Use '${def.metadata.replacedBy}' instead`);
                    }
                }
            }
        }
        
        // Check for experimental features
        if (task.features) {
            for (const feature of Object.keys(task.features)) {
                const def = this._featureRegistry.get(feature);
                if (def?.metadata.experimental) {
                    warnings.push(`Feature '${feature}' is experimental and may change`);
                }
            }
        }
        
        // Validate extensions
        if (task.extensions) {
            for (const [vendor, ext] of Object.entries(task.extensions)) {
                if (!this._isValidExtension(vendor, ext)) {
                    errors.push(`Invalid extension format for vendor '${vendor}'`);
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            suggestions
        };
    }
    
    /**
     * Get compatibility report between versions
     * @param {string} fromVersion - Source version
     * @param {string} toVersion - Target version
     * @returns {Object} Compatibility report
     */
    getCompatibilityReport(fromVersion, toVersion) {
        const report = {
            compatible: true,
            breakingChanges: [],
            deprecations: [],
            newFeatures: [],
            migrations: []
        };
        
        // Check compatibility matrix
        const key = `${fromVersion}->${toVersion}`;
        const compatibility = this._compatibilityMatrix.get(key);
        
        if (compatibility) {
            return compatibility;
        }
        
        // Generate compatibility report
        const fromFeatures = this._getFeaturesForVersion(fromVersion);
        const toFeatures = this._getFeaturesForVersion(toVersion);
        
        // Find breaking changes
        for (const feature of fromFeatures) {
            if (!toFeatures.includes(feature)) {
                const def = this._featureRegistry.get(feature);
                if (!def?.metadata.deprecated) {
                    report.breakingChanges.push(feature);
                    report.compatible = false;
                }
            }
        }
        
        // Find deprecations
        for (const feature of toFeatures) {
            const def = this._featureRegistry.get(feature);
            if (def?.metadata.deprecated && fromFeatures.includes(feature)) {
                report.deprecations.push({
                    feature,
                    replacedBy: def.metadata.replacedBy
                });
            }
        }
        
        // Find new features
        for (const feature of toFeatures) {
            if (!fromFeatures.includes(feature)) {
                report.newFeatures.push(feature);
            }
        }
        
        // Cache the report
        this._compatibilityMatrix.set(key, report);
        
        return report;
    }
    
    // Private methods
    
    _initializeCoreFeatures() {
        // Register core features that all adapters should understand
        this.registerFeature('task-execution', {
            version: '1.0.0',
            schema: {
                type: 'object',
                properties: {
                    mode: { enum: ['sequential', 'parallel', 'streaming'] }
                }
            },
            capabilities: {
                modes: ['sequential', 'parallel', 'streaming']
            }
        });
        
        this.registerFeature('context-management', {
            version: '1.0.0',
            schema: {
                type: 'object',
                properties: {
                    maxTokens: { type: 'number' },
                    compression: { type: 'boolean' }
                }
            }
        });
        
        this.registerFeature('sub-agents', {
            version: '2.0.0',
            experimental: true,
            schema: {
                type: 'object',
                properties: {
                    orchestrationMode: { enum: ['hierarchical', 'peer-to-peer', 'hybrid'] },
                    maxAgents: { type: 'number' },
                    roles: { type: 'array', items: { type: 'string' } }
                }
            }
        });
        
        // Register extension handlers for common patterns
        this.registerExtensionHandler('experimental-*', (requirement, capabilities) => {
            // Handle experimental features gracefully
            return {
                supported: false,
                fallback: 'sequential',
                warning: 'Experimental feature not available'
            };
        });
        
        this.registerExtensionHandler('vendor-*', (requirement, capabilities) => {
            // Pass through vendor-specific extensions
            return {
                supported: true,
                passthrough: true,
                data: requirement
            };
        });
    }
    
    _negotiateFeature(feature, requirement, capabilities) {
        const featureDef = this._featureRegistry.get(feature);
        
        if (!featureDef) {
            return {
                supported: false,
                reason: 'Unknown feature'
            };
        }
        
        // Check if adapter has the capability
        const adapterFeature = capabilities.features?.[feature];
        if (!adapterFeature) {
            // Look for alternatives
            const alternative = this._findAlternativeFeature(feature, capabilities);
            return {
                supported: false,
                reason: 'Feature not supported',
                alternative
            };
        }
        
        // Negotiate configuration
        const configuration = this._negotiateConfiguration(
            requirement,
            adapterFeature,
            featureDef
        );
        
        return {
            supported: true,
            configuration
        };
    }
    
    _negotiateConfiguration(requirement, capability, definition) {
        const config = {};
        
        // Use schema to validate and merge configurations
        if (definition.schema) {
            // Simple merge for now
            Object.assign(config, capability, requirement);
        }
        
        return config;
    }
    
    _findAlternativeFeature(feature, capabilities) {
        // Look for features that can serve as alternatives
        const alternatives = {
            'sub-agents': ['parallel', 'batched'],
            'streaming': ['chunked', 'progressive'],
            'vision': ['image-description', 'ocr']
        };
        
        const possibleAlternatives = alternatives[feature] || [];
        
        for (const alt of possibleAlternatives) {
            if (capabilities.features?.[alt]) {
                return alt;
            }
        }
        
        return null;
    }
    
    _findExtensionHandler(feature) {
        for (const [pattern, config] of this._extensionHandlers) {
            if (config.pattern.test(feature)) {
                return config.handler;
            }
        }
        return null;
    }
    
    _getTransformationPath(fromVersion, toVersion) {
        // Simple version progression for now
        const versions = [];
        let current = fromVersion;
        
        while (semver.lt(current, toVersion)) {
            current = semver.inc(current, 'minor');
            versions.push(current);
        }
        
        return versions;
    }
    
    _getTransformersForVersion(version) {
        const transformers = [];
        
        for (const [feature, def] of this._featureRegistry) {
            if (def.transformers[version]) {
                transformers.push(def.transformers[version]);
            }
        }
        
        return transformers;
    }
    
    async _transformFeatures(features, fromVersion, toVersion) {
        const transformed = {};
        
        for (const [feature, config] of Object.entries(features)) {
            const def = this._featureRegistry.get(feature);
            
            if (def?.transformers) {
                let transformedConfig = config;
                const path = this._getTransformationPath(fromVersion, toVersion);
                
                for (const version of path) {
                    if (def.transformers[version]) {
                        transformedConfig = await def.transformers[version](transformedConfig);
                    }
                }
                
                transformed[feature] = transformedConfig;
            } else {
                transformed[feature] = config;
            }
        }
        
        return transformed;
    }
    
    async _transformExtensions(extensions, fromVersion, toVersion) {
        // Extensions are vendor-specific, so we preserve them
        // but allow vendors to register their own transformers
        return extensions;
    }
    
    _isValidExtension(vendor, extension) {
        // Basic validation - extensions should be objects
        return extension && typeof extension === 'object';
    }
    
    _getFeaturesForVersion(version) {
        const features = [];
        
        for (const [feature, def] of this._featureRegistry) {
            if (semver.lte(def.metadata.addedIn || '0.0.0', version)) {
                features.push(feature);
            }
        }
        
        return features;
    }
}

module.exports = ForwardCompatibilityManager;