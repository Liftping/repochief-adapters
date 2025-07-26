/**
 * Qwen CLI Adapter for RepoChief
 * 
 * This adapter enables RepoChief to work with Alibaba's Qwen CLI
 * for AI-powered code generation with multilingual and multimodal support.
 */

const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const fs = require('fs').promises;
const path = require('path');

class QwenCLIAdapter {
    constructor() {
        this.name = 'qwen-cli';
        this.version = '1.0.0';
        this.capabilities = {
            streaming: true,
            contextWindow: 32000, // Qwen supports 32K context
            multiFile: true,
            languages: ['all'], // Qwen excels at multilingual support
            features: [
                'generation', 
                'refactoring', 
                'explanation', 
                'debugging',
                'translation', // Strong multilingual translation
                'multimodal', // Can process images
                'code-execution' // Can execute code snippets
            ],
            special: [
                'image-understanding', // Process diagrams, UI mockups
                'multi-language', // Chinese, English, etc.
                'tool-calling', // Function calling capabilities
                'long-context' // Efficient long context processing
            ],
            models: ['qwen-plus', 'qwen-turbo', 'qwen-max']
        };
        
        this.process = null;
        this.config = {};
        this.toolMode = false;
    }
    
    async initialize(config = {}) {
        this.config = config;
        
        // Check if Qwen CLI is installed
        try {
            const { stdout } = await exec('qwen --version');
            console.log(`✅ Qwen CLI found: ${stdout.trim()}`);
        } catch (error) {
            throw new Error(
                'Qwen CLI not found. Please install it:\n' +
                'pip install qwen-cli\n' +
                'or visit: https://github.com/QwenLM/qwen-cli'
            );
        }
        
        // Set up API key
        if (config.apiKey) {
            process.env.QWEN_API_KEY = config.apiKey;
        } else if (!process.env.QWEN_API_KEY) {
            throw new Error('QWEN_API_KEY not found in environment or config');
        }
        
        // Configure model and features
        this.model = config.model || 'qwen-plus';
        this.language = config.language || 'en'; // Default to English
        this.enableTools = config.enableTools || false;
        
        // Initialize tool definitions if enabled
        if (this.enableTools) {
            await this.initializeTools();
        }
        
        return true;
    }
    
    async initializeTools() {
        // Define available tools for Qwen's function calling
        this.tools = [
            {
                name: 'execute_code',
                description: 'Execute code snippets safely',
                parameters: {
                    language: 'string',
                    code: 'string'
                }
            },
            {
                name: 'search_documentation',
                description: 'Search technical documentation',
                parameters: {
                    query: 'string',
                    source: 'string'
                }
            }
        ];
    }
    
