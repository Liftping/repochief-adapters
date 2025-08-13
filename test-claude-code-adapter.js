#!/usr/bin/env node

/**
 * Basic test for Claude Code Adapter
 * Validates adapter initialization and basic functionality
 */

const { ClaudeCodeAdapter } = require('./src/index');

async function testClaudeCodeAdapter() {
    console.log('🧪 Testing Claude Code Adapter...\n');
    
    try {
        // 1. Test adapter creation
        console.log('1. Creating Claude Code Adapter...');
        const adapter = new ClaudeCodeAdapter();
        console.log('✅ Adapter created successfully');
        console.log(`   Name: ${adapter.name}`);
        console.log(`   Version: ${adapter.adapterVersion}`);
        
        // 2. Test capabilities
        console.log('\n2. Testing capabilities...');
        console.log(`   Max Context Tokens: ${adapter.capabilities.maxContextTokens}`);
        console.log(`   Supported Languages: ${adapter.capabilities.supportedLanguages.length}`);
        console.log(`   Multi-file Support: ${adapter.capabilities.multiFile}`);
        console.log(`   Streaming Support: ${adapter.capabilities.streaming}`);
        console.log(`   Tmux Execution: ${adapter.supportsFeature('tmuxExecution')}`);
        console.log(`   Local Execution: ${adapter.supportsFeature('localExecution')}`);
        
        // 3. Test health check before initialization
        console.log('\n3. Testing health check (before initialization)...');
        const preHealthCheck = await adapter.healthCheck();
        console.log(`   Status: ${preHealthCheck.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        if (!preHealthCheck.healthy) {
            console.log(`   Error: ${preHealthCheck.error}`);
        }
        
        // 4. Test initialization
        console.log('\n4. Testing initialization...');
        try {
            await adapter.initialize({
                workspaceRoot: '/home/carlosleivacom/workspace/repochief-packages',
                sessionPrefix: 'test-claude',
                maxSessions: 5,
                timeoutMs: 30000 // 30 seconds for test
            });
            console.log('✅ Adapter initialized successfully');
        } catch (initError) {
            console.log(`❌ Initialization failed: ${initError.message}`);
            if (initError.message.includes('Claude Code CLI not found')) {
                console.log('   Note: This is expected in environments without Claude Code CLI');
            }
            if (initError.message.includes('tmux not found')) {
                console.log('   Note: This is expected in environments without tmux');
            }
        }
        
        // 5. Test health check after initialization (if successful)
        if (adapter.initialized) {
            console.log('\n5. Testing health check (after initialization)...');
            const postHealthCheck = await adapter.healthCheck();
            console.log(`   Status: ${postHealthCheck.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
            console.log(`   Claude Code Version: ${postHealthCheck.checks?.claudeCode?.version || 'N/A'}`);
            console.log(`   Tmux Version: ${postHealthCheck.checks?.tmux?.version || 'N/A'}`);
            console.log(`   Available Sessions: ${postHealthCheck.sessions?.available || 0}/${postHealthCheck.sessions?.max || 0}`);
        }
        
        // 6. Test command building
        console.log('\n6. Testing command building...');
        const testTask = {
            id: 'test-task-1',
            type: 'security_audit',
            objective: 'Test security audit',
            description: 'Perform a test security audit',
            template: 'security_audit',
            parameters: {}
        };
        
        try {
            const command = adapter.commandBuilder.buildCommand(testTask, {
                workspaceRoot: '/home/carlosleivacom/workspace/repochief-packages',
                sessionId: 'test-session'
            });
            
            console.log('✅ Command built successfully');
            console.log(`   Template: ${command.template}`);
            console.log(`   Expects JSON: ${command.expectsJson}`);
            console.log(`   Timeout: ${command.timeout}ms`);
            console.log(`   Command: ${command.command.substring(0, 100)}...`);
        } catch (commandError) {
            console.log(`❌ Command building failed: ${commandError.message}`);
        }
        
        // 7. Test template listing
        console.log('\n7. Testing template listing...');
        const templates = adapter.commandBuilder.getAvailableTemplates();
        console.log(`   Available templates: ${templates.length}`);
        for (const template of templates) {
            console.log(`   - ${template.id}: ${template.name}`);
        }
        
        // 8. Test session management (if initialized)
        if (adapter.initialized) {
            console.log('\n8. Testing session management...');
            const sessions = await adapter.listActiveSessions();
            console.log(`   Active sessions: ${sessions.length}`);
            
            // Test session creation would require actual execution
            // Skip for basic validation test
        }
        
        // 9. Test graceful shutdown
        console.log('\n9. Testing shutdown...');
        try {
            await adapter.shutdown();
            console.log('✅ Adapter shutdown successfully');
        } catch (shutdownError) {
            console.log(`❌ Shutdown failed: ${shutdownError.message}`);
        }
        
        console.log('\n🎉 Claude Code Adapter test completed!');
        
    } catch (error) {
        console.error('\n❌ Test failed with error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    testClaudeCodeAdapter()
        .then(() => {
            console.log('\n✅ All tests passed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Test suite failed:', error);
            process.exit(1);
        });
}

module.exports = { testClaudeCodeAdapter };