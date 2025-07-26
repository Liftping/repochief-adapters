/**
 * Feature Evolution System
 * 
 * Manages the evolution of features over time, allowing adapters
 * to gracefully handle new capabilities as they emerge in AI terminals.
 */

const { EventEmitter } = require('events');

class FeatureEvolution extends EventEmitter {
    constructor() {
        super();
        
        // Feature evolution timeline
        this._timeline = new Map();
        
        // Feature capability levels
        this._capabilityLevels = new Map();
        
        // Polyfills for missing features
        this._polyfills = new Map();
        
        // Feature composition rules
        this._compositionRules = new Map();
        
        // Initialize known feature evolutions
        this._initializeEvolutions();
    }
    
    /**
     * Register a feature evolution
     * @param {string} feature - Feature name
     * @param {Object} evolution - Evolution details
     */
    registerEvolution(feature, evolution) {
        const timeline = {
            feature,
            stages: evolution.stages || [],
            currentStage: evolution.currentStage || 0,
            capabilities: evolution.capabilities || {},
            migrations: evolution.migrations || {},
            polyfills: evolution.polyfills || {}
        };
        
        this._timeline.set(feature, timeline);
        
        // Register capability levels
        evolution.stages.forEach((stage, index) => {
            const levelKey = `${feature}:${stage.version}`;
            this._capabilityLevels.set(levelKey, {
                level: index,
                capabilities: stage.capabilities,
                requirements: stage.requirements
            });
        });
        
        this.emit('evolution:registered', { feature, timeline });
    }
    
    /**
     * Get the evolution stage for a feature
     * @param {string} feature - Feature name
     * @param {string} version - Version to check
     * @returns {Object} Evolution stage
     */
    getEvolutionStage(feature, version) {
        const timeline = this._timeline.get(feature);
        if (!timeline) return null;
        
        for (let i = timeline.stages.length - 1; i >= 0; i--) {
            const stage = timeline.stages[i];
            if (this._versionMatches(version, stage.version)) {
                return {
                    ...stage,
                    level: i,
                    isLatest: i === timeline.stages.length - 1
                };
            }
        }
        
        return null;
    }
    
    /**
     * Create a polyfill for a missing feature
     * @param {string} feature - Feature to polyfill
     * @param {Object} targetCapabilities - What we want to achieve
     * @param {Object} availableCapabilities - What we have available
     * @returns {Function} Polyfill function
     */
    createPolyfill(feature, targetCapabilities, availableCapabilities) {
        // Check if we have a registered polyfill
        const registeredPolyfill = this._polyfills.get(feature);
        if (registeredPolyfill) {
            return registeredPolyfill(targetCapabilities, availableCapabilities);
        }
        
        // Try to compose from existing features
        const composition = this._findComposition(feature, availableCapabilities);
        if (composition) {
            return this._createCompositePolyfill(composition);
        }
        
        // Create a basic fallback polyfill
        return this._createFallbackPolyfill(feature, targetCapabilities);
    }
    
    /**
     * Check if a feature can be emulated using other features
     * @param {string} feature - Target feature
     * @param {Object} availableCapabilities - Available capabilities
     * @returns {boolean} Whether emulation is possible
     */
    canEmulate(feature, availableCapabilities) {
        // Direct support
        if (availableCapabilities.features?.[feature]) {
            return true;
        }
        
        // Check polyfills
        if (this._polyfills.has(feature)) {
            return true;
        }
        
        // Check composition rules
        const composition = this._findComposition(feature, availableCapabilities);
        return composition !== null;
    }
    
