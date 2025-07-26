/**
 * Orchestration Strategy
 * 
 * Implements graceful degradation mechanisms for task execution,
 * automatically falling back to simpler strategies when advanced
 * features are unavailable.
 */

const { EventEmitter } = require('events');

class OrchestrationStrategy extends EventEmitter {
    constructor(adapter) {
        super();
        this.adapter = adapter;
        
        // Default fallback chain
        this.defaultStrategies = [
            'subAgents',
            'parallel',
            'streaming',
            'batched',
            'sequential'
        ];
        
        // Strategy execution stats
        this.strategyStats = new Map();
        
        // Strategy timeout configurations
        this.timeouts = {
            subAgents: 300000,    // 5 minutes
            parallel: 180000,     // 3 minutes
            streaming: 120000,    // 2 minutes
            batched: 90000,       // 1.5 minutes
            sequential: 60000     // 1 minute
        };
    }
    
    /**
     * Execute task with automatic fallback
     * @param {Object} task - Task to execute
     * @param {Object} options - Execution options
     * @returns {Object} Execution result
     */
    async execute(task, options = {}) {
        const strategies = options.strategies || this.defaultStrategies;
        const startTime = Date.now();
        const attempts = [];
        
        // Check for explicit strategy in task
        const explicitStrategy = this._getExplicitStrategy(task);
        if (explicitStrategy) {
            try {
                const result = await this._executeStrategy(explicitStrategy, task, options);
                this._recordSuccess(explicitStrategy, Date.now() - startTime);
                return result;
            } catch (error) {
                this._recordFailure(explicitStrategy, error);
                // Continue with fallback strategies
            }
        }
        
        // Try each strategy in order
        for (const strategy of strategies) {
            const strategyStart = Date.now();
            
            try {
                // Check if strategy is available
                if (!this._isStrategyAvailable(strategy)) {
                    attempts.push({
                        strategy,
                        status: 'skipped',
                        reason: 'Not available',
                        duration: 0
                    });
                    continue;
                }
                
                // Check if strategy is suitable for task
                if (!this._isStrategySuitable(strategy, task)) {
                    attempts.push({
                        strategy,
                        status: 'skipped',
                        reason: 'Not suitable for task',
                        duration: 0
                    });
                    continue;
                }
                
                // Execute with timeout
                const timeout = options.timeout || this.timeouts[strategy];
                const result = await this._executeWithTimeout(
                    this._executeStrategy(strategy, task, options),
                    timeout
                );
                
                // Record success
                const duration = Date.now() - strategyStart;
                this._recordSuccess(strategy, duration);
                
                attempts.push({
                    strategy,
                    status: 'success',
                    duration
                });
                
                // Emit success event
                this.emit('strategy:success', {
                    taskId: task.id,
                    strategy,
                    duration,
                    attempts
                });
                
                return {
                    ...result,
                    strategy,
                    attempts,
                    totalDuration: Date.now() - startTime
                };
                
            } catch (error) {
                const duration = Date.now() - strategyStart;
                this._recordFailure(strategy, error);
                
                attempts.push({
                    strategy,
                    status: 'failed',
                    error: error.message,
                    duration
                });
                
                // Emit failure event
                this.emit('strategy:failed', {
                    taskId: task.id,
                    strategy,
                    error: error.message,
                    duration
                });
                
                // Log the failure
                console.warn(`Strategy ${strategy} failed: ${error.message}`);
                
                // Continue to next strategy
                continue;
            }
        }
        
        // All strategies failed
        const totalDuration = Date.now() - startTime;
        const error = new Error('All execution strategies failed');
        error.attempts = attempts;
        error.duration = totalDuration;
        
        this.emit('strategy:exhausted', {
            taskId: task.id,
            attempts,
            duration: totalDuration
        });
        
        throw error;
    }
    
