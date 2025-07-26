/**
 * Core Event Adapter
 * 
 * Integrates with existing AIAgentOrchestrator event system to provide
 * AI Orchestration Prediction capabilities through minimal adapter pattern.
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class CoreEventAdapter extends EventEmitter {
    constructor(orchestrator, collector, featureExtractor, options = {}) {
        super();
        
        this.orchestrator = orchestrator;
        this.collector = collector;
        this.featureExtractor = featureExtractor;
        
        // Configuration
        this.options = {
            enabled: true,
            mode: 'shadow', // 'shadow' | 'display' | 'full'
            storage: 'local', // 'local' | 'cloud' | 'hybrid'
            enablePredictions: true,
            enableCostEstimates: true,
            enableAnomalyDetection: false,
            ...options
        };
        
        // Event tracking
        this.activeEvents = new Map();
        this.eventHistory = new Map();
        
        // Metrics
        this.metrics = {
            eventsProcessed: 0,
            eventsDropped: 0,
            avgProcessingTime: 0,
            lastEventTime: null
        };
        
        if (this.options.enabled) {
            this.attachListeners();
        }
        
        this.emit('adapter:initialized', {
            mode: this.options.mode,
            features: this._getEnabledFeatures()
        });
    }
    
    /**
     * Attach event listeners to orchestrator
     */
    attachListeners() {
        // Task lifecycle events
        this.orchestrator.on('taskQueued', this._handleTaskQueued.bind(this));
        this.orchestrator.on('taskAssigned', this._handleTaskAssigned.bind(this));
        this.orchestrator.on('taskCompleted', this._handleTaskCompleted.bind(this));
        this.orchestrator.on('taskFailed', this._handleTaskFailed.bind(this));
        this.orchestrator.on('taskTimeout', this._handleTaskTimeout.bind(this));
        
        // Cost tracking events
        this.orchestrator.on('costUpdate', this._handleCostUpdate.bind(this));
        
        // Quality gate events
        this.orchestrator.on('qualityGateResult', this._handleQualityGate.bind(this));
        
        // Agent lifecycle events
        this.orchestrator.on('agentCreated', this._handleAgentCreated.bind(this));
        
        // Execution events
        this.orchestrator.on('executionStarted', this._handleExecutionStarted.bind(this));
        this.orchestrator.on('executionCompleted', this._handleExecutionCompleted.bind(this));
        
        // Cloud sync events
        this.orchestrator.on('cloud:sync:changes', this._handleCloudSync.bind(this));
        
        this.emit('adapter:listeners-attached', {
            eventTypes: this._getListenedEvents()
        });
    }
    
    /**
     * Detach all event listeners
     */
    detachListeners() {
        this.orchestrator.removeAllListeners();
        this.emit('adapter:listeners-detached');
    }
    
    /**
     * Handle task queued event
     */
    async _handleTaskQueued(data) {
        const startTime = Date.now();
        
        try {
            const complexity = this.featureExtractor ? 
                this.featureExtractor.calculateComplexity(data) : { category: 'unknown' };
            
            const event = await this._createTaskEvent('task_queued', data, {
                queuedAt: new Date(),
                taskComplexity: complexity.category || 'unknown',
                estimatedDuration: this.options.enablePredictions ? 
                    await this._predictDuration(data) : null,
                estimatedCost: this.options.enableCostEstimates ? 
                    await this._estimateCost(data) : null
            });
            
            this.activeEvents.set(data.id, {
                taskId: data.id,
                startTime: new Date(),
                events: [event]
            });
            
            await this._collectEvent(event);
            
            this.emit('event:task-queued', event);
            
        } catch (error) {
            this._handleEventError('taskQueued', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle task assigned event
     */
    async _handleTaskAssigned(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createTaskEvent('task_assigned', data, {
                assignedAt: new Date(),
                agentId: data.agentId,
                agentType: data.agentType,
                assignmentReason: data.reason || 'automatic'
            });
            
            this._updateActiveEvent(data.id, event);
            await this._collectEvent(event);
            
            this.emit('event:task-assigned', event);
            
        } catch (error) {
            this._handleEventError('taskAssigned', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle task completed event
     */
    async _handleTaskCompleted(data) {
        const startTime = Date.now();
        
        try {
            const activeEvent = this.activeEvents.get(data.id);
            const duration = activeEvent ? 
                Date.now() - activeEvent.startTime.getTime() : 0;
            
            const event = await this._createTaskEvent('task_completed', data, {
                completedAt: new Date(),
                duration,
                actualCost: data.cost || null,
                qualityScore: data.qualityScore || null,
                artifactsCount: data.artifacts?.length || 0,
                success: true
            });
            
            // Calculate prediction accuracy if we had predictions
            if (activeEvent?.events?.[0]?.estimatedDuration && duration) {
                event.predictionAccuracy = {
                    durationError: Math.abs(duration - activeEvent.events[0].estimatedDuration) / duration,
                    costError: data.cost && activeEvent.events[0].estimatedCost ? 
                        Math.abs(data.cost - activeEvent.events[0].estimatedCost) / data.cost : null
                };
            }
            
            this._finalizeActiveEvent(data.id, event);
            await this._collectEvent(event);
            
            this.emit('event:task-completed', event);
            
        } catch (error) {
            this._handleEventError('taskCompleted', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle task failed event
     */
    async _handleTaskFailed(data) {
        const startTime = Date.now();
        
        try {
            const activeEvent = this.activeEvents.get(data.id);
            const duration = activeEvent ? 
                Date.now() - activeEvent.startTime.getTime() : 0;
            
            const event = await this._createTaskEvent('task_failed', data, {
                failedAt: new Date(),
                duration,
                error: data.error || 'Unknown error',
                errorType: this._classifyError(data.error),
                retryCount: data.retryCount || 0,
                success: false
            });
            
            this._finalizeActiveEvent(data.id, event);
            await this._collectEvent(event);
            
            this.emit('event:task-failed', event);
            
        } catch (error) {
            this._handleEventError('taskFailed', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle task timeout event
     */
    async _handleTaskTimeout(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createTaskEvent('task_timeout', data, {
                timeoutAt: new Date(),
                timeout: data.timeout || null,
                reason: 'timeout'
            });
            
            this._finalizeActiveEvent(data.id, event);
            await this._collectEvent(event);
            
            this.emit('event:task-timeout', event);
            
        } catch (error) {
            this._handleEventError('taskTimeout', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle cost update event
     */
    async _handleCostUpdate(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createCostEvent('cost_update', data);
            
            await this._collectEvent(event);
            this.emit('event:cost-update', event);
            
        } catch (error) {
            this._handleEventError('costUpdate', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle quality gate result event
     */
    async _handleQualityGate(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createQualityEvent('quality_gate', data);
            
            await this._collectEvent(event);
            this.emit('event:quality-gate', event);
            
        } catch (error) {
            this._handleEventError('qualityGateResult', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle agent created event
     */
    async _handleAgentCreated(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createAgentEvent('agent_created', data);
            
            await this._collectEvent(event);
            this.emit('event:agent-created', event);
            
        } catch (error) {
            this._handleEventError('agentCreated', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle execution started event
     */
    async _handleExecutionStarted(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createExecutionEvent('execution_started', data, {
                startedAt: new Date(),
                sessionName: this.orchestrator.sessionName,
                configSnapshot: this._sanitizeConfig(data.config)
            });
            
            await this._collectEvent(event);
            this.emit('event:execution-started', event);
            
        } catch (error) {
            this._handleEventError('executionStarted', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle execution completed event
     */
    async _handleExecutionCompleted(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createExecutionEvent('execution_completed', data, {
                completedAt: new Date(),
                totalDuration: data.duration || null,
                totalCost: data.totalCost || null,
                tasksCompleted: data.tasksCompleted || 0,
                tasksFailed: data.tasksFailed || 0,
                success: data.success !== false
            });
            
            await this._collectEvent(event);
            this.emit('event:execution-completed', event);
            
        } catch (error) {
            this._handleEventError('executionCompleted', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    /**
     * Handle cloud sync event
     */
    async _handleCloudSync(data) {
        const startTime = Date.now();
        
        try {
            const event = await this._createSyncEvent('cloud_sync', data);
            
            await this._collectEvent(event);
            this.emit('event:cloud-sync', event);
            
        } catch (error) {
            this._handleEventError('cloud:sync:changes', error, data);
        } finally {
            this._updateMetrics(startTime);
        }
    }
    
    // Event creation helpers
    
    async _createTaskEvent(eventType, data, additionalFields = {}) {
        const baseEvent = await this._createBaseEvent(eventType, data);
        
        return {
            ...baseEvent,
            taskId: data.id,
            taskType: data.type,
            taskDescription: this._sanitizeDescription(data.description),
            taskPriority: data.priority || 'normal',
            requiredFeatures: data.requiredFeatures || [],
            contextSize: this._calculateContextSize(data.context),
            ...additionalFields
        };
    }
    
    async _createCostEvent(eventType, data) {
        const baseEvent = await this._createBaseEvent(eventType, data);
        
        return {
            ...baseEvent,
            cost: data.cost || 0,
            tokensUsed: data.tokensUsed || 0,
            model: data.model || 'unknown',
            provider: data.provider || 'unknown',
            operation: data.operation || 'task'
        };
    }
    
    async _createQualityEvent(eventType, data) {
        const baseEvent = await this._createBaseEvent(eventType, data);
        
        return {
            ...baseEvent,
            taskId: data.taskId,
            qualityScore: data.score || 0,
            gateType: data.type || 'unknown',
            passed: data.passed === true,
            criteria: data.criteria || [],
            feedback: this._sanitizeDescription(data.feedback)
        };
    }
    
    async _createAgentEvent(eventType, data) {
        const baseEvent = await this._createBaseEvent(eventType, data);
        
        return {
            ...baseEvent,
            agentId: data.id,
            agentType: data.type || 'worker',
            agentRole: data.role || 'general',
            capabilities: data.capabilities || [],
            maxConcurrency: data.maxConcurrency || 1
        };
    }
    
    async _createExecutionEvent(eventType, data, additionalFields = {}) {
        const baseEvent = await this._createBaseEvent(eventType, data);
        
        return {
            ...baseEvent,
            executionId: data.executionId || this.orchestrator.sessionName,
            ...additionalFields
        };
    }
    
    async _createSyncEvent(eventType, data) {
        const baseEvent = await this._createBaseEvent(eventType, data);
        
        return {
            ...baseEvent,
            syncType: data.type || 'unknown',
            changeCount: data.changes?.length || 0,
            syncDirection: data.direction || 'up',
            success: data.success !== false
        };
    }
    
    async _createBaseEvent(eventType, data) {
        return {
            eventId: uuidv4(),
            eventType,
            orchestrationId: this.orchestrator.sessionName || 'unknown',
            tenantId: await this._hashTenantId(data.tenantId || 'default'),
            timestamp: new Date(),
            source: 'repochief-core',
            version: '1.0.0'
        };
    }
    
    // Helper methods
    
    async _hashTenantId(tenantId) {
        // Hash tenant ID for privacy
        return crypto.createHash('sha256')
            .update(tenantId.toString())
            .digest('hex')
            .substring(0, 16);
    }
    
    _sanitizeDescription(description) {
        if (!description) return '';
        
        // Remove potential PII and limit length
        return description
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
            .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
            .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]')
            .substring(0, 500);
    }
    
    _sanitizeConfig(config) {
        if (!config) return {};
        
        // Remove sensitive configuration data
        const sanitized = { ...config };
        delete sanitized.apiKeys;
        delete sanitized.secrets;
        delete sanitized.credentials;
        
        return sanitized;
    }
    
    _calculateContextSize(context) {
        if (!context) return 0;
        
        let size = 0;
        if (context.files) size += context.files.length;
        if (context.content) size += context.content.length / 1000; // KB
        if (context.requirements) size += context.requirements.length;
        
        return Math.round(size);
    }
    
    _classifyError(error) {
        if (!error) return 'unknown';
        
        const errorStr = error.toString().toLowerCase();
        
        if (errorStr.includes('timeout')) return 'timeout';
        if (errorStr.includes('rate limit')) return 'rate_limit';
        if (errorStr.includes('api key')) return 'auth';
        if (errorStr.includes('network')) return 'network';
        if (errorStr.includes('parse')) return 'parsing';
        
        return 'application';
    }
    
    async _predictDuration(data) {
        // Simple heuristic-based prediction
        // In a real implementation, this would use ML models
        const baseTime = 30000; // 30 seconds
        const complexityMultiplier = this._getComplexityMultiplier(data);
        const contextMultiplier = 1 + (this._calculateContextSize(data.context) * 0.1);
        
        return Math.round(baseTime * complexityMultiplier * contextMultiplier);
    }
    
    async _estimateCost(data) {
        // Simple cost estimation based on complexity and context
        const baseCost = 0.01; // $0.01
        const complexityMultiplier = this._getComplexityMultiplier(data);
        const contextMultiplier = 1 + (this._calculateContextSize(data.context) * 0.05);
        
        return Math.round(baseCost * complexityMultiplier * contextMultiplier * 100) / 100;
    }
    
    _getComplexityMultiplier(data) {
        const description = (data.description || '').toLowerCase();
        
        if (description.includes('complex') || description.includes('system') || 
            description.includes('architecture')) return 3;
        if (description.includes('refactor') || description.includes('optimize')) return 2;
        if (description.includes('fix') || description.includes('bug')) return 1.5;
        
        return 1;
    }
    
    _updateActiveEvent(taskId, event) {
        const activeEvent = this.activeEvents.get(taskId);
        if (activeEvent) {
            activeEvent.events.push(event);
        }
    }
    
    _finalizeActiveEvent(taskId, event) {
        const activeEvent = this.activeEvents.get(taskId);
        if (activeEvent) {
            activeEvent.events.push(event);
            this.eventHistory.set(taskId, activeEvent);
            this.activeEvents.delete(taskId);
        }
    }
    
    async _collectEvent(event) {
        if (this.collector) {
            try {
                await this.collector.collect(event);
            } catch (error) {
                this.emit('adapter:collection-error', { event, error });
                this.metrics.eventsDropped++;
            }
        }
    }
    
    _handleEventError(eventType, error, data) {
        this.emit('adapter:event-error', {
            eventType,
            error: error.message,
            data: data?.id || 'unknown'
        });
        
        this.metrics.eventsDropped++;
    }
    
    _updateMetrics(startTime) {
        this.metrics.eventsProcessed++;
        this.metrics.lastEventTime = new Date();
        
        const processingTime = Date.now() - startTime;
        this.metrics.avgProcessingTime = 
            (this.metrics.avgProcessingTime + processingTime) / 2;
    }
    
    _getEnabledFeatures() {
        return {
            predictions: this.options.enablePredictions,
            costEstimates: this.options.enableCostEstimates,
            anomalyDetection: this.options.enableAnomalyDetection,
            storage: this.options.storage
        };
    }
    
    _getListenedEvents() {
        return [
            'taskQueued', 'taskAssigned', 'taskCompleted', 'taskFailed', 'taskTimeout',
            'costUpdate', 'qualityGateResult', 'agentCreated',
            'executionStarted', 'executionCompleted', 'cloud:sync:changes'
        ];
    }
    
    // Public methods
    
    /**
     * Get adapter metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            activeEvents: this.activeEvents.size,
            historicalEvents: this.eventHistory.size
        };
    }
    
    /**
     * Get configuration
     */
    getConfiguration() {
        return { ...this.options };
    }
    
    /**
     * Update configuration
     */
    updateConfiguration(newOptions) {
        this.options = { ...this.options, ...newOptions };
        
        if (!this.options.enabled && this.orchestrator) {
            this.detachListeners();
        } else if (this.options.enabled && this.orchestrator) {
            this.attachListeners();
        }
        
        this.emit('adapter:configuration-updated', this.options);
    }
    
    /**
     * Get event history for a task
     */
    getTaskHistory(taskId) {
        return this.eventHistory.get(taskId) || null;
    }
    
    /**
     * Get all active events
     */
    getActiveEvents() {
        return Array.from(this.activeEvents.values());
    }
    
    /**
     * Health check
     */
    async healthCheck() {
        return {
            status: 'healthy',
            lastEventTime: this.metrics.lastEventTime,
            eventsProcessed: this.metrics.eventsProcessed,
            eventsDropped: this.metrics.eventsDropped,
            processingTime: this.metrics.avgProcessingTime
        };
    }
}

module.exports = CoreEventAdapter;