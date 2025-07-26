/**
 * Core Event Adapter Tests
 * 
 * Tests for AI Orchestration Prediction event integration
 * with existing AIAgentOrchestrator systems.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { EventEmitter } = require('events');
const CoreEventAdapter = require('../../src/adapters/events/CoreEventAdapter');
const DataCollector = require('../../src/collectors/DataCollector');
const FeatureExtractor = require('../../src/features/FeatureExtractor');

describe('Core Event Adapter', () => {
    let sandbox;
    let mockOrchestrator;
    let mockCollector;
    let mockFeatureExtractor;
    let adapter;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Mock orchestrator
        mockOrchestrator = new EventEmitter();
        mockOrchestrator.sessionName = 'test-session';
        
        // Mock collector
        mockCollector = {
            collect: sandbox.stub().resolves(),
            getMetrics: sandbox.stub().resolves({ collected: 0, stored: 0 }),
            stop: sandbox.stub().resolves()
        };
        
        // Mock feature extractor
        mockFeatureExtractor = {
            calculateComplexity: sandbox.stub().returns({
                category: 'moderate',
                score: 2.5,
                factors: {},
                confidence: 0.8
            }),
            extractFeatures: sandbox.stub().returns({}),
            predict: sandbox.stub().returns({
                duration: 30000,
                cost: 0.15,
                confidence: 0.7
            })
        };
        
        adapter = new CoreEventAdapter(
            mockOrchestrator,
            mockCollector,
            mockFeatureExtractor,
            {
                enabled: true,
                mode: 'shadow',
                enablePredictions: true,
                enableCostEstimates: true
            }
        );
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    describe('Initialization', () => {
        it('should initialize with default options', () => {
            const defaultAdapter = new CoreEventAdapter(
                mockOrchestrator,
                mockCollector,
                mockFeatureExtractor
            );
            
            expect(defaultAdapter.options.enabled).to.be.true;
            expect(defaultAdapter.options.mode).to.equal('shadow');
            expect(defaultAdapter.options.storage).to.equal('local');
        });
        
        it('should emit initialization event', (done) => {
            const newOrchestrator = new EventEmitter();
            newOrchestrator.sessionName = 'init-test';
            
            const newAdapter = new CoreEventAdapter(
                newOrchestrator,
                mockCollector,
                mockFeatureExtractor
            );
            
            newAdapter.on('adapter:initialized', (data) => {
                expect(data.mode).to.equal('shadow');
                expect(data.features).to.be.an('object');
                done();
            });
        });
        
        it('should attach listeners when enabled', () => {
            expect(mockOrchestrator.listenerCount('taskQueued')).to.equal(1);
            expect(mockOrchestrator.listenerCount('taskCompleted')).to.equal(1);
            expect(mockOrchestrator.listenerCount('costUpdate')).to.equal(1);
        });
        
        it('should not attach listeners when disabled', () => {
            const disabledAdapter = new CoreEventAdapter(
                new EventEmitter(),
                mockCollector,
                mockFeatureExtractor,
                { enabled: false }
            );
            
            expect(disabledAdapter.options.enabled).to.be.false;
        });
    });
    
    describe('Task Event Handling', () => {
        it('should handle taskQueued event', async () => {
            const taskData = {
                id: 'task-123',
                type: 'generation',
                description: 'Test task',
                context: { files: ['test.js'] },
                tenantId: 'tenant-1'
            };
            
            mockOrchestrator.emit('taskQueued', taskData);
            
            // Wait for async processing
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('task_queued');
            expect(collectedEvent.taskId).to.equal('task-123');
            expect(collectedEvent.taskType).to.equal('generation');
            expect(collectedEvent.orchestrationId).to.equal('test-session');
        });
        
        it('should handle taskAssigned event', async () => {
            const assignData = {
                id: 'task-123',
                agentId: 'agent-456',
                agentType: 'worker',
                reason: 'automatic'
            };
            
            mockOrchestrator.emit('taskAssigned', assignData);
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('task_assigned');
            expect(collectedEvent.agentId).to.equal('agent-456');
            expect(collectedEvent.assignmentReason).to.equal('automatic');
        });
        
        it('should handle taskCompleted event with prediction accuracy', async () => {
            // First queue a task to create active event
            const taskData = {
                id: 'task-123',
                type: 'generation',
                description: 'Test task'
            };
            
            mockOrchestrator.emit('taskQueued', taskData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Reset collector for completion event
            mockCollector.collect.resetHistory();
            
            // Complete the task
            const completionData = {
                id: 'task-123',
                cost: 0.12,
                qualityScore: 0.85,
                artifacts: ['output.js']
            };
            
            mockOrchestrator.emit('taskCompleted', completionData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('task_completed');
            expect(collectedEvent.actualCost).to.equal(0.12);
            expect(collectedEvent.success).to.be.true;
            expect(collectedEvent.predictionAccuracy).to.exist;
        });
        
        it('should handle taskFailed event', async () => {
            const failData = {
                id: 'task-123',
                error: 'Network timeout',
                retryCount: 1
            };
            
            mockOrchestrator.emit('taskFailed', failData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('task_failed');
            expect(collectedEvent.error).to.equal('Network timeout');
            expect(collectedEvent.errorType).to.equal('network');
            expect(collectedEvent.success).to.be.false;
        });
        
        it('should handle taskTimeout event', async () => {
            const timeoutData = {
                id: 'task-123',
                timeout: 60000
            };
            
            mockOrchestrator.emit('taskTimeout', timeoutData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('task_timeout');
            expect(collectedEvent.reason).to.equal('timeout');
        });
    });
    
    describe('Cost Event Handling', () => {
        it('should handle costUpdate events', async () => {
            const costData = {
                cost: 0.05,
                tokensUsed: 1000,
                model: 'claude-3.5-sonnet',
                provider: 'anthropic',
                operation: 'generation'
            };
            
            mockOrchestrator.emit('costUpdate', costData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('cost_update');
            expect(collectedEvent.cost).to.equal(0.05);
            expect(collectedEvent.tokensUsed).to.equal(1000);
            expect(collectedEvent.model).to.equal('claude-3.5-sonnet');
        });
    });
    
    describe('Quality Gate Event Handling', () => {
        it('should handle qualityGateResult events', async () => {
            const qualityData = {
                taskId: 'task-123',
                type: 'code_quality',
                score: 0.85,
                passed: true,
                criteria: ['syntax', 'style'],
                feedback: 'Good quality'
            };
            
            mockOrchestrator.emit('qualityGateResult', qualityData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('quality_gate');
            expect(collectedEvent.qualityScore).to.equal(0.85);
            expect(collectedEvent.passed).to.be.true;
        });
    });
    
    describe('Execution Event Handling', () => {
        it('should handle executionStarted events', async () => {
            const execData = {
                executionId: 'exec-456',
                config: { mode: 'standard', timeout: 60000 }
            };
            
            mockOrchestrator.emit('executionStarted', execData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('execution_started');
            expect(collectedEvent.sessionName).to.equal('test-session');
        });
        
        it('should handle executionCompleted events', async () => {
            const execData = {
                duration: 5000,
                totalCost: 0.25,
                tasksCompleted: 3,
                tasksFailed: 1,
                success: true
            };
            
            mockOrchestrator.emit('executionCompleted', execData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockCollector.collect).to.have.been.calledOnce;
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            
            expect(collectedEvent.eventType).to.equal('execution_completed');
            expect(collectedEvent.totalDuration).to.equal(5000);
            expect(collectedEvent.success).to.be.true;
        });
    });
    
    describe('Prediction Integration', () => {
        it('should include predictions when enabled', async () => {
            const taskData = {
                id: 'task-123',
                type: 'generation',
                description: 'Complex authentication system'
            };
            
            mockOrchestrator.emit('taskQueued', taskData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(mockFeatureExtractor.calculateComplexity).to.have.been.calledWith(taskData);
            
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            expect(collectedEvent.estimatedDuration).to.exist;
            expect(collectedEvent.estimatedCost).to.exist;
        });
        
        it('should skip predictions when disabled', async () => {
            const noPredictAdapter = new CoreEventAdapter(
                mockOrchestrator,
                mockCollector,
                mockFeatureExtractor,
                { enablePredictions: false, enableCostEstimates: false }
            );
            
            const taskData = { id: 'task-123', type: 'generation' };
            
            mockOrchestrator.emit('taskQueued', taskData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            expect(collectedEvent.estimatedDuration).to.be.null;
            expect(collectedEvent.estimatedCost).to.be.null;
        });
    });
    
    describe('Error Handling', () => {
        it('should handle collection errors gracefully', async () => {
            mockCollector.collect.rejects(new Error('Storage failure'));
            
            let errorEvent = null;
            adapter.on('adapter:collection-error', (data) => {
                errorEvent = data;
            });
            
            const taskData = { id: 'task-123', type: 'generation' };
            mockOrchestrator.emit('taskQueued', taskData);
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(errorEvent).to.exist;
            expect(errorEvent.error).to.exist;
        });
        
        it('should handle feature extraction errors', async () => {
            mockFeatureExtractor.calculateComplexity.throws(new Error('Feature error'));
            
            let errorEvent = null;
            adapter.on('adapter:event-error', (data) => {
                errorEvent = data;
            });
            
            const taskData = { id: 'task-123', type: 'generation' };
            mockOrchestrator.emit('taskQueued', taskData);
            
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(errorEvent).to.exist;
            expect(errorEvent.eventType).to.equal('taskQueued');
        });
    });
    
    describe('Data Sanitization', () => {
        it('should sanitize sensitive data in descriptions', async () => {
            const taskData = {
                id: 'task-123',
                type: 'generation',
                description: 'Create user with email john@example.com and SSN 123-45-6789'
            };
            
            mockOrchestrator.emit('taskQueued', taskData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            expect(collectedEvent.taskDescription).to.not.include('john@example.com');
            expect(collectedEvent.taskDescription).to.not.include('123-45-6789');
            expect(collectedEvent.taskDescription).to.include('[EMAIL]');
            expect(collectedEvent.taskDescription).to.include('[SSN]');
        });
        
        it('should hash tenant IDs for privacy', async () => {
            const taskData = {
                id: 'task-123',
                tenantId: 'sensitive-tenant-id'
            };
            
            mockOrchestrator.emit('taskQueued', taskData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const collectedEvent = mockCollector.collect.firstCall.args[0];
            expect(collectedEvent.tenantId).to.not.equal('sensitive-tenant-id');
            expect(collectedEvent.tenantId).to.have.lengthOf(16); // SHA256 substring
        });
    });
    
    describe('Metrics and Statistics', () => {
        it('should track event processing metrics', () => {
            const metrics = adapter.getMetrics();
            
            expect(metrics).to.have.keys([
                'eventsProcessed',
                'eventsDropped',
                'avgProcessingTime',
                'lastEventTime',
                'activeEvents',
                'historicalEvents'
            ]);
        });
        
        it('should update metrics after processing events', async () => {
            const taskData = { id: 'task-123', type: 'generation' };
            
            const initialMetrics = adapter.getMetrics();
            expect(initialMetrics.eventsProcessed).to.equal(0);
            
            mockOrchestrator.emit('taskQueued', taskData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const updatedMetrics = adapter.getMetrics();
            expect(updatedMetrics.eventsProcessed).to.equal(1);
            expect(updatedMetrics.lastEventTime).to.exist;
        });
    });
    
    describe('Configuration Management', () => {
        it('should return current configuration', () => {
            const config = adapter.getConfiguration();
            
            expect(config.enabled).to.be.true;
            expect(config.mode).to.equal('shadow');
            expect(config.enablePredictions).to.be.true;
        });
        
        it('should update configuration', () => {
            adapter.updateConfiguration({
                mode: 'display',
                enableAnomalyDetection: true
            });
            
            const config = adapter.getConfiguration();
            expect(config.mode).to.equal('display');
            expect(config.enableAnomalyDetection).to.be.true;
        });
        
        it('should emit configuration update event', (done) => {
            adapter.on('adapter:configuration-updated', (config) => {
                expect(config.mode).to.equal('full');
                done();
            });
            
            adapter.updateConfiguration({ mode: 'full' });
        });
    });
    
    describe('Event History', () => {
        it('should track task event history', async () => {
            const taskData = { id: 'task-123', type: 'generation' };
            
            // Queue task
            mockOrchestrator.emit('taskQueued', taskData);
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Complete task
            mockOrchestrator.emit('taskCompleted', { id: 'task-123' });
            await new Promise(resolve => setTimeout(resolve, 10));
            
            const history = adapter.getTaskHistory('task-123');
            expect(history).to.exist;
            expect(history.events).to.have.length(2);
            expect(history.events[0].eventType).to.equal('task_queued');
            expect(history.events[1].eventType).to.equal('task_completed');
        });
        
        it('should return null for unknown task history', () => {
            const history = adapter.getTaskHistory('unknown-task');
            expect(history).to.be.null;
        });
    });
    
    describe('Health Check', () => {
        it('should return health status', async () => {
            const health = await adapter.healthCheck();
            
            expect(health).to.have.keys([
                'status',
                'lastEventTime',
                'eventsProcessed',
                'eventsDropped',
                'processingTime'
            ]);
            expect(health.status).to.equal('healthy');
        });
    });
    
    describe('Listener Management', () => {
        it('should detach listeners', () => {
            const initialListeners = mockOrchestrator.listenerCount('taskQueued');
            expect(initialListeners).to.be.above(0);
            
            adapter.detachListeners();
            
            const finalListeners = mockOrchestrator.listenerCount('taskQueued');
            expect(finalListeners).to.equal(0);
        });
        
        it('should reattach listeners when enabled', () => {
            adapter.updateConfiguration({ enabled: false });
            expect(mockOrchestrator.listenerCount('taskQueued')).to.equal(0);
            
            adapter.updateConfiguration({ enabled: true });
            expect(mockOrchestrator.listenerCount('taskQueued')).to.equal(1);
        });
    });
});