/**
 * Gemini CLI Adapter for RepoChief
 * 
 * This adapter enables RepoChief to work with Google's Gemini CLI
 * for AI-powered code generation and analysis.
 */

const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

class GeminiCLIAdapter {
    constructor() {
        this.name = 'gemini-cli';
        this.version = '1.0.0';
        this.capabilities = {
            streaming: true,
            contextWindow: 1000000, // Gemini 1.5 Pro supports up to 1M tokens
            multiFile: true,
            languages: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c++'],
            features: ['generation', 'refactoring', 'explanation', 'debugging', 'translation'],
            models: ['gemini-pro', 'gemini-pro-vision', 'gemini-ultra']
        };
        
        this.process = null;
        this.config = {};
    }
    
    async initialize(config = {}) {
        this.config = config;
        
        // Check if Gemini CLI is installed
        try {
            const { stdout } = await exec('gemini --version');
            console.log(`✅ Gemini CLI found: ${stdout.trim()}`);
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
        
        return true;
    }
    
    async executeTask(task) {
        const startTime = Date.now();
        
        try {
            const command = this.buildCommand(task);
            const { stdout, stderr } = await exec(command);
            
            if (stderr && !stderr.includes('Warning')) {
                throw new Error(`Gemini CLI error: ${stderr}`);
            }
            
            const artifacts = this.parseOutput(stdout, task);
            
            return {
                taskId: task.id,
                status: 'completed',
                output: stdout,
                artifacts,
                metrics: {
                    duration: Date.now() - startTime,
                    model: this.model,
                    tokensUsed: this.estimateTokens(stdout, task.description)
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
        let command = 'gemini';
        
        // Map task types to Gemini commands
        const commandMap = {
            'comprehension': 'explain',
            'generation': 'generate',
            'validation': 'review',
            'exploration': 'analyze',
            'refactoring': 'refactor'
        };
        
        command += ` ${commandMap[task.type] || 'query'}`;
        
        // Add model selection
        command += ` --model ${this.model}`;
        
        // Add context files
        if (task.context?.files?.length > 0) {
            command += ` --context ${task.context.files.join(' ')}`;
        }
        
        // Add temperature for creativity control
        if (task.temperature !== undefined) {
            command += ` --temperature ${task.temperature}`;
        }
        
        // Add the prompt (properly escaped)
        const escapedPrompt = task.description.replace(/"/g, '\\"');
        command += ` "${escapedPrompt}"`;
        
        // Add output format
        command += ' --format json';
        
        return command;
    }
    
    parseOutput(output, task) {
        const artifacts = [];
        
        try {
            const result = JSON.parse(output);
            
            // Extract code blocks
            if (result.code) {
                artifacts.push({
                    type: 'code',
                    content: result.code,
                    language: result.language || 'plaintext',
                    filename: result.suggestedFilename || 'output.txt'
                });
            }
            
            // Extract file modifications
            if (result.fileChanges) {
                result.fileChanges.forEach(change => {
                    artifacts.push({
                        type: 'file-change',
                        path: change.path,
                        content: change.content,
                        operation: change.operation // create, modify, delete
                    });
                });
            }
            
            // Extract explanations
            if (result.explanation) {
                artifacts.push({
                    type: 'explanation',
                    content: result.explanation
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
    
    estimateTokens(output, input) {
        // Rough estimation: 1 token ≈ 4 characters
        const totalChars = (output.length + input.length);
        return Math.ceil(totalChars / 4);
    }
    
    async streamOutput(callback) {
        if (!this.process) {
            throw new Error('No active process for streaming');
        }
        
        this.process.stdout.on('data', (data) => {
            callback({
                type: 'stdout',
                content: data.toString(),
                timestamp: new Date()
            });
        });
        
        this.process.stderr.on('data', (data) => {
            callback({
                type: 'stderr',
                content: data.toString(),
                timestamp: new Date()
            });
        });
    }
    
    async cancelTask(taskId) {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }
    
    async healthCheck() {
        try {
            const { stdout } = await exec('gemini --version');
            const version = stdout.trim();
            
            // Test API connectivity
            const { stdout: testOutput } = await exec('gemini test-connection');
            const apiConnected = testOutput.includes('Connected');
            
            return {
                healthy: true,
                version,
                apiConnected,
                model: this.model,
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
            capabilities: this.capabilities
        };
    }
    
    async shutdown() {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }
}

module.exports = GeminiCLIAdapter;