/**
 * Integration Example: Enhanced Adapter Framework with Orchestrator
 * 
 * This example demonstrates how to integrate the enhanced adapter framework
 * with RepoChief's orchestrator, including version management, capability
 * detection, and intelligent task routing.
 */

const { AIAgentOrchestrator } = require('@repochief/core');
const AdapterRegistry = require('../AdapterRegistry');
const TaskRouter = require('../TaskRouter');
const GeminiCLIAdapterV2 = require('../enhanced/GeminiCLIAdapterV2');

// Import other adapters as they're implemented
// const ClaudeCodeAdapterV2 = require('../enhanced/ClaudeCodeAdapterV2');
// const AiderAdapterV2 = require('../enhanced/AiderAdapterV2');

async function setupEnhancedOrchestration() {
    console.log('🚀 Setting up enhanced AI orchestration with resilient adapters...\n');
    
    // 1. Create adapter registry
    const registry = new AdapterRegistry();
    
    // 2. Initialize and register adapters
    console.log('📦 Registering adapters...');
    
    // Register Gemini adapter (multiple versions for demonstration)
    const geminiV2 = new GeminiCLIAdapterV2();
    await geminiV2.initialize({
        apiKey: process.env.GEMINI_API_KEY,
        model: 'gemini-pro'
    });
    registry.registerAdapter('gemini-cli', geminiV2, '2.0.0', true);
    
    // You could also register older versions for compatibility
    // const geminiV1 = new GeminiCLIAdapterV1();
    // await geminiV1.initialize({ apiKey: process.env.GEMINI_API_KEY });
    // registry.registerAdapter('gemini-cli', geminiV1, '1.0.0', false);
    
    // Register other adapters as they become available
    // const claudeV2 = new ClaudeCodeAdapterV2();
    // await claudeV2.initialize();
    // registry.registerAdapter('claude-code', claudeV2, '2.0.0', true);
    
    // 3. Create task router with preferences
    console.log('\n🔄 Setting up intelligent task routing...');
    const router = new TaskRouter(registry, {
        preferredAdapters: ['claude-code', 'gemini-cli'], // Preference order
        considerPerformance: true,
        fallbackStrategies: ['subAgents', 'parallel', 'streaming', 'sequential']
    });
    
    // 4. Create enhanced orchestrator
    console.log('\n🎯 Creating enhanced orchestrator...');
    const orchestrator = new AIAgentOrchestrator({
        sessionName: 'enhanced-demo',
        // Other config...
    });
    
    // 5. Integrate router with orchestrator
    orchestrator.on('task:created', async (task) => {
        try {
            // Route task to best adapter
            const routing = await router.route(task);
            console.log(`\n📍 Routing task ${task.id} to ${routing.adapterName} v${routing.adapterVersion}`);
            console.log(`   Strategy: ${routing.strategy}`);
            console.log(`   Score: ${routing.score}`);
            
            // Execute task with selected adapter
            const result = await routing.adapter.executeTask(task);
            
            // Record performance metrics
            registry.recordMetrics(
                routing.adapterName,
                routing.adapterVersion,
                result.metrics
            );
            
            return result;
        } catch (error) {
            console.error(`❌ Task routing failed: ${error.message}`);
            throw error;
        }
    });
    
    return { orchestrator, registry, router };
}

