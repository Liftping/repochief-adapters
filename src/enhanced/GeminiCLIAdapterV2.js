/**
 * Enhanced Gemini CLI Adapter V2 for RepoChief
 * 
 * Demonstrates the enhanced adapter framework with version management,
 * capability detection, and graceful degradation for Google's Gemini CLI.
 */

const AIAgentAdapter = require('../base/AIAgentAdapter');
const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

class GeminiCLIAdapterV2 extends AIAgentAdapter {
    constructor() {
        super();
        this.name = 'gemini-cli';
        this.process = null;
        this.config = {};
        
        // Initialize capabilities
        this._capabilities = {
            maxContextTokens: 1000000, // Gemini 1.5 Pro supports up to 1M tokens
            supportedLanguages: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c++'],
            multiFile: true,
            streaming: true,
            
            // Advanced features
            subAgents: {
                supported: false, // Gemini doesn't have native sub-agents yet
                maxConcurrent: 0,
                delegationTypes: []
            },
            
            // Feature flags
            features: {
                'generation': true,
                'refactoring': true,
                'explanation': true,
                'debugging': true,
                'translation': true,
                'comprehension': true,
                'validation': true,
                'exploration': true,
                'testing': true,
                'documentation': true,
                'visionSupport': {
                    enabled: true,
                    config: {
                        supportedFormats: ['png', 'jpg', 'jpeg', 'webp'],
                        maxImageSize: 20 * 1024 * 1024 // 20MB
                    }
                },
                'parallelExecution': {
                    enabled: true,
                    config: {
                        maxConcurrent: 5
                    }
                },
                'codeExecution': {
                    enabled: true,
                    config: {
                        languages: ['python', 'javascript']
                    }
                }
            }
        };
        
        // Register version migrations
        this._registerMigrations();
    }
    
    // Version management
    get apiVersion() {
        return '2.0.0';
    }
    
    get supportedApiVersions() {
        return ['1.0.0', '1.1.0', '2.0.0'];
    }
    
    // Initialize adapter
    async initialize(config = {}) {
        this.config = config;
        
        // Check if Gemini CLI is installed
        try {
            const { stdout } = await exec('gemini --version');
            const version = stdout.trim();
            console.log(`✅ Gemini CLI found: ${version}`);
            
            // Check CLI version compatibility
            if (!this._isCompatibleCLIVersion(version)) {
                console.warn(`⚠️ Gemini CLI version ${version} may not be fully compatible`);
                // Adjust capabilities based on version
                await this._adjustCapabilitiesForVersion(version);
            }
        } catch (error) {
            throw new Error(
                'Gemini CLI not found. Please install it:\n' +
                'npm install -g @google/gemini-cli\n' +
                'or\n' +
                'pip install gemini-cli'
            );
        }
        
        // Set up API key
        if (config.apiKey) {
            process.env.GEMINI_API_KEY = config.apiKey;
        } else if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not found in environment or config');
        }
        
        // Set default model
        this.model = config.model || 'gemini-pro';
        
        // Validate model capabilities
        await this._validateModelCapabilities();
        
        this.initialized = true;
        
        // Emit initialization event
        this.emit('adapter:initialized', {
            name: this.name,
            version: this.apiVersion,
            capabilities: this._capabilities
        });
        
