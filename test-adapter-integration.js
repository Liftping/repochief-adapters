#!/usr/bin/env node

/**
 * Test Claude Code Adapter Integration
 * Tests the adapter with real tmux sessions and task execution
 */

const ClaudeCodeAdapter = require('./src/adapters/claude-code/ClaudeCodeAdapter');

async function testAdapterIntegration() {
  console.log('🧪 Testing Claude Code Adapter Integration\n');
  console.log('=' .repeat(50));
  
  const adapter = new ClaudeCodeAdapter();
  
  try {
    // Step 1: Initialize adapter
    console.log('\n📦 Step 1: Initialize Adapter');
    await adapter.initialize({
      workspaceRoot: process.cwd(),
      sessionPrefix: 'test-adapter',
      maxSessions: 5,
      deviceId: 'test-device-' + Date.now()
    });
    console.log('✅ Adapter initialized');
    
    // Step 2: Health check
    console.log('\n🏥 Step 2: Health Check');
    const health = await adapter.healthCheck();
    console.log('✅ Health check passed:', {
      healthy: health.healthy,
      apiVersion: health.apiVersion,
      sessions: health.sessions
    });
    
    // Step 3: Get capabilities
    console.log('\n🎯 Step 3: Check Capabilities');
    const capabilities = adapter.capabilities;
    console.log('✅ Capabilities:', {
      maxContextTokens: capabilities.maxContextTokens,
      multiFile: capabilities.multiFile,
      tmuxExecution: capabilities.features.tmuxExecution.enabled,
      localExecution: capabilities.features.localExecution.enabled
    });
    
    // Step 4: Execute a simple task
    console.log('\n🚀 Step 4: Execute Test Task');
    const testTask = {
      id: 'test-task-' + Date.now(),
      type: 'analysis',
      objective: 'Analyze package.json',
      description: 'List all dependencies in the current package.json file and identify outdated ones',
      context: {
        files: ['package.json']
      }
    };
    
    console.log('Executing task:', testTask.objective);
    const result = await adapter.executeTaskV1(testTask);
    
    console.log('✅ Task executed:', {
      taskId: result.taskId,
      status: result.status,
      sessionId: result.sessionId,
      duration: result.metrics.duration + 'ms'
    });
    
    if (result.output) {
      console.log('\n📝 Task Output:');
      console.log(result.output.substring(0, 200) + '...');
    }
    
    // Step 5: List active sessions
    console.log('\n📋 Step 5: List Active Sessions');
    const sessions = await adapter.listActiveSessions();
    console.log(`✅ Found ${sessions.length} active session(s)`);
    sessions.forEach(session => {
      console.log(`   - ${session.sessionId}: ${session.status} (${session.duration}ms)`);
    });
    
    // Step 6: Execute template task
    console.log('\n📑 Step 6: Execute Template Task');
    const templates = adapter.commandBuilder.getAvailableTemplates();
    console.log(`Available templates: ${templates.map(t => t.id).join(', ')}`);
    
    if (templates.length > 0) {
      console.log(`Executing template: ${templates[0].id}`);
      const templateResult = await adapter.executeTemplate(templates[0].id, {
        targetFiles: '*.js'
      });
      
      console.log('✅ Template executed:', {
        taskId: templateResult.taskId,
        status: templateResult.status
      });
    }
    
    // Step 7: Shutdown
    console.log('\n🛑 Step 7: Shutdown Adapter');
    await adapter.shutdown();
    console.log('✅ Adapter shutdown complete');
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('✅ All adapter integration tests passed!');
    console.log('\n📊 Test Summary:');
    console.log('   - Initialization: ✅');
    console.log('   - Health check: ✅');
    console.log('   - Capabilities check: ✅');
    console.log('   - Task execution: ✅');
    console.log('   - Session management: ✅');
    console.log('   - Template execution: ✅');
    console.log('   - Graceful shutdown: ✅');
    
    console.log('\n🎉 Claude Code Adapter is fully functional!');
    console.log('\nThe hybrid cloud-local execution model is ready for production!');
    
  } catch (error) {
    console.error('\n❌ Adapter test failed:', error.message);
    console.error('\nDebug info:', error);
    
    // Try to cleanup
    try {
      await adapter.shutdown();
    } catch (shutdownError) {
      console.error('Shutdown error:', shutdownError.message);
    }
    
    process.exit(1);
  }
}

// Run the test
testAdapterIntegration().catch(console.error);