/**
 * Task Router
 * 
 * Intelligently routes tasks to the most appropriate AI agent adapter
 * based on task requirements, adapter capabilities, and user preferences.
 */

const { EventEmitter } = require('events');

class TaskRouter extends EventEmitter {
    constructor(registry, preferences = {}) {
        super();
        
        this.registry = registry;
        this.preferences = {
            preferredAdapters: [],
            considerPerformance: true,
            fallbackStrategies: ['subAgents', 'parallel', 'streaming', 'sequential'],
            ...preferences
        };
        
        // Cache for routing decisions
        this._routingCache = new Map();
        this._cacheTTL = 5 * 60 * 1000; // 5 minutes
    }
    
    /**
     * Route a task to the best available adapter
     * @param {Object} task - Task to route
     * @returns {Object} Routing decision with adapter and strategy
     */
    async route(task) {
        // Check cache first
        const cacheKey = this._generateCacheKey(task);
        const cached = this._getCachedRoute(cacheKey);
        if (cached) {
            this.emit('route:cache-hit', { taskId: task.id, adapter: cached.adapter.name });
            return cached;
        }
        
        // Analyze task requirements
        const requirements = this.analyzeTask(task);
        
        // Find matching adapters
        const selection = this.registry.selectOptimalAdapter(
            requirements,
            this.preferences
        );
        
        if (!selection) {
            throw new Error('No suitable adapter found for task requirements');
        }
        
        // Determine execution strategy
        const strategy = this._selectStrategy(selection.adapter, task, requirements);
        
        const routingDecision = {
            adapter: selection.adapter,
            adapterName: selection.name,
            adapterVersion: selection.version,
            strategy,
            requirements,
            score: selection.score,
            timestamp: new Date()
        };
        
        // Cache the decision
        this._cacheRoute(cacheKey, routingDecision);
        
        // Emit routing event
        this.emit('task:routed', {
            taskId: task.id,
            taskType: task.type,
            adapter: selection.name,
            version: selection.version,
            strategy
        });
        
        return routingDecision;
    }
    
    /**
     * Analyze task to determine requirements
     * @param {Object} task - Task to analyze
     * @returns {Object} Task requirements
     */
    analyzeTask(task) {
        const requirements = {
            features: [],
            minContextTokens: 0,
            languages: [],
            multiFile: false,
            streaming: false,
            subAgents: false
        };
        
        // Analyze task type
        const taskTypeFeatures = {
            'comprehension': ['comprehension', 'explanation'],
            'generation': ['generation', 'refactoring'],
            'validation': ['validation', 'testing'],
            'exploration': ['exploration', 'debugging'],
            'refactoring': ['refactoring', 'generation'],
            'testing': ['testing', 'generation'],
            'documentation': ['documentation', 'generation']
        };
        
        if (taskTypeFeatures[task.type]) {
            requirements.features.push(...taskTypeFeatures[task.type]);
        }
        
        // Analyze context size
        if (task.context) {
            const contextSize = this._estimateContextSize(task.context);
            requirements.minContextTokens = contextSize;
            
            // Check for multi-file requirements
            if (task.context.files && task.context.files.length > 1) {
                requirements.multiFile = true;
            }
        }
        
        // Analyze description for hints
        const description = task.description.toLowerCase();
        
        // Language detection
        const languagePatterns = {
            javascript: /\b(javascript|js|node|npm)\b/,
            typescript: /\b(typescript|ts|tsx)\b/,
            python: /\b(python|py|pip)\b/,
            java: /\b(java|maven|gradle)\b/,
            go: /\b(go|golang)\b/,
            rust: /\b(rust|cargo)\b/,
            'c++': /\b(c\+\+|cpp)\b/
        };
        
        for (const [lang, pattern] of Object.entries(languagePatterns)) {
            if (pattern.test(description)) {
                requirements.languages.push(lang);
            }
        }
        
        // Feature detection from description
        if (description.includes('stream') || description.includes('real-time')) {
            requirements.streaming = true;
        }
        
        if (description.includes('delegate') || description.includes('sub-agent') || 
            description.includes('parallel') || description.includes('distribute')) {
            requirements.subAgents = true;
        }
        
        // Check for vendor-specific extensions
        if (task.extensions) {
            for (const [vendor, ext] of Object.entries(task.extensions)) {
                if (ext.subAgents) {
                    requirements.subAgents = true;
                }
                if (ext.streaming) {
                    requirements.streaming = true;
                }
                if (ext.features) {
                    requirements.features.push(...ext.features);
                }
            }
        }
        
        // Deduplicate features
        requirements.features = [...new Set(requirements.features)];
        
        return requirements;
    }
    
    /**
     * Route multiple tasks efficiently
     * @param {Array<Object>} tasks - Tasks to route
     * @returns {Array<Object>} Routing decisions
     */
    async routeBatch(tasks) {
        // Group similar tasks for efficient routing
        const taskGroups = this._groupSimilarTasks(tasks);
        const routingDecisions = [];
        
        for (const group of taskGroups) {
            // Route the first task in the group
            const primaryRoute = await this.route(group[0]);
            
            // Apply same routing to similar tasks
            for (const task of group) {
                routingDecisions.push({
                    ...primaryRoute,
                    taskId: task.id,
                    groupedRouting: true
                });
            }
        }
        
        return routingDecisions;
    }
    