async function demonstrateCapabilities() {
    const { orchestrator, registry, router } = await setupEnhancedOrchestration();
    
    console.log('\n🧪 Demonstrating enhanced capabilities...\n');
    
    // 1. Show registered adapters
    console.log('📋 Registered Adapters:');
    const adapterInfo = registry.getAllAdapterInfo();
    adapterInfo.forEach(info => {
        console.log(`   - ${info.name} v${info.version}${info.isDefault ? ' (default)' : ''}`);
        console.log(`     Max tokens: ${info.capabilities.maxContextTokens.toLocaleString()}`);
        console.log(`     Features: ${Object.keys(info.capabilities.features).filter(f => 
            info.capabilities.features[f] === true || 
            (info.capabilities.features[f].enabled === true)
        ).join(', ')}`);
    });
    
    // 2. Test capability detection
    console.log('\n🔍 Testing capability detection...');
    const requirements = {
        features: ['generation', 'refactoring'],
        minContextTokens: 50000,
        languages: ['javascript', 'typescript'],
        multiFile: true
    };
    
    const matches = registry.findMatchingAdapters(requirements);
    console.log(`Found ${matches.length} matching adapters:`);
    matches.forEach(match => {
        console.log(`   - ${match.name} v${match.version} (score: ${match.score})`);
    });
    
    // 3. Test different task types
    console.log('\n🚀 Testing task routing...');
    
    const testTasks = [
        {
            id: 'test-1',
            type: 'generation',
            objective: 'Generate a React component',
            description: 'Create a React component for a todo list with TypeScript',
            context: {
                files: ['src/components/TodoList.tsx'],
                content: 'export interface Todo { id: string; text: string; done: boolean; }'
            }
        },
        {
            id: 'test-2',
            type: 'refactoring',
            objective: 'Refactor for performance',
            description: 'Optimize this code for better performance using parallel processing',
            context: {
                files: ['src/utils/processor.js', 'src/utils/worker.js', 'src/utils/queue.js']
            }
        },
        {
            id: 'test-3',
            type: 'comprehension',
            objective: 'Explain complex code',
            description: 'Explain how this authentication system works',
            context: {
                files: ['src/auth/index.js'],
                content: '// Complex authentication code here...'
            },
            extensions: {
                'gemini-cli': {
                    temperature: 0.3,
                    executionStrategy: 'streaming'
                }
            }
        }
    ];
    
    for (const task of testTasks) {
        console.log(`\n📝 Task: ${task.objective}`);
        const routing = await router.route(task);
        console.log(`   → Routed to: ${routing.adapterName} v${routing.adapterVersion}`);
        console.log(`   → Strategy: ${routing.strategy}`);
        console.log(`   → Requirements: ${JSON.stringify(routing.requirements)}`);
    }
    
    // 4. Test version migration
    console.log('\n🔄 Testing version migration...');
    const geminiAdapter = registry.getAdapter('gemini-cli');
    
    const oldTask = {
        id: 'old-1',
        type: 'generation',
        description: 'Old format task',
        content: 'This is the old content field',
        temperature: 0.7
    };
    
    console.log('Old task format:', JSON.stringify(oldTask, null, 2));
    
    const migratedTask = await geminiAdapter.migrateTask(oldTask, '1.0.0', '2.0.0');
    console.log('Migrated task format:', JSON.stringify(migratedTask, null, 2));
    
    // 5. Test graceful degradation
    console.log('\n⚡ Testing graceful degradation...');
    const complexTask = {
        id: 'complex-1',
        type: 'generation',
        objective: 'Complex multi-file generation',
        description: 'Generate a complete authentication system',
        context: {
            files: Array(10).fill(null).map((_, i) => `src/auth/module${i}.js`)
        },
        extensions: {
            'claude-code': {
                subAgents: {
                    orchestrationMode: 'hierarchical',
                    agentRoles: ['architect', 'implementer', 'reviewer']
                }
            }
        }
    };
    
    const strategies = ['subAgents', 'parallel', 'streaming', 'sequential'];
    console.log(`Testing fallback strategies: ${strategies.join(' → ')}`);
    
    // This would attempt each strategy in order until one succeeds
    // const result = await geminiAdapter.executeWithFallback(complexTask, strategies);
    
    // 6. Show performance metrics
    console.log('\n📊 Performance Metrics:');
    const geminiMetrics = registry.getAdapterMetrics('gemini-cli', '2.0.0');
    console.log(`   Gemini CLI v2.0.0:`);
    console.log(`   - Total executions: ${geminiMetrics.totalExecutions}`);
    console.log(`   - Average duration: ${geminiMetrics.avgDuration}ms`);
    console.log(`   - Success rate: ${(geminiMetrics.successRate * 100).toFixed(1)}%`);
    
    // 7. Test batch routing
    console.log('\n📦 Testing batch task routing...');
    const batchTasks = Array(5).fill(null).map((_, i) => ({
        id: `batch-${i}`,
        type: 'validation',
        objective: 'Validate code quality',
        description: `Validate module ${i}`,
        context: { files: [`src/module${i}.js`] }
    }));
    
    const batchRouting = await router.routeBatch(batchTasks);
    console.log(`Routed ${batchRouting.length} tasks`);
    console.log(`Grouped routing used: ${batchRouting.filter(r => r.groupedRouting).length} tasks`);
    
    // 8. Show routing statistics
    console.log('\n📈 Routing Statistics:');
    const routingStats = router.getStatistics();
    console.log(`   Cache size: ${routingStats.cacheSize}`);
    console.log(`   Average score: ${routingStats.averageScore.toFixed(1)}`);
    console.log('   Adapter usage:');
    Object.entries(routingStats.adapterUsage).forEach(([adapter, count]) => {
        console.log(`     - ${adapter}: ${count} tasks`);
    });
    console.log('   Strategy usage:');
    Object.entries(routingStats.strategyUsage).forEach(([strategy, count]) => {
        console.log(`     - ${strategy}: ${count} tasks`);
    });
    
    console.log('\n✅ Enhanced orchestration demonstration complete!');
}

// Monitor adapter events
function setupEventMonitoring(registry, router) {
    // Registry events
    registry.on('adapter:registered', (event) => {
        console.log(`🔔 Adapter registered: ${event.name} v${event.version}`);
    });
    
    registry.on('adapter:unregistered', (event) => {
        console.log(`🔕 Adapter unregistered: ${event.name} v${event.version}`);
    });
    
    registry.on('adapter:default-changed', (event) => {
        console.log(`🔄 Default adapter changed: ${event.name} → v${event.version}`);
    });
    
    // Router events
    router.on('task:routed', (event) => {
        console.log(`📍 Task ${event.taskId} routed to ${event.adapter} v${event.version}`);
    });
    
    router.on('route:cache-hit', (event) => {
        console.log(`⚡ Cache hit for task ${event.taskId}`);
    });
    
    router.on('cache:cleared', (event) => {
        console.log(`🧹 Routing cache cleared`);
    });
}

// Main execution
if (require.main === module) {
    demonstrateCapabilities().catch(console.error);
}

module.exports = {
    setupEnhancedOrchestration,
    demonstrateCapabilities,
    setupEventMonitoring
};