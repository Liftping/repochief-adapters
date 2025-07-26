/**
 * Capability Detection Protocol Tests
 * 
 * Validates the capability detection implementation across different
 * adapter versions and configurations.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const AIAgentAdapter = require('../../src/adapters/base/AIAgentAdapter');
const GeminiCLIAdapterV2 = require('../../src/adapters/enhanced/GeminiCLIAdapterV2');
const AdapterRegistry = require('../../src/adapters/AdapterRegistry');
const TaskRouter = require('../../src/adapters/TaskRouter');

describe('Capability Detection Protocol', () => {
    let sandbox;
    
    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });
    
    afterEach(() => {
        sandbox.restore();
    });
    
    describe('AIAgentAdapter Base Class', () => {
        class TestAdapter extends AIAgentAdapter {
            constructor() {
                super();
                this.name = 'test-adapter';
                this._capabilities = {
                    maxContextTokens: 100000,
                    supportedLanguages: ['javascript', 'python'],
                    multiFile: true,
                    streaming: false,
                    subAgents: {
                        supported: true,
                        maxConcurrent: 3,
                        delegationTypes: ['analysis', 'generation']
                    },
                    features: {
                        'generation': true,
                        'refactoring': false,
                        'visionSupport': {
                            enabled: true,
                            config: {
                                formats: ['png', 'jpg']
                            }
                        }
                    }
                };
            }
            
            get apiVersion() { return '1.0.0'; }
            get supportedApiVersions() { return ['1.0.0']; }
            async initialize() { this.initialized = true; return true; }
            async healthCheck() { return { healthy: true }; }
            async shutdown() { this.initialized = false; }
            async executeTaskV1() { return { status: 'completed' }; }
        }
        
        it('should detect top-level capabilities', () => {
            const adapter = new TestAdapter();
            
            expect(adapter.supportsFeature('multiFile')).to.be.true;
            expect(adapter.supportsFeature('streaming')).to.be.false;
            expect(adapter.supportsFeature('nonExistent')).to.be.false;
        });
        
        it('should detect feature flags', () => {
            const adapter = new TestAdapter();
            
            expect(adapter.supportsFeature('generation')).to.be.true;
            expect(adapter.supportsFeature('refactoring')).to.be.false;
        });
        
        it('should detect complex feature configurations', () => {
            const adapter = new TestAdapter();
            
            expect(adapter.supportsFeature('visionSupport')).to.be.true;
            
            const visionConfig = adapter.getFeatureConfig('visionSupport');
            expect(visionConfig).to.deep.equal({
                formats: ['png', 'jpg']
            });
        });
        
        it('should detect sub-features using dot notation', () => {
            const adapter = new TestAdapter();
            
            expect(adapter.supportsFeature('subAgents.supported')).to.be.true;
            expect(adapter.supportsFeature('subAgents.maxConcurrent')).to.be.true;
            expect(adapter.supportsFeature('subAgents.nonExistent')).to.be.false;
        });
        
        it('should return null for non-existent feature configs', () => {
            const adapter = new TestAdapter();
            
            expect(adapter.getFeatureConfig('generation')).to.be.null;
            expect(adapter.getFeatureConfig('nonExistent')).to.be.null;
        });
        
        it('should emit capability change events', (done) => {
            const adapter = new TestAdapter();
            
            adapter.on('capability:changed', (event) => {
                expect(event.capability).to.equal('streaming');
                expect(event.oldValue).to.be.false;
                expect(event.newValue).to.be.true;
                expect(event.timestamp).to.be.instanceOf(Date);
                done();
            });
            
            adapter.emitCapabilityChange('streaming', false, true);
        });
        
        it('should provide complete diagnostics', () => {
            const adapter = new TestAdapter();
            
            const diagnostics = adapter.getDiagnostics();
            
            expect(diagnostics).to.have.all.keys(
                'name', 'initialized', 'apiVersion', 'adapterVersion',
                'supportedApiVersions', 'capabilities', 'migrationPaths', 'timestamp'
            );
            expect(diagnostics.name).to.equal('test-adapter');
            expect(diagnostics.capabilities).to.deep.equal(adapter._capabilities);
        });
    });
    
    describe('GeminiCLIAdapterV2 Capabilities', () => {
        let adapter;
        let execStub;
        
        beforeEach(() => {
            adapter = new GeminiCLIAdapterV2();
            execStub = sandbox.stub(require('child_process'), 'exec');
            
            // Mock version check
            execStub.withArgs('gemini --version').yields(null, {
                stdout: 'Gemini CLI v2.1.0'
            });
            
            // Mock test connection
            execStub.withArgs('gemini test-connection').yields(null, {
                stdout: 'Connected'
            });
            
            // Mock model list
            execStub.withArgs('gemini list-models --format json').yields(null, {
                stdout: '["gemini-pro", "gemini-pro-vision", "gemini-ultra"]'
            });
        });
        
        it('should initialize with correct capabilities', async () => {
            process.env.GEMINI_API_KEY = 'test-key';
            
            await adapter.initialize({ model: 'gemini-pro' });
            
            const caps = adapter.capabilities;
            
            expect(caps.maxContextTokens).to.equal(32768); // Adjusted for gemini-pro
            expect(caps.supportedLanguages).to.include.members(['javascript', 'python']);
            expect(caps.multiFile).to.be.true;
            expect(caps.streaming).to.be.true;
            expect(caps.subAgents.supported).to.be.false; // Gemini doesn't have sub-agents
        });
        
        it('should adjust capabilities for older CLI versions', async () => {
            execStub.withArgs('gemini --version').yields(null, {
                stdout: 'Gemini CLI v1.5.0'
            });
            
            process.env.GEMINI_API_KEY = 'test-key';
            
            const capabilityChangeSpy = sandbox.spy(adapter, 'emitCapabilityChange');
            
            await adapter.initialize();
            
            expect(adapter.supportsFeature('parallelExecution')).to.be.false;
            expect(adapter.supportsFeature('streaming')).to.be.false;
            
            expect(capabilityChangeSpy).to.have.been.calledWith('parallelExecution', true, false);
            expect(capabilityChangeSpy).to.have.been.calledWith('streaming', true, false);
        });
        
        it('should detect vision support based on model', async () => {
            process.env.GEMINI_API_KEY = 'test-key';
            
            // Test with vision model
            await adapter.initialize({ model: 'gemini-pro-vision' });
            expect(adapter.supportsFeature('visionSupport')).to.be.true;
            
            // Re-initialize with non-vision model
            await adapter.initialize({ model: 'gemini-pro' });
            expect(adapter.supportsFeature('visionSupport')).to.be.false;
        });
        
        it('should provide accurate health check with capabilities', async () => {
            process.env.GEMINI_API_KEY = 'test-key';
            await adapter.initialize({ model: 'gemini-pro' });
            
            const health = await adapter.healthCheck();
            
            expect(health.healthy).to.be.true;
            expect(health.capabilities).to.deep.equal(adapter.capabilities);
            expect(health.modelAvailable).to.be.true;
        });
    });
    
    describe('Adapter Registry Capability Matching', () => {
        let registry;
        
        beforeEach(() => {
            registry = new AdapterRegistry();
        });
        
        it('should find adapters matching capability requirements', () => {
            // Create test adapters with different capabilities
            const adapter1 = {
                name: 'adapter1',
                apiVersion: '1.0.0',
                capabilities: {
                    maxContextTokens: 100000,
                    supportedLanguages: ['javascript', 'python'],
                    multiFile: true,
                    features: { generation: true, refactoring: true }
                },
                supportsFeature: function(f) {
                    return this.capabilities.features[f] || this.capabilities[f] || false;
                }
            };
            
            const adapter2 = {
                name: 'adapter2',
                apiVersion: '1.0.0',
                capabilities: {
                    maxContextTokens: 50000,
                    supportedLanguages: ['javascript'],
                    multiFile: false,
                    features: { generation: true, refactoring: false }
                },
                supportsFeature: function(f) {
                    return this.capabilities.features[f] || this.capabilities[f] || false;
                }
            };
            
            registry.registerAdapter('adapter1', adapter1);
            registry.registerAdapter('adapter2', adapter2);
            
            // Test matching with high requirements
            const matches = registry.findMatchingAdapters({
                features: ['generation', 'refactoring'],
                minContextTokens: 80000,
                languages: ['javascript', 'python'],
                multiFile: true
            });
            
            expect(matches).to.have.length(1);
            expect(matches[0].name).to.equal('adapter1');
            expect(matches[0].score).to.be.above(20);
        });
        
        it('should score adapters based on capability match quality', () => {
            const adapter = {
                name: 'test',
                apiVersion: '1.0.0',
                capabilities: {
                    maxContextTokens: 200000,
                    supportedLanguages: ['javascript', 'typescript', 'python'],
                    multiFile: true,
                    streaming: true,
                    features: {
                        generation: true,
                        refactoring: true,
                        testing: true
                    }
                },
                supportsFeature: function(f) {
                    if (f === 'subAgents.supported') return false;
                    return this.capabilities.features[f] || this.capabilities[f] || false;
                }
            };
            
            registry.registerAdapter('test', adapter);
            
            const requirements = {
                features: ['generation', 'refactoring'],
                minContextTokens: 100000,
                languages: ['javascript'],
                multiFile: true,
                streaming: true
            };
            
            const matches = registry.findMatchingAdapters(requirements);
            
            expect(matches[0].score).to.be.above(25); // High score for exceeding requirements
        });
    });
    
    describe('Task Router Capability Analysis', () => {
        let router;
        let registry;
        
        beforeEach(() => {
            registry = new AdapterRegistry();
            router = new TaskRouter(registry);
        });
        
        it('should analyze task to determine capability requirements', () => {
            const task = {
                id: 'test-1',
                type: 'generation',
                objective: 'Generate code',
                description: 'Create a TypeScript React component with streaming updates',
                context: {
                    files: ['comp1.tsx', 'comp2.tsx', 'comp3.tsx'],
                    content: 'export interface Props { }'
                }
            };
            
            const requirements = router.analyzeTask(task);
            
            expect(requirements.features).to.include.members(['generation', 'refactoring']);
            expect(requirements.languages).to.include('typescript');
            expect(requirements.multiFile).to.be.true;
            expect(requirements.streaming).to.be.true;
            expect(requirements.minContextTokens).to.be.above(1500); // 3 files + content
        });
        
        it('should detect sub-agent requirements from task description', () => {
            const task = {
                id: 'test-2',
                type: 'generation',
                objective: 'Complex generation',
                description: 'Delegate this task to multiple sub-agents working in parallel'
            };
            
            const requirements = router.analyzeTask(task);
            
            expect(requirements.subAgents).to.be.true;
        });
        
        it('should honor vendor extensions in requirements', () => {
            const task = {
                id: 'test-3',
                type: 'validation',
                objective: 'Validate code',
                description: 'Simple validation',
                extensions: {
                    'claude-code': {
                        subAgents: true,
                        streaming: true,
                        features: ['advanced-analysis']
                    }
                }
            };
            
            const requirements = router.analyzeTask(task);
            
            expect(requirements.subAgents).to.be.true;
            expect(requirements.streaming).to.be.true;
            expect(requirements.features).to.include('advanced-analysis');
        });
        
        it('should route to adapter with best capability match', async () => {
            // Create adapters with different capabilities
            const strongAdapter = {
                name: 'strong',
                apiVersion: '2.0.0',
                capabilities: {
                    maxContextTokens: 1000000,
                    supportedLanguages: ['javascript', 'typescript', 'python'],
                    multiFile: true,
                    streaming: true,
                    features: { generation: true, refactoring: true }
                },
                supportsFeature: function(f) {
                    return this.capabilities.features[f] || this.capabilities[f] || false;
                }
            };
            
            const weakAdapter = {
                name: 'weak',
                apiVersion: '1.0.0',
                capabilities: {
                    maxContextTokens: 50000,
                    supportedLanguages: ['javascript'],
                    multiFile: false,
                    streaming: false,
                    features: { generation: true }
                },
                supportsFeature: function(f) {
                    return this.capabilities.features[f] || this.capabilities[f] || false;
                }
            };
            
            registry.registerAdapter('strong', strongAdapter);
            registry.registerAdapter('weak', weakAdapter);
            
            const task = {
                id: 'complex-task',
                type: 'generation',
                objective: 'Complex multi-file generation',
                description: 'Generate TypeScript components with streaming',
                context: {
                    files: ['a.ts', 'b.ts', 'c.ts']
                }
            };
            
            const routing = await router.route(task);
            
            expect(routing.adapterName).to.equal('strong');
            expect(routing.score).to.be.above(20);
        });
    });
    
    describe('Graceful Degradation', () => {
        it('should use version migration for task compatibility', async () => {
            class TestAdapterWithMigration extends AIAgentAdapter {
                constructor() {
                    super();
                    this.name = 'test-migration';
                    this._capabilities = { features: {} };
                    
                    // Register migrations
                    this.registerMigration('1.0', '1.1', (task) => {
                        task.v11Feature = true;
                        return task;
                    });
                    
                    this.registerMigration('1.1', '2.0', (task) => {
                        task.v20Feature = true;
                        delete task.v11Feature;
                        return task;
                    });
                }
                
                get apiVersion() { return '2.0'; }
                get supportedApiVersions() { return ['1.0', '1.1', '2.0']; }
                async initialize() { return true; }
                async healthCheck() { return { healthy: true }; }
                async shutdown() {}
                async executeTaskV1() { return {}; }
            }
            
            const adapter = new TestAdapterWithMigration();
            
            const oldTask = { id: 'old', type: 'test' };
            const migratedTask = await adapter.migrateTask(oldTask, '1.0', '2.0');
            
            expect(migratedTask.v20Feature).to.be.true;
            expect(migratedTask.v11Feature).to.be.undefined;
        });
        
        it('should find migration path for multi-hop migrations', async () => {
            class ComplexMigrationAdapter extends AIAgentAdapter {
                constructor() {
                    super();
                    this.name = 'complex-migration';
                    this._capabilities = { features: {} };
                    
                    // Register multiple migration paths
                    this.registerMigration('1.0', '1.1', (t) => ({ ...t, v: '1.1' }));
                    this.registerMigration('1.1', '1.2', (t) => ({ ...t, v: '1.2' }));
                    this.registerMigration('1.2', '2.0', (t) => ({ ...t, v: '2.0' }));
                    
                    // Alternative path
                    this.registerMigration('1.0', '1.5', (t) => ({ ...t, v: '1.5' }));
                    this.registerMigration('1.5', '2.0', (t) => ({ ...t, v: '2.0', alt: true }));
                }
                
                get apiVersion() { return '2.0'; }
                get supportedApiVersions() { return ['1.0', '1.1', '1.2', '1.5', '2.0']; }
                async initialize() { return true; }
                async healthCheck() { return { healthy: true }; }
                async shutdown() {}
                async executeTaskV1() { return {}; }
            }
            
            const adapter = new ComplexMigrationAdapter();
            
            const task = { id: 'test' };
            const migrated = await adapter.migrateTask(task, '1.0', '2.0');
            
            expect(migrated.v).to.equal('2.0');
            // Could take either path, both are valid
        });
    });
});