/**
 * Graceful Degradation Tests
 * 
 * Validates that the orchestration strategy correctly falls back
 * through different execution strategies when features are unavailable.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const OrchestrationStrategy = require('../../src/adapters/strategies/OrchestrationStrategy');

describe('Graceful Degradation Mechanisms', () => {
    let sandbox;
    let mockAdapter;
    let strategy;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Create mock adapter with configurable capabilities
        mockAdapter = {
            name: 'test-adapter',
            supportsFeature: sandbox.stub(),
            getFeatureConfig: sandbox.stub(),
            executeTask: sandbox.stub(),
            executeWithSubAgents: sandbox.stub(),
            executeWithStreaming: sandbox.stub()
        };
        
        strategy = new OrchestrationStrategy(mockAdapter);
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    describe('Basic Fallback Chain', () => {
        it('should try strategies in order until one succeeds', async () => {
            const task = {
                id: 'test-1',
                type: 'generation',
                description: 'Test task',
                context: { files: ['file1.js', 'file2.js', 'file3.js'] }
            };
            
            // Configure adapter capabilities
            mockAdapter.supportsFeature.withArgs('subAgents').returns(false);
            mockAdapter.supportsFeature.withArgs('parallelExecution').returns(false);
            mockAdapter.supportsFeature.withArgs('streaming').returns(false);
            
            // Sequential execution succeeds
            mockAdapter.executeTask.resolves({
                taskId: task.id,
                status: 'completed',
                output: 'Result'
            });
            
            const result = await strategy.execute(task);
            
            expect(result.strategy).to.equal('sequential');
            expect(result.attempts).to.have.length(5);
            expect(result.attempts[0]).to.include({ strategy: 'subAgents', status: 'skipped' });
            expect(result.attempts[1]).to.include({ strategy: 'parallel', status: 'skipped' });
            expect(result.attempts[2]).to.include({ strategy: 'streaming', status: 'skipped' });
            expect(result.attempts[4]).to.include({ strategy: 'sequential', status: 'success' });
        });
        
        it('should handle all strategies failing', async () => {
            const task = { id: 'test-2', type: 'generation', description: 'Test' };
            
            // All features available but all fail
            mockAdapter.supportsFeature.returns(true);
            mockAdapter.getFeatureConfig.returns({ maxConcurrent: 3 });
            
            // All executions fail
            const error = new Error('Execution failed');
            mockAdapter.executeWithSubAgents.rejects(error);
            mockAdapter.executeTask.rejects(error);
            
            try {
                await strategy.execute(task);
                expect.fail('Should have thrown error');
            } catch (err) {
                expect(err.message).to.equal('All execution strategies failed');
                expect(err.attempts).to.have.length(5);
                expect(err.attempts.every(a => a.status === 'failed')).to.be.true;
            }
        });
    });
    
    describe('Strategy Selection', () => {
        it('should skip unsuitable strategies for simple tasks', async () => {
            const simpleTask = {
                id: 'simple-1',
                type: 'validation',
                description: 'Simple validation',
                context: { files: ['single.js'] }
            };
            
            mockAdapter.supportsFeature.returns(true);
            mockAdapter.executeTask.resolves({ status: 'completed' });
            
            const result = await strategy.execute(simpleTask);
            
            // Should skip complex strategies for simple task
            const skippedStrategies = result.attempts
                .filter(a => a.status === 'skipped' && a.reason === 'Not suitable for task')
                .map(a => a.strategy);
            
            expect(skippedStrategies).to.include('subAgents');
            expect(skippedStrategies).to.include('batched');
        });
        
        it('should prefer parallel execution for multi-file tasks', async () => {
            const multiFileTask = {
                id: 'multi-1',
                type: 'validation',
                description: 'Validate multiple files',
                context: { files: ['a.js', 'b.js', 'c.js'] }
            };
            
            mockAdapter.supportsFeature.withArgs('subAgents').returns(false);
            mockAdapter.supportsFeature.withArgs('parallelExecution').returns(true);
            mockAdapter.getFeatureConfig.withArgs('parallelExecution').returns({ maxConcurrent: 5 });
            
            // Mock parallel execution
            mockAdapter.executeTask.resolves({
                status: 'completed',
                output: 'Validated'
            });
            
            const result = await strategy.execute(multiFileTask);
            
            expect(result.strategy).to.equal('parallel');
            expect(mockAdapter.executeTask.callCount).to.equal(3); // One per file
        });
        
        it('should use streaming for generation tasks', async () => {
            const genTask = {
                id: 'gen-1',
                type: 'generation',
                description: 'Generate a large component',
                streaming: true
            };
            
            mockAdapter.supportsFeature.withArgs('subAgents').returns(false);
            mockAdapter.supportsFeature.withArgs('parallelExecution').returns(false);
            mockAdapter.supportsFeature.withArgs('streaming').returns(true);
            
            mockAdapter.executeWithStreaming.resolves({
                status: 'completed',
                output: 'Generated content'
            });
            
            const result = await strategy.execute(genTask);
            
            expect(result.strategy).to.equal('streaming');
            expect(mockAdapter.executeWithStreaming).to.have.been.calledOnce;
        });
    });
    
    describe('Sub-Agent Execution', () => {
        it('should decompose complex tasks for sub-agents', async () => {
            const complexTask = {
                id: 'complex-1',
                type: 'generation',
                description: 'A very complex task requiring multiple perspectives',
                complexity: 'high'
            };
            
            mockAdapter.supportsFeature.withArgs('subAgents').returns(true);
            mockAdapter.getFeatureConfig.withArgs('subAgents').returns({
                maxConcurrent: 3,
                delegationTypes: ['analysis', 'generation', 'review']
            });
            
            mockAdapter.executeWithSubAgents.callsFake(async (plan) => {
                expect(plan.agents).to.have.length(3);
                expect(plan.agents[0].role).to.equal('architect');
                expect(plan.agents[1].role).to.equal('implementer');
                expect(plan.agents[2].role).to.equal('reviewer');
                
                return {
                    status: 'completed',
                    output: 'Complex result',
                    subAgentResults: plan.agents.map(a => ({ agent: a.id, status: 'completed' }))
                };
            });
            
            const result = await strategy.execute(complexTask);
            
            expect(result.strategy).to.equal('subAgents');
            expect(mockAdapter.executeWithSubAgents).to.have.been.calledOnce;
        });
    });
    
    describe('Batched Execution', () => {
        it('should batch large file sets', async () => {
            const largeTask = {
                id: 'large-1',
                type: 'analysis',
                description: 'Analyze many files',
                context: {
                    files: Array(25).fill(null).map((_, i) => `file${i}.js`)
                }
            };
            
            mockAdapter.supportsFeature.returns(false); // Force batched strategy
            let batchCount = 0;
            
            mockAdapter.executeTask.callsFake(async (task) => {
                expect(task.context.files.length).to.be.at.most(5);
                batchCount++;
                return {
                    status: 'completed',
                    output: `Batch ${batchCount} result`
                };
            });
            
            const result = await strategy.execute(largeTask);
            
            expect(result.strategy).to.equal('batched');
            expect(result.batchCount).to.equal(5); // 25 files / 5 per batch
            expect(mockAdapter.executeTask).to.have.callCount(5);
        });
    });
    
    describe('Explicit Strategy Selection', () => {
        it('should honor explicit strategy in vendor extensions', async () => {
            const task = {
                id: 'explicit-1',
                type: 'generation',
                description: 'Task with explicit strategy',
                extensions: {
                    'test-adapter': {
                        executionStrategy: 'streaming'
                    }
                }
            };
            
            mockAdapter.supportsFeature.withArgs('streaming').returns(true);
            mockAdapter.executeWithStreaming.resolves({ status: 'completed' });
            
            const result = await strategy.execute(task);
            
            expect(result.strategy).to.equal('streaming');
            expect(result.attempts[0].strategy).to.equal('streaming');
        });
        
        it('should fall back if explicit strategy fails', async () => {
            const task = {
                id: 'explicit-2',
                type: 'generation',
                description: 'Task with failing explicit strategy',
                executionStrategy: 'parallel'
            };
            
            mockAdapter.supportsFeature.withArgs('parallelExecution').returns(true);
            mockAdapter.supportsFeature.withArgs('streaming').returns(false);
            
            // Parallel fails, sequential succeeds
            mockAdapter.executeTask
                .onFirstCall().rejects(new Error('Parallel failed'))
                .onSecondCall().resolves({ status: 'completed' });
            
            const result = await strategy.execute(task);
            
            expect(result.strategy).to.equal('sequential');
            expect(result.attempts).to.have.length.at.least(2);
            expect(result.attempts[0]).to.include({ 
                strategy: 'parallel', 
                status: 'failed',
                error: 'Parallel failed'
            });
        });
    });
    
    describe('Timeout Handling', () => {
        it('should timeout long-running strategies', async () => {
            const task = { id: 'timeout-1', type: 'generation' };
            
            mockAdapter.supportsFeature.returns(true);
            
            // Create a promise that never resolves
            mockAdapter.executeWithSubAgents.returns(new Promise(() => {}));
            mockAdapter.executeTask.resolves({ status: 'completed' });
            
            // Use short timeout for testing
            const result = await strategy.execute(task, {
                strategies: ['subAgents', 'sequential'],
                timeout: 100 // 100ms timeout
            });
            
            expect(result.strategy).to.equal('sequential');
            expect(result.attempts[0]).to.include({
                strategy: 'subAgents',
                status: 'failed',
                error: 'Strategy timeout'
            });
        });
    });
    
    describe('Statistics Tracking', () => {
        it('should track strategy performance', async () => {
            const tasks = [
                { id: 't1', type: 'generation' },
                { id: 't2', type: 'validation' },
                { id: 't3', type: 'refactoring' }
            ];
            
            mockAdapter.supportsFeature.returns(false);
            mockAdapter.executeTask.resolves({ status: 'completed' });
            
            // Execute multiple tasks
            for (const task of tasks) {
                await strategy.execute(task);
            }
            
            const stats = strategy.getStatistics();
            
            expect(stats.sequential).to.exist;
            expect(stats.sequential.attempts).to.equal(3);
            expect(stats.sequential.successes).to.equal(3);
            expect(stats.sequential.successRate).to.equal(1);
            expect(stats.sequential.avgDuration).to.be.above(0);
        });
        
        it('should track failure reasons', async () => {
            const task = { id: 'fail-1', type: 'generation' };
            
            mockAdapter.supportsFeature.withArgs('parallelExecution').returns(true);
            mockAdapter.supportsFeature.withArgs('streaming').returns(false);
            
            // Parallel fails with specific error
            mockAdapter.executeTask
                .onFirstCall().rejects(new Error('Network timeout'))
                .onSecondCall().resolves({ status: 'completed' });
            
            await strategy.execute(task);
            
            const stats = strategy.getStatistics();
            
            expect(stats.parallel.failures).to.equal(1);
            expect(stats.parallel.topFailureReasons).to.deep.include({
                reason: 'Network timeout',
                count: 1
            });
        });
    });
    
    describe('Event Emissions', () => {
        it('should emit strategy events', async () => {
            const task = { id: 'event-1', type: 'generation' };
            const events = [];
            
            strategy.on('strategy:success', (e) => events.push({ type: 'success', ...e }));
            strategy.on('strategy:failed', (e) => events.push({ type: 'failed', ...e }));
            strategy.on('strategy:exhausted', (e) => events.push({ type: 'exhausted', ...e }));
            
            mockAdapter.supportsFeature.returns(false);
            mockAdapter.executeTask.resolves({ status: 'completed' });
            
            await strategy.execute(task);
            
            const successEvent = events.find(e => e.type === 'success');
            expect(successEvent).to.exist;
            expect(successEvent.strategy).to.equal('sequential');
            expect(successEvent.taskId).to.equal('event-1');
        });
        
        it('should emit batch progress events', async () => {
            const task = {
                id: 'batch-event-1',
                type: 'analysis',
                context: { files: Array(10).fill('file.js') }
            };
            
            const progressEvents = [];
            strategy.on('batch:completed', (e) => progressEvents.push(e));
            
            mockAdapter.supportsFeature.returns(false);
            mockAdapter.executeTask.resolves({ status: 'completed' });
            
            await strategy.execute(task, { batchSize: 3 });
            
            expect(progressEvents).to.have.length(4); // 10 files / 3 per batch = 4 batches
            expect(progressEvents[0].progress).to.equal(0.25);
            expect(progressEvents[3].progress).to.equal(1);
        });
    });
    
    describe('Streaming Support', () => {
        it('should handle streaming with chunk callbacks', async () => {
            const task = {
                id: 'stream-1',
                type: 'generation',
                description: 'Generate with streaming'
            };
            
            const chunks = [];
            const onChunk = (data) => chunks.push(data);
            
            mockAdapter.supportsFeature.withArgs('streaming').returns(true);
            mockAdapter.executeWithStreaming.callsFake(async (config) => {
                // Simulate streaming
                await config.onChunk({ chunk: 'Part 1', progress: 0.5 });
                await config.onChunk({ chunk: 'Part 2', progress: 1.0 });
                
                return {
                    status: 'completed',
                    output: 'Part 1Part 2'
                };
            });
            
            const result = await strategy.execute(task, { 
                strategies: ['streaming'],
                onChunk 
            });
            
            expect(result.strategy).to.equal('streaming');
            expect(chunks).to.have.length(2);
            expect(chunks[0].chunk).to.equal('Part 1');
            expect(chunks[1].progress).to.equal(1.0);
        });
        
        it('should simulate streaming for non-streaming adapters', async () => {
            const task = {
                id: 'sim-stream-1',
                type: 'generation',
                streaming: true
            };
            
            const chunks = [];
            const onChunk = (data) => chunks.push(data);
            
            mockAdapter.supportsFeature.withArgs('streaming').returns(true);
            mockAdapter.supportsFeature.withArgs('subAgents').returns(false);
            mockAdapter.supportsFeature.withArgs('parallelExecution').returns(false);
            
            // No executeWithStreaming method
            mockAdapter.executeTask.resolves({
                status: 'completed',
                output: 'A'.repeat(3000) // Long output
            });
            
            await strategy.execute(task, { onChunk });
            
            expect(chunks.length).to.be.above(1); // Should be chunked
            expect(chunks[0].chunk.length).to.equal(1000); // Default chunk size
        });
    });
});