    /**
     * Evolve a task to use newer features when available
     * @param {Object} task - Original task
     * @param {Object} capabilities - Adapter capabilities
     * @returns {Object} Evolved task
     */
    evolveTask(task, capabilities) {
        const evolved = { ...task };
        
        // Check each feature used in the task
        if (task.features) {
            evolved.features = {};
            
            for (const [feature, config] of Object.entries(task.features)) {
                const evolution = this._getFeatureEvolution(feature, capabilities);
                
                if (evolution.evolved) {
                    evolved.features[evolution.feature] = evolution.config;
                    
                    // Add migration metadata
                    if (!evolved._evolution) {
                        evolved._evolution = {};
                    }
                    evolved._evolution[feature] = {
                        originalFeature: feature,
                        evolvedTo: evolution.feature,
                        reason: evolution.reason
                    };
                } else {
                    evolved.features[feature] = config;
                }
            }
        }
        
        // Enhance with new capabilities
        const enhancements = this._findEnhancements(task, capabilities);
        if (enhancements.length > 0) {
            evolved._enhancements = enhancements;
            
            // Apply enhancements
            for (const enhancement of enhancements) {
                if (enhancement.autoApply) {
                    evolved.features = {
                        ...evolved.features,
                        [enhancement.feature]: enhancement.config
                    };
                }
            }
        }
        
        return evolved;
    }
    
    /**
     * Get feature compatibility matrix
     * @param {Array<string>} features - Features to check
     * @returns {Object} Compatibility matrix
     */
    getCompatibilityMatrix(features) {
        const matrix = {};
        
        for (const feature1 of features) {
            matrix[feature1] = {};
            
            for (const feature2 of features) {
                if (feature1 === feature2) {
                    matrix[feature1][feature2] = 'identical';
                } else {
                    matrix[feature1][feature2] = this._checkCompatibility(feature1, feature2);
                }
            }
        }
        
        return matrix;
    }
    
    /**
     * Register a polyfill implementation
     * @param {string} feature - Feature to polyfill
     * @param {Function} implementation - Polyfill implementation
     */
    registerPolyfill(feature, implementation) {
        this._polyfills.set(feature, implementation);
        
        this.emit('polyfill:registered', { feature });
    }
    
    /**
     * Register a composition rule
     * @param {string} targetFeature - Feature to achieve
     * @param {Object} rule - Composition rule
     */
    registerComposition(targetFeature, rule) {
        this._compositionRules.set(targetFeature, {
            requires: rule.requires,
            combine: rule.combine,
            limitations: rule.limitations || []
        });
        
        this.emit('composition:registered', { feature: targetFeature });
    }
    
    // Private methods
    