        return true;
    }
    
    // Health check
    async healthCheck() {
        try {
            const { stdout } = await exec('gemini --version');
            const version = stdout.trim();
            
            // Test API connectivity
            const testCommand = 'gemini test-connection';
            const { stdout: testOutput } = await exec(testCommand, { timeout: 5000 });
            const apiConnected = testOutput.includes('Connected') || testOutput.includes('OK');
            
            // Check model availability
            const modelAvailable = await this._checkModelAvailability();
            
            return {
                healthy: apiConnected && modelAvailable,
                version,
                apiConnected,
                modelAvailable,
                model: this.model,
                capabilities: this._capabilities,
                lastCheck: new Date()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date()
            };
        }
    }
    
    // Shutdown
    async shutdown() {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
        
        this.initialized = false;
        
        this.emit('adapter:shutdown', {
            name: this.name,
            timestamp: new Date()
        });
    }
    
    // V2 execution with enhanced features
    async executeTaskV2(task) {
        const startTime = Date.now();
        
        try {
            // Check for vendor extensions
            const geminiExtensions = this.getVendorExtensions(task, 'gemini-cli');
            
            // Select execution strategy
            const strategy = geminiExtensions?.executionStrategy || 
                           this._selectBestStrategy(task);
            
            // Execute with selected strategy
            let result;
            switch (strategy) {
                case 'parallel':
                    result = await this.executeInParallel(task);
                    break;
                case 'streaming':
                    result = await this.executeWithStreaming(task);
                    break;
                case 'sequential':
                default:
                    result = await this.executeSequentially(task);
                    break;
            }
            
            // Record metrics
            const metrics = {
                duration: Date.now() - startTime,
                model: this.model,
                strategy,
                tokensUsed: result.tokensUsed || this._estimateTokens(result.output, task.description)
            };
            
            this.emit('task:completed', {
                taskId: task.id,
                metrics,
                strategy
            });
            
            return {
                ...result,
                metrics
            };
            
        } catch (error) {
            const metrics = {
                duration: Date.now() - startTime,
                failed: true
            };
            
            this.emit('task:failed', {
                taskId: task.id,
                error: error.message,
                metrics
            });
            
            throw error;
        }
    }
    
    // V1 execution for backward compatibility
    async executeTaskV1(task) {
        const startTime = Date.now();
        
        try {
            const command = this._buildCommandV1(task);
            const { stdout, stderr } = await exec(command);
            
            if (stderr && !stderr.includes('Warning')) {
                throw new Error(`Gemini CLI error: ${stderr}`);
            }
            
            const artifacts = this._parseOutputV1(stdout, task);
            
            return {
                taskId: task.id,
                status: 'completed',
                output: stdout,
                artifacts,
                metrics: {
                    duration: Date.now() - startTime,
                    model: this.model,
                    tokensUsed: this._estimateTokens(stdout, task.description)
                }
            };
        } catch (error) {
            return {
                taskId: task.id,
                status: 'failed',
                error: error.message,
                metrics: {
                    duration: Date.now() - startTime
                }
            };
        }
    }
    
    // Strategy implementations
    async executeSequentially(task) {
        const command = this._buildCommandV2(task);
        const { stdout, stderr } = await exec(command);
        
        if (stderr && !stderr.includes('Warning')) {
            throw new Error(`Gemini CLI error: ${stderr}`);
        }
        
        const artifacts = this._parseOutputV2(stdout, task);
        
        return {
            taskId: task.id,
            status: 'completed',
            output: stdout,
            artifacts,
            strategy: 'sequential'
        };
    }
    
    async executeInParallel(task) {
        if (!this.supportsFeature('parallelExecution')) {
            return this.executeSequentially(task);
        }
        
        // Split task into subtasks if possible
        const subtasks = this._splitTaskForParallel(task);
        
        if (subtasks.length <= 1) {
            return this.executeSequentially(task);
        }
        
        // Execute subtasks in parallel
        const promises = subtasks.map(subtask => 
            this._executeSubtask(subtask)
        );
        
        const results = await Promise.all(promises);
        
        // Merge results
        const merged = this._mergeParallelResults(results);
        
        return {
            taskId: task.id,
            status: 'completed',
            output: merged.output,
            artifacts: merged.artifacts,
            strategy: 'parallel',
            parallelTasks: results.length
        };
    }
    
    async executeWithStreaming(task) {
        if (!this.supportsFeature('streaming')) {
            return this.executeSequentially(task);
        }
        
        return new Promise((resolve, reject) => {
            const command = this._buildCommandV2(task, { streaming: true });
            const chunks = [];
            const artifacts = [];
            
            this.process = spawn('gemini', command.split(' ').slice(1), {
                env: process.env
            });
            
            this.process.stdout.on('data', (data) => {
                chunks.push(data);
                
                // Parse streaming artifacts
                const partialArtifacts = this._parseStreamingOutput(data.toString());
                if (partialArtifacts.length > 0) {
                    artifacts.push(...partialArtifacts);
                }
                
                // Emit streaming event
                this.emit('task:streaming', {
                    taskId: task.id,
                    chunk: data.toString()
                });
            });
            
            this.process.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Process exited with code ${code}`));
                } else {
                    const output = Buffer.concat(chunks).toString();
                    resolve({
                        taskId: task.id,
                        status: 'completed',
                        output,
                        artifacts,
                        strategy: 'streaming'
                    });
                }
                
                this.process = null;
            });
            
            this.process.on('error', (error) => {
                reject(error);
                this.process = null;
            });
        });
    }
    
    // Private helper methods
    _registerMigrations() {
        // Migration from 1.0.0 to 1.1.0
        this.registerMigration('1.0.0', '1.1.0', (task) => {
            // Add context structure if missing
            if (!task.context) {
                task.context = {
                    files: [],
                    content: task.content || ''
                };
                delete task.content;
            }
            return task;
        });
        
        // Migration from 1.1.0 to 2.0.0
        this.registerMigration('1.1.0', '2.0.0', (task) => {
            // Add extensions structure
            if (!task.extensions) {
                task.extensions = {};
            }
            
            // Migrate temperature to extension
            if (task.temperature !== undefined) {
                task.extensions['gemini-cli'] = {
                    ...task.extensions['gemini-cli'],
                    temperature: task.temperature
                };
                delete task.temperature;
            }
            
            return task;
        });
    }
    
    _isCompatibleCLIVersion(version) {
        // Check if CLI version is compatible
        const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
        if (!match) return false;
        
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);
        
        // Require at least version 2.0.0
        return major >= 2;
    }
    
    async _adjustCapabilitiesForVersion(version) {
        const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
        if (!match) return;
        
        const major = parseInt(match[1]);
        
        if (major < 2) {
            // Older versions don't support some features
            this._capabilities.features.parallelExecution = false;
            this._capabilities.features.codeExecution = false;
            this._capabilities.streaming = false;
            
            // Emit capability change
            this.emitCapabilityChange('parallelExecution', true, false);
            this.emitCapabilityChange('streaming', true, false);
        }
    }
    
    async _validateModelCapabilities() {
        // Check if selected model supports all advertised capabilities
        const modelCapabilities = {
            'gemini-pro': {
                maxTokens: 32768,
                vision: false
            },
            'gemini-pro-vision': {
                maxTokens: 16384,
                vision: true
            },
            'gemini-ultra': {
                maxTokens: 1000000,
                vision: true
            }
        };
        
        const modelCaps = modelCapabilities[this.model];
        if (modelCaps) {
            // Adjust token limit based on model
            if (modelCaps.maxTokens < this._capabilities.maxContextTokens) {
                this._capabilities.maxContextTokens = modelCaps.maxTokens;
            }
            
            // Adjust vision support
            if (!modelCaps.vision) {
                this._capabilities.features.visionSupport.enabled = false;
            }
        }
    }
    
    async _checkModelAvailability() {
        try {
            const command = `gemini list-models --format json`;
            const { stdout } = await exec(command);
            const models = JSON.parse(stdout);
            return models.includes(this.model);
        } catch {
            // Assume available if we can't check
            return true;
        }
    }
    
    _selectBestStrategy(task) {
        // Select strategy based on task characteristics
        if (task.context?.files?.length > 3 && this.supportsFeature('parallelExecution')) {
            return 'parallel';
        }
        
        if (task.type === 'generation' && task.description.length > 1000 && 
            this.supportsFeature('streaming')) {
            return 'streaming';
        }
        
        return 'sequential';
    }
    
    _buildCommandV2(task, options = {}) {
        let command = ['gemini'];
        
        // Map task types to Gemini commands
        const commandMap = {
            'comprehension': 'explain',
            'generation': 'generate',
            'validation': 'review',
            'exploration': 'analyze',
            'refactoring': 'refactor',
            'testing': 'test',
            'documentation': 'document'
        };
        
        command.push(commandMap[task.type] || 'query');
        
        // Add model selection
        command.push('--model', this.model);
        
        // Add context files
        if (task.context?.files?.length > 0) {
            command.push('--context', ...task.context.files);
        }
        
        // Add vendor extensions
        const extensions = this.getVendorExtensions(task, 'gemini-cli');
        if (extensions) {
            if (extensions.temperature !== undefined) {
                command.push('--temperature', extensions.temperature);
            }
            if (extensions.maxTokens) {
                command.push('--max-tokens', extensions.maxTokens);
            }
            if (extensions.topP !== undefined) {
                command.push('--top-p', extensions.topP);
            }
        }
        
        // Add streaming flag if requested
        if (options.streaming) {
            command.push('--stream');
        }
        
        // Add the prompt (properly escaped)
        const escapedPrompt = task.description.replace(/"/g, '\\"');
        command.push(`"${escapedPrompt}"`);
        
        // Add output format
        command.push('--format', 'json');
        
        return command.join(' ');
    }
    
    _buildCommandV1(task) {
        // Simplified V1 command building for backward compatibility
        let command = 'gemini';
        
        const commandMap = {
            'comprehension': 'explain',
            'generation': 'generate',
            'validation': 'review',
            'exploration': 'analyze'
        };
        
        command += ` ${commandMap[task.type] || 'query'}`;
        command += ` --model ${this.model}`;
        
        if (task.context?.files?.length > 0) {
            command += ` --context ${task.context.files.join(' ')}`;
        }
        
        if (task.temperature !== undefined) {
            command += ` --temperature ${task.temperature}`;
        }
        
        const escapedPrompt = task.description.replace(/"/g, '\\"');
        command += ` "${escapedPrompt}"`;
        command += ' --format json';
        
        return command;
    }
    
    _parseOutputV2(output, task) {
        const artifacts = [];
        
        try {
            const result = JSON.parse(output);
            
            // Enhanced parsing with metadata
            if (result.code) {
                artifacts.push({
                    type: 'code',
                    content: result.code,
                    language: result.language || 'plaintext',
                    filename: result.suggestedFilename || 'output.txt',
                    metadata: {
                        confidence: result.confidence,
                        alternatives: result.alternatives || []
                    }
                });
            }
            
            if (result.fileChanges) {
                result.fileChanges.forEach(change => {
                    artifacts.push({
                        type: 'file-change',
                        path: change.path,
                        content: change.content,
                        operation: change.operation,
                        metadata: {
                            diff: change.diff,
                            reasoning: change.reasoning
                        }
                    });
                });
            }
            
            if (result.explanation) {
                artifacts.push({
                    type: 'explanation',
                    content: result.explanation,
                    metadata: {
                        concepts: result.concepts || [],
                        references: result.references || []
                    }
                });
            }
            
            if (result.tests) {
                artifacts.push({
                    type: 'tests',
                    content: result.tests,
                    framework: result.testFramework || 'jest',
                    metadata: {
                        coverage: result.coverage,
                        testCount: result.testCount
                    }
                });
            }
            
            if (result.documentation) {
                artifacts.push({
                    type: 'documentation',
                    content: result.documentation,
                    format: result.docFormat || 'markdown',
                    metadata: {
                        sections: result.sections || []
                    }
                });
            }
            
        } catch (e) {
            // Fallback for non-JSON output
            artifacts.push({
                type: 'text',
                content: output
            });
        }
        
        return artifacts;
    }
    
    _parseOutputV1(output, task) {
        // Simplified V1 parsing
        const artifacts = [];
        
        try {
            const result = JSON.parse(output);
            
            if (result.code) {
                artifacts.push({
                    type: 'code',
                    content: result.code,
                    language: result.language || 'plaintext',
                    filename: result.suggestedFilename || 'output.txt'
                });
            }
            
            if (result.explanation) {
                artifacts.push({
                    type: 'explanation',
                    content: result.explanation
                });
            }
            
        } catch (e) {
            artifacts.push({
                type: 'text',
                content: output
            });
        }
        
        return artifacts;
    }
    
    _parseStreamingOutput(chunk) {
        const artifacts = [];
        
        // Look for artifact markers in streaming output
        const codeMatch = chunk.match(/```(\w+)?\n([\s\S]*?)```/g);
        if (codeMatch) {
            codeMatch.forEach(match => {
                const langMatch = match.match(/```(\w+)?\n/);
                const language = langMatch ? langMatch[1] : 'plaintext';
                const content = match.replace(/```\w*\n/, '').replace(/```$/, '');
                
                artifacts.push({
                    type: 'code',
                    content,
                    language,
                    streaming: true
                });
            });
        }
        
        return artifacts;
    }
    
    _splitTaskForParallel(task) {
        const subtasks = [];
        
        // Split by files if multiple files in context
        if (task.context?.files?.length > 1) {
            const filesPerTask = Math.ceil(task.context.files.length / 
                this._capabilities.features.parallelExecution.config.maxConcurrent);
            
            for (let i = 0; i < task.context.files.length; i += filesPerTask) {
                subtasks.push({
                    ...task,
                    id: `${task.id}-${i}`,
                    context: {
                        ...task.context,
                        files: task.context.files.slice(i, i + filesPerTask)
                    }
                });
            }
        }
        
        return subtasks.length > 0 ? subtasks : [task];
    }
    
    async _executeSubtask(subtask) {
        const command = this._buildCommandV2(subtask);
        const { stdout } = await exec(command);
        return {
            subtaskId: subtask.id,
            output: stdout,
            artifacts: this._parseOutputV2(stdout, subtask)
        };
    }
    
    _mergeParallelResults(results) {
        const output = results.map(r => r.output).join('\n---\n');
        const artifacts = results.flatMap(r => r.artifacts);
        
        return { output, artifacts };
    }
    
    _estimateTokens(output, input) {
        // Rough estimation: 1 token ≈ 4 characters
        const totalChars = (output.length + input.length);
        return Math.ceil(totalChars / 4);
    }
}

module.exports = GeminiCLIAdapterV2;