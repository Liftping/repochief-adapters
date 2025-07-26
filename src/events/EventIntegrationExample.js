/**
 * Event Integration Example
 * 
 * Demonstrates how to integrate the CoreEventAdapter with existing
 * AIAgentOrchestrator and prediction systems.
 */

const { EventEmitter } = require('events');
const CoreEventAdapter = require('./CoreEventAdapter');
const DataCollector = require('../../collectors/DataCollector');
const FeatureExtractor = require('../../features/FeatureExtractor');

/**
 * Mock AIAgentOrchestrator for demonstration
 */
class MockAIAgentOrchestrator extends EventEmitter {
    constructor() {
        super();
        this.sessionName = `session_${Date.now()}`;
        this.tasks = new Map();
        this.agents = new Map();
        this.totalCost = 0;
    }
    
    async executeTask(task) {
        // Simulate task execution with events
        
        // 1. Task queued
        this.emit('taskQueued', {
            id: task.id,
            type: task.type,
            description: task.description,
            context: task.context,
            requiredFeatures: task.requiredFeatures,
            tenantId: task.tenantId || 'default',
            priority: task.priority || 'normal'
        });
        
        // 2. Agent creation (if needed)
        const agentId = `agent_${Date.now()}`;
        this.emit('agentCreated', {
            id: agentId,
            type: 'worker',
            role: 'developer',
            capabilities: ['generation', 'analysis'],
            maxConcurrency: 1
        });
        
        // 3. Task assignment
        await this._delay(100);
        this.emit('taskAssigned', {
            id: task.id,
            agentId,
            agentType: 'worker',
            reason: 'automatic'
        });
        
        // 4. Execution started
        this.emit('executionStarted', {
            executionId: this.sessionName,
            config: { mode: 'standard', timeout: 60000 }
        });
        
        // 5. Cost updates during execution
        await this._delay(500);
        const interimCost = 0.05;
        this.totalCost += interimCost;
        this.emit('costUpdate', {
            cost: interimCost,
            tokensUsed: 1000,
            model: 'claude-3.5-sonnet',
            provider: 'anthropic',
            operation: 'generation'
        });
        
        // 6. Quality gate check
        await this._delay(300);
        this.emit('qualityGateResult', {
            taskId: task.id,
            type: 'code_quality',
            score: 0.85,
            passed: true,
            criteria: ['syntax', 'style', 'complexity'],
            feedback: 'Code quality meets standards'
        });
        
        // 7. Task completion (success or failure based on simulation)
        await this._delay(1000);
        const success = Math.random() > 0.1; // 90% success rate
        
        if (success) {
            const finalCost = 0.03;
            this.totalCost += finalCost;
            
            this.emit('costUpdate', {
                cost: finalCost,
                tokensUsed: 500,
                model: 'claude-3.5-sonnet',
                provider: 'anthropic',
                operation: 'completion'
            });
            
            this.emit('taskCompleted', {
                id: task.id,
                cost: this.totalCost,
                qualityScore: 0.85,
                artifacts: ['src/component.js', 'tests/component.test.js'],
                success: true
            });
        } else {
            this.emit('taskFailed', {
                id: task.id,
                error: 'Simulated execution failure',
                retryCount: 0
            });
        }
        
        // 8. Execution completed
        this.emit('executionCompleted', {
            duration: 2000,
            totalCost: this.totalCost,
            tasksCompleted: success ? 1 : 0,
            tasksFailed: success ? 0 : 1,
            success
        });
        
        // 9. Cloud sync (optional)
        if (Math.random() > 0.5) { // 50% chance of sync
            await this._delay(200);
            this.emit('cloud:sync:changes', {
                type: 'project_sync',
                changes: ['task_completed', 'metrics_updated'],
                direction: 'up',
                success: true
            });
        }
        
        return {
            success,
            cost: this.totalCost,
            duration: 2000,
            artifacts: success ? ['src/component.js', 'tests/component.test.js'] : []
        };
    }
    
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Integration example demonstrating full workflow
 */
class EventIntegrationExample {
    constructor() {
        this.orchestrator = new MockAIAgentOrchestrator();
        this.collector = new DataCollector({
            storage: 'local',
            batchSize: 10,
            flushInterval: 2000
        });
        this.featureExtractor = new FeatureExtractor({
            enableComplexityAnalysis: true,
            enableContextAnalysis: true,
            enablePatternMatching: true,
            enableCostPrediction: true
        });
        
        this.adapter = new CoreEventAdapter(
            this.orchestrator,
            this.collector,
            this.featureExtractor,
            {
                enabled: true,
                mode: 'display',
                storage: 'local',
                enablePredictions: true,
                enableCostEstimates: true
            }
        );
        
        this._setupEventListeners();
    }
    
    _setupEventListeners() {
        // Adapter events
        this.adapter.on('adapter:initialized', (data) => {
            console.log('🔌 Adapter initialized:', data);
        });
        
        this.adapter.on('event:task-queued', (event) => {
            console.log('📋 Task queued:', {
                id: event.taskId,
                type: event.taskType,
                complexity: event.taskComplexity,
                estimated: {
                    duration: event.estimatedDuration,
                    cost: event.estimatedCost
                }
            });
        });
        
        this.adapter.on('event:task-completed', (event) => {
            console.log('✅ Task completed:', {
                id: event.taskId,
                duration: event.duration,
                cost: event.actualCost,
                accuracy: event.predictionAccuracy
            });
        });
        
        this.adapter.on('event:task-failed', (event) => {
            console.log('❌ Task failed:', {
                id: event.taskId,
                error: event.error,
                duration: event.duration
            });
        });
        
        this.adapter.on('event:cost-update', (event) => {
            console.log('💰 Cost update:', {
                cost: event.cost,
                tokens: event.tokensUsed,
                model: event.model
            });
        });
        
        // Collector events
        this.collector.on('batch:flushed', (data) => {
            console.log('💾 Batch stored:', data);
        });
        
        this.collector.on('collector:error', (data) => {
            console.error('🚨 Collection error:', data);
        });
    }
    