    /**
     * Execute a specific strategy
     * @private
     */
    async _executeStrategy(strategy, task, options) {
        switch (strategy) {
            case 'subAgents':
                return await this._executeWithSubAgents(task, options);
            
            case 'parallel':
                return await this._executeInParallel(task, options);
            
            case 'streaming':
                return await this._executeWithStreaming(task, options);
            
            case 'batched':
                return await this._executeInBatches(task, options);
            
            case 'sequential':
            default:
                return await this._executeSequentially(task, options);
        }
    }
    
    /**
     * Execute with sub-agents (if available)
     * @private
     */
    async _executeWithSubAgents(task, options) {
        if (!this.adapter.supportsFeature('subAgents')) {
            throw new Error('Sub-agents not supported');
        }
        
        // Get sub-agent configuration
        const config = this.adapter.getFeatureConfig('subAgents') || {};
        const maxConcurrent = config.maxConcurrent || 3;
        
        // Decompose task into subtasks
        const subtasks = this._decomposeForSubAgents(task, maxConcurrent);
        
        // Create sub-agent execution plan
        const plan = {
            orchestrationMode: options.orchestrationMode || 'parallel',
            subtasks,
            coordinator: {
                role: 'orchestrator',
                responsibilities: ['task-decomposition', 'result-aggregation']
            },
            agents: subtasks.map((st, i) => ({
                id: `agent-${i}`,
                role: st.role || 'worker',
                task: st
            }))
        };
        
        // Execute via adapter's sub-agent mechanism
        if (this.adapter.executeWithSubAgents) {
            return await this.adapter.executeWithSubAgents(plan);
        }
        
        // Fallback implementation
        throw new Error('Sub-agent execution not implemented');
    }
    
