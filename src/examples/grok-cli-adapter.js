/**
 * Grok CLI Adapter for RepoChief
 * 
 * This adapter enables RepoChief to work with xAI's Grok CLI
 * for AI-powered code generation with real-time knowledge.
 */

const { spawn } = require('child_process');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

class GrokCLIAdapter {
    constructor() {
        this.name = 'grok-cli';
        this.version = '1.0.0';
        this.capabilities = {
            streaming: true,
            contextWindow: 100000,
            multiFile: true,
            languages: ['all'], // Grok supports all programming languages
            features: [
                'generation', 
                'refactoring', 
                'explanation', 
                'debugging',
                'real-time-knowledge', // Unique to Grok
                'humor-mode' // Grok's personality feature
            ],
            models: ['grok-1', 'grok-2']
        };
        
        this.process = null;
        this.config = {};
        this.conversationMode = false;
    }
    
    async initialize(config = {}) {
        this.config = config;
        
        // Check if Grok CLI is installed
        try {
            const { stdout } = await exec('grok --version');
            console.log(`✅ Grok CLI found: ${stdout.trim()}`);
        } catch (error) {
            throw new Error(
                'Grok CLI not found. Please install it:\n' +
                'pip install grok-cli\n' +
                'or\n' +
                'brew install grok-cli'
            );
        }
        
        // Set up API key
        if (config.apiKey) {
            process.env.GROK_API_KEY = config.apiKey;
        } else if (!process.env.GROK_API_KEY) {
            throw new Error('GROK_API_KEY not found in environment or config');
        }
        
        // Configure Grok's personality
        this.personality = config.personality || 'professional'; // professional, casual, humorous
        this.model = config.model || 'grok-2';
        
        return true;
    }
    
    async executeTask(task) {
        const startTime = Date.now();
        
        try {
            // Grok works best in conversation mode for complex tasks
            const useConversation = task.type === 'exploration' || task.multiStep;
            
            const command = this.buildCommand(task, useConversation);
            const { stdout, stderr } = await exec(command);
            
            if (stderr && !stderr.includes('Info:')) {
                throw new Error(`Grok CLI error: ${stderr}`);
            }
            
            const artifacts = this.parseGrokOutput(stdout, task);
            
            return {
                taskId: task.id,
                status: 'completed',
                output: stdout,
                artifacts,
                metrics: {
                    duration: Date.now() - startTime,
                    model: this.model,
                    personality: this.personality,
                    tokensUsed: this.estimateTokens(stdout, task.description),
                    realTimeData: this.extractRealTimeReferences(stdout)
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
    
    buildCommand(task, useConversation = false) {
        let command = 'grok';
        
        // Grok's command structure
        if (useConversation) {
            command += ' chat';
        } else {
            command += ' query';
        }
        
        // Add model
        command += ` --model ${this.model}`;
        
        // Add personality
        command += ` --personality ${this.personality}`;
        
        // Enable real-time knowledge if needed
        if (task.requiresCurrentInfo) {
            command += ' --real-time';
        }
        
        // Add context files
        if (task.context?.files?.length > 0) {
            command += ` --files ${task.context.files.join(',')}`;
        }
        
        // Add workspace root for better context
        if (task.workspaceRoot) {
            command += ` --workspace ${task.workspaceRoot}`;
        }
        
        // Temperature for creativity
        const temperature = task.temperature ?? 0.7;
        command += ` --temperature ${temperature}`;
        
        // The prompt
        const escapedPrompt = task.description.replace(/"/g, '\\"');
        command += ` "${escapedPrompt}"`;
        
        // Output format
        command += ' --output json';
        
        return command;
    }
    
    parseGrokOutput(output, task) {
        const artifacts = [];
        
        try {
            const result = JSON.parse(output);
            
            // Grok provides structured responses
            if (result.response) {
                // Code generation
                if (result.response.code) {
                    result.response.code.forEach(codeBlock => {
                        artifacts.push({
                            type: 'code',
                            content: codeBlock.content,
                            language: codeBlock.language,
                            filename: codeBlock.filename,
                            description: codeBlock.description
                        });
                    });
                }
                
                // Explanations with real-time context
                if (result.response.explanation) {
                    artifacts.push({
                        type: 'explanation',
                        content: result.response.explanation,
                        sources: result.response.sources || []
                    });
                }
                
                // Grok's unique insights
                if (result.response.insights) {
                    artifacts.push({
                        type: 'insights',
                        content: result.response.insights,
                        confidence: result.response.confidence
                    });
                }
                
                // Humor mode outputs
                if (result.response.humor && this.personality === 'humorous') {
                    artifacts.push({
                        type: 'humor',
                        content: result.response.humor
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
    
    extractRealTimeReferences(output) {
        // Grok includes real-time data references
        const references = [];
        const datePattern = /\b(today|yesterday|this week|recent)\b/gi;
        const urlPattern = /https?:\/\/[^\s]+/g;
        
        const dates = output.match(datePattern) || [];
        const urls = output.match(urlPattern) || [];
        
        return {
            temporalReferences: dates.length,
            urlReferences: urls.length,
            urls: urls.slice(0, 5) // First 5 URLs
        };
    }
    
    estimateTokens(output, input) {
        // Grok uses a similar tokenization to GPT models
        const totalChars = (output.length + input.length);
        return Math.ceil(totalChars / 4);
    }
    
    async streamOutput(callback) {
        // Grok supports streaming for long responses
        const streamProcess = spawn('grok', ['stream', '--format', 'line']);
        
        streamProcess.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            lines.forEach(line => {
                callback({
                    type: 'stdout',
                    content: line,
                    timestamp: new Date()
                });
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
            const { stdout: versionOutput } = await exec('grok --version');
            const version = versionOutput.trim();
            
            // Test API connectivity and real-time features
            const { stdout: statusOutput } = await exec('grok status --json');
            const status = JSON.parse(statusOutput);
            
            return {
                healthy: true,
                version,
                apiConnected: status.api_status === 'connected',
                realTimeEnabled: status.real_time_enabled,
                model: this.model,
                personality: this.personality,
                quotaRemaining: status.quota_remaining,
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
            personality: this.personality,
            conversationMode: this.conversationMode,
            capabilities: this.capabilities
        };
    }
    
    async shutdown() {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
        
        // Close any open conversations
        if (this.conversationMode) {
            await exec('grok chat --end');
            this.conversationMode = false;
        }
    }
}

module.exports = GrokCLIAdapter;