    /**
     * Run a demonstration workflow
     */
    async runDemo() {
        console.log('🚀 Starting Event Integration Demo\n');
        
        // Create sample tasks
        const tasks = [
            {
                id: 'task_1',
                type: 'generation',
                description: 'Create a complex authentication system with JWT tokens',
                context: {
                    files: ['src/auth/', 'src/models/', 'src/routes/'],
                    requirements: ['JWT tokens', 'password hashing', 'session management'],
                    content: 'User authentication system requirements...'
                },
                requiredFeatures: ['generation', 'testing'],
                complexity: 'high',
                tenantId: 'demo_tenant'
            },
            {
                id: 'task_2',
                type: 'analysis',
                description: 'Analyze code quality for UI components',
                context: {
                    files: ['src/components/Button.jsx', 'src/components/Form.jsx'],
                    requirements: ['code quality', 'best practices']
                },
                requiredFeatures: ['analysis'],
                priority: 'high',
                tenantId: 'demo_tenant'
            },
            {
                id: 'task_3',
                type: 'refactoring',
                description: 'Simple bug fix in utility function',
                context: {
                    files: ['src/utils/helpers.js'],
                    requirements: ['fix null pointer']
                },
                requiredFeatures: ['generation'],
                complexity: 'simple',
                tenantId: 'demo_tenant'
            }
        ];
        
        // Execute tasks sequentially
        for (const task of tasks) {
            console.log(`\n📝 Executing task: ${task.id}`);
            console.log(`   Type: ${task.type}`);
            console.log(`   Complexity: ${task.complexity || 'auto'}`);
            
            try {
                const result = await this.orchestrator.executeTask(task);
                
                // Learn from the result
                this.featureExtractor.learn(task, result);
                
                console.log(`   Result: ${result.success ? 'Success' : 'Failed'}`);
                console.log(`   Duration: ${result.duration}ms`);
                console.log(`   Cost: $${result.cost}`);
                
                // Wait between tasks
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`   Error: ${error.message}`);
            }
        }
        
        // Wait for final batch flush
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Show final statistics
        await this.showStatistics();
    }
    
    /**
     * Show system statistics
     */
    async showStatistics() {
        console.log('\n📊 Final Statistics:');
        
        // Adapter metrics
        const adapterMetrics = this.adapter.getMetrics();
        console.log('   Adapter:', {
            eventsProcessed: adapterMetrics.eventsProcessed,
            eventsDropped: adapterMetrics.eventsDropped,
            activeEvents: adapterMetrics.activeEvents,
            avgProcessingTime: `${adapterMetrics.avgProcessingTime}ms`
        });
        
        // Collector metrics
        const collectorMetrics = await this.collector.getMetrics();
        console.log('   Collector:', {
            collected: collectorMetrics.collected,
            stored: collectorMetrics.stored,
            batches: collectorMetrics.batches,
            avgBatchSize: Math.round(collectorMetrics.avgBatchSize)
        });
        
        // Feature extractor statistics
        const extractorStats = this.featureExtractor.getStatistics();
        console.log('   Feature Extractor:', extractorStats);
        
        // Query some events
        try {
            const events = await this.collector.query({
                eventType: 'task_completed',
                startTime: new Date(Date.now() - 60000) // Last minute
            });
            console.log(`   Completed tasks: ${events.length}`);
        } catch (error) {
            console.log('   Query not available for current storage');
        }
    }
    
    /**
     * Demonstrate prediction capabilities
     */
    async demonstratePredictions() {
        console.log('\n🔮 Prediction Demo:');
        
        const newTask = {
            id: 'prediction_test',
            type: 'generation',
            description: 'Create authentication system with OAuth integration',
            context: {
                files: ['src/auth/', 'src/oauth/'],
                requirements: ['OAuth2', 'JWT', 'user profiles']
            },
            requiredFeatures: ['generation', 'integration']
        };
        
        const prediction = this.featureExtractor.predict(newTask);
        console.log('   Prediction:', {
            duration: `${prediction.duration}ms`,
            cost: `$${prediction.cost}`,
            successProbability: `${Math.round(prediction.successProbability * 100)}%`,
            confidence: `${Math.round(prediction.confidence * 100)}%`,
            basedOnTasks: prediction.basedOnSimilarTasks
        });
        
        const similarTasks = this.featureExtractor.findSimilarTasks(newTask, 3);
        console.log('   Similar tasks:', similarTasks.length);
        for (const similar of similarTasks) {
            console.log(`     - ${similar.taskId}: ${Math.round(similar.similarity * 100)}% similar`);
        }
    }
    
    /**
     * Clean up resources
     */
    async cleanup() {
        console.log('\n🧹 Cleaning up...');
        
        await this.collector.stop();
        this.adapter.detachListeners();
        
        console.log('   Cleanup complete');
    }
}

// Export for use in other modules
module.exports = EventIntegrationExample;

// Run demo if this file is executed directly
if (require.main === module) {
    (async () => {
        const demo = new EventIntegrationExample();
        
        try {
            await demo.runDemo();
            await demo.demonstratePredictions();
        } catch (error) {
            console.error('Demo error:', error);
        } finally {
            await demo.cleanup();
        }
    })();
}