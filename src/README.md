# RepoChief Terminal Adapters

This directory contains adapter implementations for various AI terminal interfaces, enabling RepoChief to work with any AI coding assistant.

## Overview

RepoChief uses an adapter pattern to support multiple AI terminal interfaces. This design allows RepoChief to be vendor-agnostic and work with whatever AI tools developers prefer.

## Directory Structure

```
src/adapters/
├── README.md                # This file
├── base-adapter.js          # Base class for all adapters (to be implemented)
├── claude-code-adapter.js   # Claude Code integration (planned)
├── aider-adapter.js         # Aider integration (planned)
├── cursor-adapter.js        # Cursor integration (planned)
└── examples/                # Example implementations
    ├── gemini-cli-adapter.js    # Google Gemini CLI example
    ├── grok-cli-adapter.js      # xAI Grok CLI example
    └── qwen-cli-adapter.js      # Alibaba Qwen CLI example
```

## Base Adapter Interface

All adapters must extend the base adapter class and implement the following methods:

### Core Methods
- `initialize(config)` - Set up the adapter with configuration
- `executeTask(task)` - Execute a task and return results
- `healthCheck()` - Verify the adapter is working correctly
- `shutdown()` - Clean up resources

### Optional Methods
- `streamOutput(callback)` - Stream output for long-running tasks
- `cancelTask(taskId)` - Cancel an in-progress task
- `getStatus()` - Get current adapter status

## Example Adapters

### Gemini CLI Adapter
- **Features**: 1M token context, multifile support, JSON output
- **Strengths**: Large context window, fast processing
- **Use Case**: Complex code analysis and generation

### Grok CLI Adapter
- **Features**: Real-time knowledge, personality modes, humor
- **Strengths**: Current information, engaging responses
- **Use Case**: Tasks requiring up-to-date information

### Qwen CLI Adapter
- **Features**: Multimodal, multilingual, code execution
- **Strengths**: Image understanding, Chinese language support
- **Use Case**: International projects, visual-to-code tasks

## Creating a New Adapter

1. **Copy an example adapter** as your starting point
2. **Modify the capabilities** to match your CLI tool
3. **Implement command building** for your tool's syntax
4. **Parse output** according to your tool's format
5. **Test thoroughly** with various task types

## Best Practices

1. **Error Handling**: Always wrap external calls in try-catch
2. **Resource Management**: Clean up processes and files on shutdown
3. **Configuration**: Support both env vars and config objects
4. **Compatibility**: Check tool version on initialization
5. **Performance**: Stream large outputs instead of buffering

## Testing

Each adapter should have comprehensive tests:
```javascript
describe('YourAdapter', () => {
  test('should initialize correctly', async () => {
    // Test initialization
  });
  
  test('should execute tasks', async () => {
    // Test task execution
  });
  
  test('should handle errors gracefully', async () => {
    // Test error scenarios
  });
});
```

## Integration with RepoChief

Adapters are registered with the orchestrator:
```javascript
const orchestrator = new AIAgentOrchestrator();
const geminiAdapter = new GeminiCLIAdapter();
await geminiAdapter.initialize({ apiKey: 'your-key' });
orchestrator.registerAdapter(geminiAdapter);
```

## Future Enhancements

- [ ] Auto-discovery of installed CLI tools
- [ ] Adapter marketplace for community contributions
- [ ] Performance benchmarking framework
- [ ] Adapter composition (multiple CLIs for one task)
- [ ] Unified prompt optimization across adapters

## Contributing

To contribute a new adapter:
1. Follow the adapter interface specification
2. Include comprehensive documentation
3. Add tests with >80% coverage
4. Submit a PR with example usage

For more details, see the [Terminal Interface Adapter Guide](../../docs/TERMINAL_INTERFACE_ADAPTER_GUIDE.md).