    /**
     * Execute tasks in parallel
     * @private
     */
    async _executeInParallel(task, options) {
        if (!this.adapter.supportsFeature('parallelExecution')) {
            throw new Error('Parallel execution not supported');
        }
        
        // Decompose task for parallel execution
        const parallelTasks = this._decomposeForParallel(task);
        
        if (parallelTasks.length <= 1) {
            // Not worth parallelizing
            return await this._executeSequentially(task, options);
        }
        
        // Get parallel configuration
        const config = this.adapter.getFeatureConfig('parallelExecution') || {};
        const maxConcurrent = config.maxConcurrent || 5;
        
        // Execute in batches if needed
        const results = [];
        for (let i = 0; i < parallelTasks.length; i += maxConcurrent) {
            const batch = parallelTasks.slice(i, i + maxConcurrent);
            const batchPromises = batch.map(t => 
                this.adapter.executeTask(t).catch(err => ({
                    error: err.message,
                    task: t
                }))
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        
        // Aggregate results
        return this._aggregateParallelResults(results, task);
    }
    
    /**
     * Execute with streaming
     * @private
     */
    async _executeWithStreaming(task, options) {
        if (!this.adapter.supportsFeature('streaming')) {
            throw new Error('Streaming not supported');
        }
        
        // Prepare for streaming execution
        const streamConfig = {
            ...task,
            streaming: true,
            onChunk: options.onChunk || this._defaultChunkHandler.bind(this)
        };
        
        if (this.adapter.executeWithStreaming) {
            return await this.adapter.executeWithStreaming(streamConfig);
        }
        
        // Fallback to regular execution with simulated streaming
        const result = await this.adapter.executeTask(task);
        
        // Simulate streaming by chunking the output
        if (result.output && options.onChunk) {
            const chunkSize = 1000;
            for (let i = 0; i < result.output.length; i += chunkSize) {
                await options.onChunk({
                    chunk: result.output.slice(i, i + chunkSize),
                    progress: i / result.output.length
                });
            }
        }
        
        return result;
    }
    
    /**
     * Execute in batches
     * @private
     */
    async _executeInBatches(task, options) {
        // Useful for tasks with large contexts
        const batchSize = options.batchSize || 5;
        
        // Check if task can be batched
        if (!task.context?.files || task.context.files.length <= batchSize) {
            return await this._executeSequentially(task, options);
        }
        
        // Split into batches
        const batches = [];
        for (let i = 0; i < task.context.files.length; i += batchSize) {
            batches.push({
                ...task,
                id: `${task.id}-batch-${i}`,
                context: {
                    ...task.context,
                    files: task.context.files.slice(i, i + batchSize)
                }
            });
        }
        
        // Execute batches
        const results = [];
        for (const batch of batches) {
            const result = await this.adapter.executeTask(batch);
            results.push(result);
            
            // Emit progress
            this.emit('batch:completed', {
                taskId: task.id,
                batchId: batch.id,
                progress: results.length / batches.length
            });
        }
        
        // Aggregate batch results
        return this._aggregateBatchResults(results, task);
    }
    
    /**
     * Execute sequentially (fallback)
     * @private
     */
    async _executeSequentially(task, options) {
        // Most basic execution - always available
        return await this.adapter.executeTask(task);
    }
    
    /**
     * Check if strategy is available
     * @private
     */
    _isStrategyAvailable(strategy) {
        switch (strategy) {
            case 'subAgents':
                return this.adapter.supportsFeature('subAgents');
            
            case 'parallel':
                return this.adapter.supportsFeature('parallelExecution');
            
            case 'streaming':
                return this.adapter.supportsFeature('streaming');
            
            case 'batched':
                return true; // Always available
            
            case 'sequential':
                return true; // Always available
            
            default:
                return false;
        }
    }
    
    /**
     * Check if strategy is suitable for task
     * @private
     */
    _isStrategySuitable(strategy, task) {
        switch (strategy) {
            case 'subAgents':
                // Good for complex, decomposable tasks
                return task.complexity === 'high' || 
                       task.description.length > 500 ||
                       (task.context?.files?.length || 0) > 5;
            
            case 'parallel':
                // Good for multi-file or independent operations
                return (task.context?.files?.length || 0) > 2 ||
                       task.type === 'validation' ||
                       task.type === 'testing';
            
            case 'streaming':
                // Good for large outputs or real-time feedback
                return task.type === 'generation' ||
                       task.streaming === true ||
                       task.description.includes('stream');
            
            case 'batched':
                // Good for many files or large contexts
                return (task.context?.files?.length || 0) > 10;
            
            case 'sequential':
                // Always suitable as fallback
                return true;
            
            default:
                return false;
        }
    }
    
    /**
     * Get explicit strategy from task
     * @private
     */
    _getExplicitStrategy(task) {
        // Check vendor extensions
        const vendorExt = task.extensions?.[this.adapter.name];
        if (vendorExt?.executionStrategy) {
            return vendorExt.executionStrategy;
        }
        
        // Check task metadata
        if (task.executionStrategy) {
            return task.executionStrategy;
        }
        
        return null;
    }
    
    /**
     * Execute with timeout
     * @private
     */
    async _executeWithTimeout(promise, timeout) {
        return Promise.race([
            promise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Strategy timeout')), timeout)
            )
        ]);
    }
    
    /**
     * Decompose task for sub-agents
     * @private
     */
    _decomposeForSubAgents(task, maxAgents) {
        const subtasks = [];
        
        // Simple decomposition by task type
        switch (task.type) {
            case 'generation':
                subtasks.push(
                    { ...task, role: 'architect', focus: 'design' },
                    { ...task, role: 'implementer', focus: 'code' },
                    { ...task, role: 'reviewer', focus: 'quality' }
                );
                break;
            
            case 'refactoring':
                subtasks.push(
                    { ...task, role: 'analyzer', focus: 'current-state' },
                    { ...task, role: 'refactorer', focus: 'improvements' },
                    { ...task, role: 'validator', focus: 'correctness' }
                );
                break;
            
            default:
                // Generic decomposition by files
                if (task.context?.files?.length > 1) {
                    const filesPerAgent = Math.ceil(task.context.files.length / maxAgents);
                    for (let i = 0; i < task.context.files.length; i += filesPerAgent) {
                        subtasks.push({
                            ...task,
                            id: `${task.id}-sub-${i}`,
                            context: {
                                ...task.context,
                                files: task.context.files.slice(i, i + filesPerAgent)
                            }
                        });
                    }
                } else {
                    subtasks.push(task);
                }
        }
        
        return subtasks.slice(0, maxAgents);
    }
    
    /**
     * Decompose task for parallel execution
     * @private
     */
    _decomposeForParallel(task) {
        // If task has multiple files, split by file
        if (task.context?.files?.length > 1) {
            return task.context.files.map((file, i) => ({
                ...task,
                id: `${task.id}-parallel-${i}`,
                context: {
                    ...task.context,
                    files: [file]
                }
            }));
        }
        
        // Otherwise, can't parallelize
        return [task];
    }
    
    /**
     * Aggregate parallel results
     * @private
     */
    _aggregateParallelResults(results, originalTask) {
        const successful = results.filter(r => !r.error);
        const failed = results.filter(r => r.error);
        
        if (successful.length === 0) {
            throw new Error('All parallel tasks failed');
        }
        
        // Merge outputs
        const output = successful.map(r => r.output).join('\n---\n');
        const artifacts = successful.flatMap(r => r.artifacts || []);
        
        return {
            taskId: originalTask.id,
            status: failed.length > 0 ? 'partial' : 'completed',
            output,
            artifacts,
            parallelResults: {
                successful: successful.length,
                failed: failed.length,
                failures: failed.map(f => ({ task: f.task.id, error: f.error }))
            }
        };
    }
    
    /**
     * Aggregate batch results
     * @private
     */
    _aggregateBatchResults(results, originalTask) {
        return {
            taskId: originalTask.id,
            status: 'completed',
            output: results.map(r => r.output).join('\n---\n'),
            artifacts: results.flatMap(r => r.artifacts || []),
            batchCount: results.length
        };
    }
    
    /**
     * Default chunk handler for streaming
     * @private
     */
    _defaultChunkHandler(data) {
        this.emit('stream:chunk', data);
    }
    
    /**
     * Record strategy success
     * @private
     */
    _recordSuccess(strategy, duration) {
        if (!this.strategyStats.has(strategy)) {
            this.strategyStats.set(strategy, {
                attempts: 0,
                successes: 0,
                failures: 0,
                totalDuration: 0
            });
        }
        
        const stats = this.strategyStats.get(strategy);
        stats.attempts++;
        stats.successes++;
        stats.totalDuration += duration;
    }
    
    /**
     * Record strategy failure
     * @private
     */
    _recordFailure(strategy, error) {
        if (!this.strategyStats.has(strategy)) {
            this.strategyStats.set(strategy, {
                attempts: 0,
                successes: 0,
                failures: 0,
                totalDuration: 0
            });
        }
        
        const stats = this.strategyStats.get(strategy);
        stats.attempts++;
        stats.failures++;
        
        // Track failure reasons
        if (!stats.failureReasons) {
            stats.failureReasons = new Map();
        }
        const reason = error.message;
        stats.failureReasons.set(reason, (stats.failureReasons.get(reason) || 0) + 1);
    }
    
    /**
     * Get strategy statistics
     */
    getStatistics() {
        const stats = {};
        
        for (const [strategy, data] of this.strategyStats) {
            stats[strategy] = {
                ...data,
                successRate: data.attempts > 0 ? data.successes / data.attempts : 0,
                avgDuration: data.successes > 0 ? data.totalDuration / data.successes : 0
            };
            
            if (data.failureReasons) {
                stats[strategy].topFailureReasons = Array.from(data.failureReasons.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([reason, count]) => ({ reason, count }));
            }
        }
        
        return stats;
    }
    
    /**
     * Reset statistics
     */
    resetStatistics() {
        this.strategyStats.clear();
        this.emit('statistics:reset');
    }
}

module.exports = OrchestrationStrategy;