    async executeTask(task) {
        const startTime = Date.now();
        
        try {
            // Handle multimodal tasks
            if (task.attachments?.images?.length > 0) {
                return await this.executeMultimodalTask(task);
            }
            
            // Handle code execution tasks
            if (task.requiresExecution) {
                return await this.executeWithCodeRun(task);
            }
            
            // Standard text-based task
            const command = this.buildCommand(task);
            const { stdout, stderr } = await exec(command);
            
            if (stderr && !stderr.includes('Info:')) {
                throw new Error(`Qwen CLI error: ${stderr}`);
            }
            
            const artifacts = await this.parseQwenOutput(stdout, task);
            
            return {
                taskId: task.id,
                status: 'completed',
                output: stdout,
                artifacts,
                metrics: {
                    duration: Date.now() - startTime,
                    model: this.model,
                    language: this.language,
                    tokensUsed: this.estimateTokens(stdout, task.description),
                    multimodal: task.attachments?.images?.length > 0,
                    toolsUsed: this.extractToolCalls(stdout)
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
    
    buildCommand(task) {
        let command = 'qwen';
        
        // Qwen command structure
        switch (task.type) {
            case 'generation':
                command += ' generate';
                break;
            case 'refactoring':
                command += ' refactor';
                break;
            case 'validation':
                command += ' analyze';
                break;
            case 'exploration':
                command += ' explore';
                break;
            default:
                command += ' chat';
        }
        
        // Add model
        command += ` --model ${this.model}`;
        
        // Language preference
        command += ` --language ${this.language}`;
        
        // Enable tool calling if configured
        if (this.enableTools) {
            command += ' --enable-tools';
            command += ` --tools '${JSON.stringify(this.tools)}'`;
        }
        
        // Add context files
        if (task.context?.files?.length > 0) {
            command += ` --context-files ${task.context.files.join(',')}`
        }
        
        // Add workspace for better understanding
        if (task.workspaceRoot) {
            command += ` --workspace ${task.workspaceRoot}`;
        }
        
        // Temperature for creativity
        const temperature = task.temperature ?? 0.7;
        command += ` --temperature ${temperature}`;
        
        // Long context optimization
        if (task.requiresLongContext) {
            command += ' --optimize-long-context';
        }
        
        // The prompt (with proper escaping)
        const escapedPrompt = task.description.replace(/"/g, '\\"');
        command += ` --prompt "${escapedPrompt}"`;
        
        // Output format
        command += ' --format json';
        
        return command;
    }
    
    async executeMultimodalTask(task) {
        const startTime = Date.now();
        
        try {
            // Prepare multimodal command
            let command = `qwen vision --model ${this.model}`;
            
            // Add images
            command += ` --images ${task.attachments.images.join(',')}`;
            
            // Add prompt
            const escapedPrompt = task.description.replace(/"/g, '\\"');
            command += ` --prompt "${escapedPrompt}"`;
            
            // Add context if provided
            if (task.context?.files?.length > 0) {
                command += ` --context-files ${task.context.files.join(',')}`;
            }
            
            const { stdout, stderr } = await exec(command);
            
            if (stderr && !stderr.includes('Info:')) {
                throw new Error(`Qwen Vision error: ${stderr}`);
            }
            
            const artifacts = await this.parseMultimodalOutput(stdout, task);
            
            return {
                taskId: task.id,
                status: 'completed',
                output: stdout,
                artifacts,
                metrics: {
                    duration: Date.now() - startTime,
                    model: this.model,
                    multimodal: true,
                    imagesProcessed: task.attachments.images.length,
                    tokensUsed: this.estimateTokens(stdout, task.description)
                }
            };
        } catch (error) {
            return {
                taskId: task.id,
                status: 'failed',
                error: error.message,
                metrics: {
                    duration: Date.now() - startTime,
                    multimodal: true
                }
            };
        }
    }
    
    async executeWithCodeRun(task) {
        const startTime = Date.now();
        
        try {
            // Execute with code runner enabled
            let command = `qwen execute --model ${this.model}`;
            command += ' --safe-mode'; // Always use safe mode for code execution
            
            const escapedPrompt = task.description.replace(/"/g, '\\"');
            command += ` --prompt "${escapedPrompt}"`;
            
            const { stdout, stderr } = await exec(command);
            
            const artifacts = await this.parseExecutionOutput(stdout, task);
            
            return {
                taskId: task.id,
                status: 'completed',
                output: stdout,
                artifacts,
                metrics: {
                    duration: Date.now() - startTime,
                    model: this.model,
                    codeExecuted: true,
                    tokensUsed: this.estimateTokens(stdout, task.description)
                }
            };
        } catch (error) {
            return {
                taskId: task.id,
                status: 'failed',
                error: error.message,
                metrics: {
                    duration: Date.now() - startTime,
                    codeExecuted: true
                }
            };
        }
    }
    
    async parseQwenOutput(output, task) {
        const artifacts = [];
        
        try {
            const result = JSON.parse(output);
            
            // Qwen provides structured responses
            if (result.response) {
                // Code generation
                if (result.response.code) {
                    result.response.code.forEach(codeBlock => {
                        artifacts.push({
                            type: 'code',
                            content: codeBlock.content,
                            language: codeBlock.language,
                            filename: codeBlock.filename,
                            description: codeBlock.description,
                            confidence: codeBlock.confidence || 0.95
                        });
                    });
                }
                
                // Multilingual content
                if (result.response.translations) {
                    artifacts.push({
                        type: 'translation',
                        content: result.response.translations,
                        sourceLanguage: result.response.sourceLanguage,
                        targetLanguages: result.response.targetLanguages
                    });
                }
                
                // Tool calls
                if (result.response.toolCalls) {
                    result.response.toolCalls.forEach(call => {
                        artifacts.push({
                            type: 'tool-call',
                            tool: call.tool,
                            parameters: call.parameters,
                            result: call.result
                        });
                    });
                }
                
                // Analysis and explanations
                if (result.response.analysis) {
                    artifacts.push({
                        type: 'analysis',
                        content: result.response.analysis,
                        language: result.response.language || 'en'
                    });
                }
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
    
    async parseMultimodalOutput(output, task) {
        const artifacts = [];
        
        try {
            const result = JSON.parse(output);
            
            // Image understanding results
            if (result.imageAnalysis) {
                artifacts.push({
                    type: 'image-analysis',
                    content: result.imageAnalysis,
                    detectedElements: result.detectedElements || [],
                    suggestions: result.suggestions || []
                });
            }
            
            // Generated code based on images
            if (result.generatedCode) {
                artifacts.push({
                    type: 'code-from-image',
                    content: result.generatedCode,
                    language: result.language || 'html',
                    description: 'Code generated from visual input'
                });
            }
            
        } catch (e) {
            artifacts.push({
                type: 'multimodal-text',
                content: output
            });
        }
        
        return artifacts;
    }
    
    async parseExecutionOutput(output, task) {
        const artifacts = [];
        
        try {
            const result = JSON.parse(output);
            
            // Execution results
            if (result.execution) {
                artifacts.push({
                    type: 'execution-result',
                    code: result.execution.code,
                    output: result.execution.output,
                    exitCode: result.execution.exitCode,
                    runtime: result.execution.runtime
                });
            }
            
            // Any fixes or improvements
            if (result.improvements) {
                artifacts.push({
                    type: 'code-improvement',
                    original: result.improvements.original,
                    improved: result.improvements.improved,
                    explanation: result.improvements.explanation
                });
            }
            
        } catch (e) {
            artifacts.push({
                type: 'execution-text',
                content: output
            });
        }
        
        return artifacts;
    }
    
    extractToolCalls(output) {
        try {
            const parsed = JSON.parse(output);
            return parsed.response?.toolCalls?.map(call => call.tool) || [];
        } catch (e) {
            return [];
        }
    }
    
    estimateTokens(output, input) {
        // Qwen uses similar tokenization to GPT models
        // but is more efficient with Chinese text
        const totalChars = (output.length + input.length);
        
        // Check if text contains Chinese characters
        const chineseRegex = /[\u4e00-\u9fa5]/;
        const hasChinese = chineseRegex.test(output + input);
        
        // Chinese characters typically use fewer tokens
        const divisor = hasChinese ? 2 : 4;
        return Math.ceil(totalChars / divisor);
    }
    
    async streamOutput(callback) {
        // Qwen supports streaming for long responses
        const streamProcess = spawn('qwen', [
            'stream',
            '--model', this.model,
            '--format', 'line'
        ]);
        
        streamProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            lines.forEach(line => {
                try {
                    const parsed = JSON.parse(line);
                    callback({
                        type: 'stdout',
                        content: parsed.content || line,
                        timestamp: new Date(),
                        partial: parsed.partial || false
                    });
                } catch (e) {
                    callback({
                        type: 'stdout',
                        content: line,
                        timestamp: new Date()
                    });
                }
            });
        });
        
        streamProcess.stderr.on('data', (data) => {
            callback({
                type: 'stderr',
                content: data.toString(),
                timestamp: new Date()
            });
        });
        
        this.process = streamProcess;
    }
    
    async cancelTask(taskId) {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }
    
    async healthCheck() {
        try {
            const { stdout: versionOutput } = await exec('qwen --version');
            const version = versionOutput.trim();
            
            // Test API connectivity and features
            const { stdout: statusOutput } = await exec('qwen status --json');
            const status = JSON.parse(statusOutput);
            
            return {
                healthy: true,
                version,
                apiConnected: status.api_status === 'connected',
                model: this.model,
                language: this.language,
                multimodalEnabled: status.features?.includes('vision'),
                toolsEnabled: this.enableTools,
                availableModels: status.available_models || [],
                quotaRemaining: status.quota?.remaining,
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
    
    getStatus() {
        return {
            name: this.name,
            active: this.process !== null,
            model: this.model,
            language: this.language,
            toolMode: this.enableTools,
            capabilities: this.capabilities
        };
    }
    
    async shutdown() {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
        
        // Clean up any temporary files created for multimodal processing
        if (this.tempDir) {
            try {
                await fs.rmdir(this.tempDir, { recursive: true });
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }
}

module.exports = QwenCLIAdapter;