    _initializeEvolutions() {
        // Sub-agents evolution
        this.registerEvolution('sub-agents', {
            stages: [
                {
                    version: '1.0',
                    name: 'Basic Parallelism',
                    capabilities: {
                        parallel: true,
                        maxConcurrent: 2
                    }
                },
                {
                    version: '2.0',
                    name: 'Task Delegation',
                    capabilities: {
                        parallel: true,
                        delegation: true,
                        maxConcurrent: 5,
                        roles: ['worker']
                    }
                },
                {
                    version: '3.0',
                    name: 'Hierarchical Orchestration',
                    capabilities: {
                        parallel: true,
                        delegation: true,
                        hierarchy: true,
                        maxConcurrent: 10,
                        roles: ['orchestrator', 'manager', 'worker'],
                        communication: 'message-passing'
                    }
                }
            ],
            currentStage: 2
        });
        
        // Streaming evolution
        this.registerEvolution('streaming', {
            stages: [
                {
                    version: '1.0',
                    name: 'Chunked Output',
                    capabilities: {
                        chunks: true,
                        chunkSize: 1000
                    }
                },
                {
                    version: '2.0',
                    name: 'Progressive Streaming',
                    capabilities: {
                        chunks: true,
                        progressive: true,
                        backpressure: true,
                        chunkSize: 'dynamic'
                    }
                },
                {
                    version: '3.0',
                    name: 'Bidirectional Streaming',
                    capabilities: {
                        chunks: true,
                        progressive: true,
                        backpressure: true,
                        bidirectional: true,
                        protocols: ['websocket', 'sse', 'grpc']
                    }
                }
            ],
            currentStage: 1
        });
        
        // Vision evolution
        this.registerEvolution('vision', {
            stages: [
                {
                    version: '1.0',
                    name: 'Image Input',
                    capabilities: {
                        formats: ['png', 'jpg'],
                        maxSize: 5 * 1024 * 1024 // 5MB
                    }
                },
                {
                    version: '2.0',
                    name: 'Multimodal Understanding',
                    capabilities: {
                        formats: ['png', 'jpg', 'gif', 'webp'],
                        maxSize: 20 * 1024 * 1024, // 20MB
                        video: false,
                        understanding: ['objects', 'text', 'scenes']
                    }
                },
                {
                    version: '3.0',
                    name: 'Video and Real-time',
                    capabilities: {
                        formats: ['png', 'jpg', 'gif', 'webp', 'mp4', 'webm'],
                        maxSize: 100 * 1024 * 1024, // 100MB
                        video: true,
                        realtime: true,
                        understanding: ['objects', 'text', 'scenes', 'actions', 'temporal']
                    }
                }
            ],
            currentStage: 1
        });
        
        // Register polyfills
        this.registerPolyfill('sub-agents', (target, available) => {
            // Polyfill sub-agents using parallel execution
            return async (task) => {
                if (available.features?.parallel) {
                    // Decompose and execute in parallel
                    const subtasks = this._decomposeTask(task);
                    const results = await Promise.all(
                        subtasks.map(st => available.adapter.executeTask(st))
                    );
                    return this._aggregateResults(results);
                } else {
                    // Fall back to sequential
                    return available.adapter.executeTask(task);
                }
            };
        });
        
        // Register compositions
        this.registerComposition('advanced-reasoning', {
            requires: ['sub-agents', 'streaming'],
            combine: (capabilities) => {
                return {
                    chainOfThought: true,
                    multiStep: true,
                    verification: true
                };
            },
            limitations: ['No real-time collaboration']
        });
        
        this.registerComposition('multimodal-generation', {
            requires: ['vision', 'generation'],
            combine: (capabilities) => {
                return {
                    imageToCode: true,
                    diagramGeneration: true,
                    uiFromSketch: true
                };
            }
        });
    }
    
    _versionMatches(version, stageVersion) {
        // Simple version matching for now
        return version.startsWith(stageVersion);
    }
    
    _findComposition(feature, capabilities) {
        const rule = this._compositionRules.get(feature);
        if (!rule) return null;
        
        // Check if all required features are available
        const hasAllRequired = rule.requires.every(req => 
            capabilities.features?.[req] || this.canEmulate(req, capabilities)
        );
        
        if (!hasAllRequired) return null;
        
        return {
            feature,
            components: rule.requires,
            combine: rule.combine,
            limitations: rule.limitations
        };
    }
    
    _createCompositePolyfill(composition) {
        return async (task) => {
            // Implement composite behavior
            const componentResults = {};
            
            for (const component of composition.components) {
                // Execute each component
                componentResults[component] = await this._executeComponent(
                    component,
                    task
                );
            }
            
            // Combine results
            return composition.combine(componentResults);
        };
    }
    
    _createFallbackPolyfill(feature, targetCapabilities) {
        return async (task) => {
            console.warn(`Using fallback for feature '${feature}'`);
            
            // Provide basic fallback behavior
            switch (feature) {
                case 'streaming':
                    // Simulate streaming by returning full result
                    return { output: task.description, chunks: [task.description] };
                
                case 'vision':
                    // Return description instead of understanding
                    return { description: 'Image analysis not available' };
                
                default:
                    // Generic fallback
                    return { 
                        warning: `Feature '${feature}' not available`,
                        fallback: true 
                    };
            }
        };
    }
    
    _getFeatureEvolution(feature, capabilities) {
        const timeline = this._timeline.get(feature);
        if (!timeline) {
            return { evolved: false };
        }
        
        // Check if we can evolve to a newer version
        const currentStage = this._getCurrentStage(feature, capabilities);
        const latestStage = timeline.stages[timeline.stages.length - 1];
        
        if (currentStage && currentStage.level < timeline.stages.length - 1) {
            // Can evolve
            const nextStage = timeline.stages[currentStage.level + 1];
            
            if (this._canEvolveToStage(nextStage, capabilities)) {
                return {
                    evolved: true,
                    feature: feature,
                    config: nextStage.capabilities,
                    reason: `Evolved from ${currentStage.name} to ${nextStage.name}`
                };
            }
        }
        
        return { evolved: false };
    }
    