    /**
     * Get routing statistics
     * @returns {Object} Routing statistics
     */
    getStatistics() {
        const stats = {
            cacheSize: this._routingCache.size,
            adapterUsage: {},
            strategyUsage: {},
            averageScore: 0
        };
        
        let totalScore = 0;
        let routeCount = 0;
        
        for (const [_, route] of this._routingCache) {
            // Adapter usage
            const adapterKey = `${route.adapterName}:${route.adapterVersion}`;
            stats.adapterUsage[adapterKey] = (stats.adapterUsage[adapterKey] || 0) + 1;
            
            // Strategy usage
            stats.strategyUsage[route.strategy] = (stats.strategyUsage[route.strategy] || 0) + 1;
            
            // Score tracking
            totalScore += route.score;
            routeCount++;
        }
        
        stats.averageScore = routeCount > 0 ? totalScore / routeCount : 0;
        
        return stats;
    }
    
    /**
     * Clear routing cache
     */
    clearCache() {
        this._routingCache.clear();
        this.emit('cache:cleared', { timestamp: new Date() });
    }
    
    // Private methods
    
    /**
     * Select execution strategy based on adapter capabilities and task
     * @private
     */
    _selectStrategy(adapter, task, requirements) {
        // Check for explicit strategy in task extensions
        const vendorExt = adapter.getVendorExtensions?.(task, adapter.name);
        if (vendorExt?.executionStrategy) {
            return vendorExt.executionStrategy;
        }
        
        // Select based on capabilities and requirements
        for (const strategy of this.preferences.fallbackStrategies) {
            switch (strategy) {
                case 'subAgents':
                    if (requirements.subAgents && adapter.supportsFeature('subAgents')) {
                        return 'subAgents';
                    }
                    break;
                
                case 'parallel':
                    if (adapter.supportsFeature('parallelExecution')) {
                        return 'parallel';
                    }
                    break;
                
                case 'streaming':
                    if (requirements.streaming && adapter.supportsFeature('streaming')) {
                        return 'streaming';
                    }
                    break;
                
                case 'sequential':
                    // Always available as fallback
                    return 'sequential';
            }
        }
        
        return 'sequential'; // Ultimate fallback
    }
    
    /**
     * Estimate context size in tokens
     * @private
     */
    _estimateContextSize(context) {
        let size = 0;
        
        // Estimate from files
        if (context.files) {
            // Rough estimate: 500 tokens per file
            size += context.files.length * 500;
        }
        
        // Estimate from text content
        if (context.content) {
            // Rough estimate: 1 token per 4 characters
            size += Math.ceil(context.content.length / 4);
        }
        
        // Estimate from code
        if (context.code) {
            size += Math.ceil(context.code.length / 4);
        }
        
        return size;
    }
    
    /**
     * Group similar tasks for batch routing
     * @private
     */
    _groupSimilarTasks(tasks) {
        const groups = [];
        const processed = new Set();
        
        for (const task of tasks) {
            if (processed.has(task.id)) continue;
            
            const group = [task];
            processed.add(task.id);
            
            // Find similar tasks
            for (const other of tasks) {
                if (processed.has(other.id)) continue;
                
                if (this._areSimilarTasks(task, other)) {
                    group.push(other);
                    processed.add(other.id);
                }
            }
            
            groups.push(group);
        }
        
        return groups;
    }
    
    /**
     * Check if two tasks are similar enough to share routing
     * @private
     */
    _areSimilarTasks(task1, task2) {
        // Same type is required
        if (task1.type !== task2.type) return false;
        
        // Similar context size (within 20%)
        const size1 = this._estimateContextSize(task1.context || {});
        const size2 = this._estimateContextSize(task2.context || {});
        const sizeDiff = Math.abs(size1 - size2) / Math.max(size1, size2);
        if (sizeDiff > 0.2) return false;
        
        // Same vendor extensions
        const ext1 = Object.keys(task1.extensions || {}).sort().join(',');
        const ext2 = Object.keys(task2.extensions || {}).sort().join(',');
        if (ext1 !== ext2) return false;
        
        return true;
    }
    
    /**
     * Generate cache key for a task
     * @private
     */
    _generateCacheKey(task) {
        const requirements = this.analyzeTask(task);
        return JSON.stringify({
            type: task.type,
            features: requirements.features.sort(),
            contextSize: Math.floor(requirements.minContextTokens / 1000), // Round to nearest 1k
            languages: requirements.languages.sort(),
            flags: {
                multiFile: requirements.multiFile,
                streaming: requirements.streaming,
                subAgents: requirements.subAgents
            }
        });
    }
    
    /**
     * Get cached route if valid
     * @private
     */
    _getCachedRoute(key) {
        const cached = this._routingCache.get(key);
        if (!cached) return null;
        
        // Check if cache is still valid
        const age = Date.now() - cached.timestamp.getTime();
        if (age > this._cacheTTL) {
            this._routingCache.delete(key);
            return null;
        }
        
        return cached;
    }
    
    /**
     * Cache a routing decision
     * @private
     */
    _cacheRoute(key, route) {
        this._routingCache.set(key, route);
        
        // Limit cache size
        if (this._routingCache.size > 1000) {
            // Remove oldest entries
            const entries = Array.from(this._routingCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            for (let i = 0; i < 100; i++) {
                this._routingCache.delete(entries[i][0]);
            }
        }
    }
}

module.exports = TaskRouter;