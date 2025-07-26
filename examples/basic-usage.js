/**
 * Basic Usage Example for @repochief/adapters
 * 
 * This example shows how to use the adapter framework
 */

const { AdapterRegistry, TaskRouter, AIAgentAdapter } = require('../src/index');

// Example custom adapter
class ExampleAdapter extends AIAgentAdapter {
    constructor(config = {}) {
        super();
        this.config = config;
        this._capabilities = {
            maxContextTokens: 50000,
            supportedLanguages: ['javascript', 'python'],
            multiFile: true,
            streaming: false,
            features: {
                'generation': true,
                'analysis': true,
                'refactoring': true
            }
        };
    }

    async initialize() {
        console.log('ExampleAdapter initialized');
        this.emit('adapter:initialized');
    }

    async executeTask(task) {
        console.log(`Executing task: ${task.description}`);
        
        // Simulate task execution
        await new Promise(resolve => setTimeout(resolve, 100));
        
        return {
            success: true,
            output: `Completed task: ${task.description}`,
            files: task.context?.files || []
        };
    }

    async healthCheck() {
        return { status: 'healthy', timestamp: new Date() };
    }

    async shutdown() {
        console.log('ExampleAdapter shutting down');
    }

    get adapterName() {
        return 'example';
    }

    get adapterVersion() {
        return '1.0.0';
    }

    get apiVersion() {
        return '1.0.0';
    }

    get supportedApiVersions() {
        return ['1.0.0'];
    }
}

async function main() {
    console.log('🚀 RepoChief Adapters - Basic Usage Example\n');
    
    // 1. Create adapter registry
    console.log('1. Creating adapter registry...');
    const registry = new AdapterRegistry();
    
    // 2. Create and initialize adapter
    console.log('2. Creating and initializing adapter...');
    const adapter = new ExampleAdapter({ name: 'example' });
    await adapter.initialize();
    
    // 3. Register adapter
    console.log('3. Registering adapter...');
    registry.registerAdapter('example', adapter, '1.0.0');
    
    // 4. Create task router
    console.log('4. Creating task router...');
    const router = new TaskRouter(registry);
    
    // 5. Execute a task
    console.log('5. Executing a task...');
    const task = {
        id: 'example-task-1',
        type: 'generation',
        description: 'Create a simple function',
        context: {
            files: ['example.js']
        }
    };
    
    const routing = await router.route(task);
    console.log(`Selected adapter: ${routing.adapterName} v${routing.adapterVersion}`);
    
    const result = await routing.adapter.executeTask(task);
    console.log('Task result:', result);
    
    // 6. Check adapter health
    console.log('6. Checking adapter health...');
    const health = await adapter.healthCheck();
    console.log('Health status:', health);
    
    // 7. Clean up
    console.log('7. Shutting down...');
    await adapter.shutdown();
    
    console.log('\n✅ Example completed successfully!');
}

// Run the example
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { ExampleAdapter, main };