    _getCurrentStage(feature, capabilities) {
        const featureCaps = capabilities.features?.[feature];
        if (!featureCaps) return null;
        
        const timeline = this._timeline.get(feature);
        if (!timeline) return null;
        
        // Find matching stage based on capabilities
        for (let i = timeline.stages.length - 1; i >= 0; i--) {
            const stage = timeline.stages[i];
            if (this._matchesStageCapabilities(featureCaps, stage.capabilities)) {
                return { ...stage, level: i };
            }
        }
        
        return null;
    }
    
    _canEvolveToStage(stage, capabilities) {
        // Check if adapter has required capabilities for evolution
        if (stage.requirements) {
            return stage.requirements.every(req => 
                capabilities.features?.[req] !== undefined
            );
        }
        
        return true;
    }
    
    _matchesStageCapabilities(actual, expected) {
        // Check if actual capabilities match or exceed expected
        for (const [key, value] of Object.entries(expected)) {
            if (typeof value === 'boolean') {
                if (actual[key] !== value) return false;
            } else if (typeof value === 'number') {
                if ((actual[key] || 0) < value) return false;
            } else if (Array.isArray(value)) {
                const actualArray = actual[key] || [];
                if (!value.every(v => actualArray.includes(v))) return false;
            }
        }
        
        return true;
    }
    
    _findEnhancements(task, capabilities) {
        const enhancements = [];
        
        // Check for features that could enhance the task
        for (const [feature, featureCaps] of Object.entries(capabilities.features || {})) {
            if (!task.features?.[feature]) {
                // Feature not used in task
                const enhancement = this._getEnhancement(feature, task, featureCaps);
                if (enhancement) {
                    enhancements.push(enhancement);
                }
            }
        }
        
        return enhancements;
    }
    
    _getEnhancement(feature, task, capabilities) {
        // Determine if feature would enhance the task
        const enhancementRules = {
            'streaming': {
                applicable: (task) => task.type === 'generation' || task.streaming,
                config: { progressive: true },
                benefit: 'Real-time feedback',
                autoApply: false
            },
            'vision': {
                applicable: (task) => task.context?.images?.length > 0,
                config: { analyze: true },
                benefit: 'Visual understanding',
                autoApply: true
            },
            'sub-agents': {
                applicable: (task) => task.complexity === 'high' || 
                                     (task.context?.files?.length || 0) > 5,
                config: { delegate: true },
                benefit: 'Parallel processing',
                autoApply: false
            }
        };
        
        const rule = enhancementRules[feature];
        if (rule && rule.applicable(task)) {
            return {
                feature,
                config: rule.config,
                benefit: rule.benefit,
                autoApply: rule.autoApply
            };
        }
        
        return null;
    }
    
    _checkCompatibility(feature1, feature2) {
        // Define known compatibility relationships
        const compatibilityMap = {
            'streaming:parallel': 'complementary',
            'sub-agents:parallel': 'supersedes',
            'vision:generation': 'complementary',
            'streaming:batched': 'alternative'
        };
        
        const key1 = `${feature1}:${feature2}`;
        const key2 = `${feature2}:${feature1}`;
        
        return compatibilityMap[key1] || compatibilityMap[key2] || 'independent';
    }
    
    _decomposeTask(task) {
        // Simple task decomposition for polyfill
        if (task.context?.files?.length > 1) {
            return task.context.files.map((file, i) => ({
                ...task,
                id: `${task.id}-sub-${i}`,
                context: { ...task.context, files: [file] }
            }));
        }
        
        return [task];
    }
    
    _aggregateResults(results) {
        return {
            output: results.map(r => r.output).join('\n---\n'),
            artifacts: results.flatMap(r => r.artifacts || []),
            aggregated: true
        };
    }
}

module.exports = FeatureEvolution;