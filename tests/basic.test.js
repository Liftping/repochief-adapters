const { expect } = require('chai');
const { AdapterRegistry, TaskRouter, AIAgentAdapter } = require('../src/index');

describe('Basic Adapter Package Functionality', () => {
    describe('Package Exports', () => {
        it('should export AdapterRegistry', () => {
            expect(AdapterRegistry).to.be.a('function');
        });

        it('should export TaskRouter', () => {
            expect(TaskRouter).to.be.a('function');
        });

        it('should export AIAgentAdapter', () => {
            expect(AIAgentAdapter).to.be.a('function');
        });
    });

    describe('AdapterRegistry', () => {
        let registry;

        beforeEach(() => {
            registry = new AdapterRegistry();
        });

        it('should create an adapter registry', () => {
            expect(registry).to.be.an('object');
            expect(registry.listAdapters()).to.be.an('array').that.is.empty;
        });

        it('should register and retrieve adapters', () => {
            class TestAdapter extends AIAgentAdapter {
                get adapterName() { return 'test'; }
                get adapterVersion() { return '1.0.0'; }
                async initialize() {}
                async executeTask() { return { success: true }; }
                async healthCheck() { return { status: 'healthy' }; }
                async shutdown() {}
            }

            const adapter = new TestAdapter();
            registry.registerAdapter('test', adapter, '1.0.0');

            const retrieved = registry.getAdapter('test');
            expect(retrieved).to.equal(adapter);
        });
    });

    describe('TaskRouter', () => {
        it('should create a task router', () => {
            const registry = new AdapterRegistry();
            const router = new TaskRouter(registry);
            expect(router).to.be.an('object');
        });
    });
});