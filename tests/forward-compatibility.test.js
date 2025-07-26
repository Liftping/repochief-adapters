/**
 * Forward Compatibility Tests
 * 
 * Validates that adapters can handle future features and API changes
 * gracefully through extensible interfaces and feature negotiation.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const ForwardCompatibilityManager = require('../../src/adapters/compatibility/ForwardCompatibilityManager');
const FeatureEvolution = require('../../src/adapters/compatibility/FeatureEvolution');

describe('Forward Compatibility Interfaces', () => {
    let sandbox;
    let manager;
    let evolution;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
        manager = new ForwardCompatibilityManager();
        evolution = new FeatureEvolution();
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    describe('ForwardCompatibilityManager', () => {
        describe('Feature Registration', () => {
            it('should register new features with metadata', () => {
                const featureDef = {
                    version: '1.0.0',
                    experimental: true,
                    schema: {
                        type: 'object',
                        properties: {
                            mode: { enum: ['fast', 'accurate'] }
                        }
                    }
                };
                
                const registered = manager.registerFeature('ai-reasoning', featureDef);
                
                expect(registered.name).to.equal('ai-reasoning');
                expect(registered.version).to.equal('1.0.0');
                expect(registered.metadata.experimental).to.be.true;
                expect(registered.schema).to.deep.equal(featureDef.schema);
            });
            
            it('should emit registration events', (done) => {
                manager.on('feature:registered', (event) => {
                    expect(event.feature).to.equal('new-feature');
                    expect(event.definition.name).to.equal('new-feature');
                    done();
                });
                
                manager.registerFeature('new-feature', { version: '1.0.0' });
            });
        });
        
        describe('Feature Support Checking', () => {
            beforeEach(() => {
                manager.registerFeature('stable-feature', {
                    version: '1.0.0',
                    deprecated: false
                });
                
                manager.registerFeature('deprecated-feature', {
                    version: '1.0.0',
                    deprecated: true
                });
            });
            
            it('should identify supported features', () => {
                expect(manager.isFeatureSupported('stable-feature')).to.be.true;
                expect(manager.isFeatureSupported('deprecated-feature')).to.be.false;
                expect(manager.isFeatureSupported('unknown-feature')).to.be.false;
            });
            
            it('should check version compatibility', () => {
                manager.registerFeature('versioned-feature', { version: '2.1.0' });
                
                expect(manager.isFeatureSupported('versioned-feature', '>=2.0.0')).to.be.true;
                expect(manager.isFeatureSupported('versioned-feature', '>=3.0.0')).to.be.false;
            });
        });
        
        describe('Feature Negotiation', () => {
            beforeEach(() => {
                manager.registerFeature('parallel-execution', {
                    version: '1.0.0',
                    schema: {
                        type: 'object',
                        properties: {
                            maxConcurrent: { type: 'number' }
                        }
                    }
                });
                
                manager.registerFeature('streaming', {
                    version: '1.0.0',
                    schema: {
                        type: 'object',
                        properties: {
                            chunkSize: { type: 'number' }
                        }
                    }
                });
            });
            
            it('should negotiate supported features', () => {
                const adapterCaps = {
                    features: {
                        'parallel-execution': { maxConcurrent: 5 },
                        'streaming': { chunkSize: 1000 }
                    }
                };
                
                const taskRequirements = {
                    'parallel-execution': { maxConcurrent: 3 },
                    'streaming': { chunkSize: 500 }
                };
                
                const negotiated = manager.negotiateFeatures(adapterCaps, taskRequirements);
                
                expect(negotiated.supported).to.have.keys(['parallel-execution', 'streaming']);
                expect(negotiated.unsupported).to.be.empty;
            });
            
            it('should identify unsupported features', () => {
                const adapterCaps = {
                    features: {
                        'parallel-execution': { maxConcurrent: 5 }
                    }
                };
                
                const taskRequirements = {
                    'parallel-execution': { maxConcurrent: 3 },
                    'unknown-feature': { someConfig: true }
                };
                
                const negotiated = manager.negotiateFeatures(adapterCaps, taskRequirements);
                
                expect(negotiated.supported).to.have.key('parallel-execution');
                expect(negotiated.unsupported).to.have.key('unknown-feature');
            });
        });
        
        describe('Extension Handlers', () => {
            it('should register and use extension handlers', () => {
                const handler = sandbox.stub().returns({
                    supported: true,
                    data: { handled: true }
                });
                
                manager.registerExtensionHandler('experimental-*', handler);
                
                const negotiated = manager.negotiateFeatures(
                    { features: {} },
                    { 'experimental-ai-reasoning': { mode: 'fast' } }
                );
                
                expect(negotiated.extensions).to.have.key('experimental-ai-reasoning');
                expect(handler).to.have.been.calledOnce;
            });
            
            it('should match patterns correctly', () => {
                const experimentalHandler = sandbox.stub().returns({ supported: false });
                const vendorHandler = sandbox.stub().returns({ supported: true });
                
                manager.registerExtensionHandler('experimental-*', experimentalHandler);
                manager.registerExtensionHandler('vendor-*', vendorHandler);
                
                manager.negotiateFeatures(
                    { features: {} },
                    { 
                        'experimental-feature': {},
                        'vendor-specific': {},
                        'normal-feature': {}
                    }
                );
                
                expect(experimentalHandler).to.have.been.calledOnce;
                expect(vendorHandler).to.have.been.calledOnce;
            });
        });
        
        describe('Task Transformation', () => {
            it('should transform tasks between versions', async () => {
                const task = {
                    id: 'test-1',
                    type: 'generation',
                    oldField: 'value'
                };
                
                // Mock transformation path
                sandbox.stub(manager, '_getTransformationPath').returns(['1.1.0', '2.0.0']);
                sandbox.stub(manager, '_getTransformersForVersion').returns([
                    async (task) => {
                        delete task.oldField;
                        task.newField = 'transformed';
                        return task;
                    }
                ]);
                
                const transformed = await manager.transformTask(task, '1.0.0', '2.0.0');
                
                expect(transformed.oldField).to.be.undefined;
                expect(transformed.newField).to.equal('transformed');
            });
        });
        
        describe('Future-Proof Task Creation', () => {
            it('should create tasks with forward compatibility structure', () => {
                const baseTask = {
                    id: 'test-1',
                    type: 'generation',
                    objective: 'Generate code',
                    description: 'Create a React component'
                };
                
                const futureProof = manager.createFutureProofTask(baseTask);
                
                expect(futureProof.version).to.exist;
                expect(futureProof.apiVersion).to.exist;
                expect(futureProof.features).to.exist;
                expect(futureProof.configuration).to.exist;
                expect(futureProof.extensions).to.exist;
                expect(futureProof._future).to.exist;
            });
        });
        
        describe('Validation', () => {
            it('should validate forward compatibility', () => {
                const task = {
                    id: 'test-1',
                    type: 'generation',
                    features: {
                        'deprecated-feature': {}
                    }
                };
                
                manager.registerFeature('deprecated-feature', {
                    version: '1.0.0',
                    deprecated: true,
                    replacedBy: 'new-feature'
                });
                
                const validation = manager.validateForwardCompatibility(task);
                
                expect(validation.valid).to.be.true; // Warnings don't make it invalid
                expect(validation.warnings).to.have.length.above(0);
                expect(validation.suggestions).to.include.match(/new-feature/);
            });
        });
        
        describe('Compatibility Reports', () => {
            it('should generate compatibility reports between versions', () => {
                // Mock version features
                sandbox.stub(manager, '_getFeaturesForVersion')
                    .withArgs('1.0.0').returns(['feature-a', 'feature-b'])
                    .withArgs('2.0.0').returns(['feature-a', 'feature-c']);
                
                const report = manager.getCompatibilityReport('1.0.0', '2.0.0');
                
                expect(report.compatible).to.be.false; // feature-b removed
                expect(report.breakingChanges).to.include('feature-b');
                expect(report.newFeatures).to.include('feature-c');
            });
        });
    });
    
    describe('FeatureEvolution', () => {
        describe('Evolution Registration', () => {
            it('should register feature evolution stages', () => {
                const evoDef = {
                    stages: [
                        {
                            version: '1.0',
                            name: 'Basic',
                            capabilities: { basic: true }
                        },
                        {
                            version: '2.0',
                            name: 'Advanced',
                            capabilities: { basic: true, advanced: true }
                        }
                    ]
                };
                
                evolution.registerEvolution('test-feature', evoDef);
                
                const stage1 = evolution.getEvolutionStage('test-feature', '1.0');
                const stage2 = evolution.getEvolutionStage('test-feature', '2.0');
                
                expect(stage1.name).to.equal('Basic');
                expect(stage1.level).to.equal(0);
                expect(stage2.name).to.equal('Advanced');
                expect(stage2.level).to.equal(1);
                expect(stage2.isLatest).to.be.true;
            });
        });
        
        describe('Polyfill Creation', () => {
            it('should create polyfills for missing features', () => {
                const targetCaps = { streaming: true };
                const availableCaps = { features: { parallel: true } };
                
                const polyfill = evolution.createPolyfill('streaming', targetCaps, availableCaps);
                
                expect(polyfill).to.be.a('function');
            });
            
            it('should use registered polyfills when available', () => {
                const mockPolyfill = sandbox.stub().returns(async () => ({ polyfilled: true }));
                
                evolution.registerPolyfill('custom-feature', mockPolyfill);
                
                const polyfill = evolution.createPolyfill(
                    'custom-feature',
                    { someConfig: true },
                    { features: {} }
                );
                
                expect(mockPolyfill).to.have.been.calledOnce;
            });
        });
        
        describe('Feature Emulation', () => {
            it('should detect when features can be emulated', () => {
                // Register composition rule
                evolution.registerComposition('advanced-reasoning', {
                    requires: ['sub-agents', 'streaming'],
                    combine: () => ({ reasoning: true })
                });
                
                const capabilities = {
                    features: {
                        'sub-agents': { maxConcurrent: 3 },
                        'streaming': { chunkSize: 1000 }
                    }
                };
                
                const canEmulate = evolution.canEmulate('advanced-reasoning', capabilities);
                
                expect(canEmulate).to.be.true;
            });
            
            it('should detect when emulation is not possible', () => {
                const capabilities = {
                    features: {
                        'basic-feature': true
                    }
                };
                
                const canEmulate = evolution.canEmulate('advanced-reasoning', capabilities);
                
                expect(canEmulate).to.be.false;
            });
        });
        
        describe('Task Evolution', () => {
            beforeEach(() => {
                // Register feature evolution
                evolution.registerEvolution('streaming', {
                    stages: [
                        {
                            version: '1.0',
                            name: 'Basic Chunks',
                            capabilities: { chunks: true }
                        },
                        {
                            version: '2.0',
                            name: 'Progressive',
                            capabilities: { chunks: true, progressive: true }
                        }
                    ]
                });
            });
            
            it('should evolve tasks to use newer features', () => {
                const task = {
                    id: 'test-1',
                    type: 'generation',
                    features: {
                        'streaming': { chunks: true }
                    }
                };
                
                const capabilities = {
                    features: {
                        'streaming': { chunks: true, progressive: true }
                    }
                };
                
                const evolved = evolution.evolveTask(task, capabilities);
                
                // Task should be enhanced with progressive streaming
                expect(evolved._evolution).to.exist;
            });
            
            it('should suggest enhancements for tasks', () => {
                const task = {
                    id: 'test-1',
                    type: 'generation',
                    context: { images: ['sketch.png'] }
                };
                
                const capabilities = {
                    features: {
                        'vision': { analyze: true }
                    }
                };
                
                const evolved = evolution.evolveTask(task, capabilities);
                
                expect(evolved._enhancements).to.have.length.above(0);
                expect(evolved._enhancements[0].feature).to.equal('vision');
            });
        });
        
        describe('Compatibility Matrix', () => {
            it('should generate feature compatibility matrix', () => {
                const features = ['streaming', 'parallel', 'sub-agents'];
                
                const matrix = evolution.getCompatibilityMatrix(features);
                
                expect(matrix).to.have.keys(features);
                expect(matrix.streaming.parallel).to.equal('complementary');
                expect(matrix['sub-agents'].parallel).to.equal('supersedes');
            });
        });
        
        describe('Composition Rules', () => {
            it('should register and use composition rules', () => {
                const rule = {
                    requires: ['feature-a', 'feature-b'],
                    combine: sandbox.stub().returns({ composed: true }),
                    limitations: ['Limited performance']
                };
                
                evolution.registerComposition('composite-feature', rule);
                
                const capabilities = {
                    features: {
                        'feature-a': true,
                        'feature-b': true
                    }
                };
                
                const canEmulate = evolution.canEmulate('composite-feature', capabilities);
                
                expect(canEmulate).to.be.true;
            });
        });
    });
    
    describe('Integration Tests', () => {
        it('should handle complete forward compatibility workflow', async () => {
            // 1. Register a new feature
            const featureDef = {
                version: '1.0.0',
                experimental: true,
                schema: {
                    type: 'object',
                    properties: {
                        aiModel: { type: 'string' },
                        reasoning: { type: 'boolean' }
                    }
                }
            };
            
            manager.registerFeature('ai-reasoning', featureDef);
            
            // 2. Create future-proof task
            const task = manager.createFutureProofTask({
                id: 'reasoning-task',
                type: 'analysis',
                objective: 'Analyze complex data',
                description: 'Perform deep analysis with AI reasoning'
            });
            
            // 3. Set up adapter capabilities
            const adapterCaps = {
                features: {
                    'ai-reasoning': { aiModel: 'gpt-4', reasoning: true },
                    'parallel': { maxConcurrent: 5 }
                }
            };
            
            // 4. Add requirements to task
            task.features.required = ['ai-reasoning'];
            task.features.optional = ['parallel'];
            
            // 5. Negotiate features
            const negotiated = manager.negotiateFeatures(
                adapterCaps,
                { 'ai-reasoning': { reasoning: true } }
            );
            
            // 6. Validate forward compatibility
            const validation = manager.validateForwardCompatibility(task);
            
            // 7. Evolution check
            const evolved = evolution.evolveTask(task, adapterCaps);
            
            // Assertions
            expect(negotiated.supported).to.have.key('ai-reasoning');
            expect(validation.valid).to.be.true;
            expect(evolved.features).to.exist;
        });
        
        it('should gracefully handle unknown futures', async () => {
            // Create task with unknown future features
            const futureTask = {
                id: 'future-1',
                type: 'generation',
                features: {
                    'quantum-ai': { qubits: 100 },
                    'neural-mesh': { nodes: 1000000 }
                },
                extensions: {
                    'future-vendor': {
                        timeTravel: true,
                        paradoxResolution: 'stable-loop'
                    }
                }
            };
            
            // Register extension handlers for future features
            manager.registerExtensionHandler('quantum-*', () => ({
                supported: false,
                fallback: 'classical-ai',
                warning: 'Quantum computing not available'
            }));
            
            manager.registerExtensionHandler('neural-*', () => ({
                supported: false,
                fallback: 'standard-neural',
                warning: 'Neural mesh not implemented'
            }));
            
            // Negotiate with current capabilities
            const currentCaps = {
                features: {
                    'classical-ai': { model: 'transformer' },
                    'standard-neural': { layers: 100 }
                }
            };
            
            const negotiated = manager.negotiateFeatures(currentCaps, futureTask.features);
            
            // Should handle gracefully
            expect(negotiated.extensions).to.have.keys(['quantum-ai', 'neural-mesh']);
            expect(negotiated.extensions['quantum-ai'].fallback).to.equal('classical-ai');
            expect(negotiated.extensions['neural-mesh'].fallback).to.equal('standard-neural');
        });
    });
});