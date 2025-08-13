/**
 * Claude Code Adapter for RepoCHief
 * 
 * This adapter enables RepoCHief to orchestrate Claude Code locally
 * via tmux sessions, providing the hybrid cloud-local execution model.
 */

const AIAgentAdapter = require('../../base/AIAgentAdapter');
const TmuxSessionManager = require('./TmuxSessionManager');
const CommandBuilder = require('./CommandBuilder');
const ResultsParser = require('./ResultsParser');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

class ClaudeCodeAdapter extends AIAgentAdapter {
    constructor() {
        super();
        this.name = 'claude-code';
        this.initialized = false;
        
        // Initialize capabilities
        this._capabilities = {
            maxContextTokens: 200000, // Claude Code context limit
            supportedLanguages: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c++', 'bash', 'sql', 'html', 'css'],
            multiFile: true,
            streaming: true,
            
            // Claude Code specific capabilities
            subAgents: {
                supported: false, // Claude Code works with single agent
                maxConcurrent: 1,
                delegationTypes: []
            },
            
            features: {
                tmuxExecution: { enabled: true, config: { maxSessions: 10 } },
                localExecution: { enabled: true, config: { workspaceRequired: true } },
                scheduleIntegration: { enabled: true, config: { supportsTemplates: true } },
                deviceAuth: { enabled: true, config: { requiresRegistration: true } },
                realTimeProgress: { enabled: true, config: { updateInterval: 1000 } },
                resultCapture: { enabled: true, config: { includeArtifacts: true } }
            }
        };
        
        // Initialize managers
        this.tmuxManager = new TmuxSessionManager();
        this.commandBuilder = new CommandBuilder();
        this.resultsParser = new ResultsParser();
        
        // State tracking
        this.activeSessions = new Map();
        this.config = {};
    }
    
    // Version management
    get apiVersion() {
        return '1.0.77'; // Based on detected Claude Code version
    }
    
    get adapterVersion() {
        return '1.0.0';
    }
    
    get supportedApiVersions() {
        return ['1.0.x']; // Support 1.0 series
    }
    
    // Initialization
    async initialize(config = {}) {
        this.config = {
            workspaceRoot: config.workspaceRoot || process.cwd(),
            sessionPrefix: config.sessionPrefix || 'repochief-claude',
            timeoutMs: config.timeoutMs || 300000, // 5 minutes default
            maxSessions: config.maxSessions || 10,
            deviceId: config.deviceId || null,
            ...config
        };
        
        try {
            // Validate Claude Code installation
            await this.validateClaudeCode();
            
            // Validate tmux availability
            await this.validateTmux();
            
            // Initialize tmux manager
            await this.tmuxManager.initialize(this.config);
            
            // Validate workspace access
            await this.validateWorkspace();
            
            this.initialized = true;
            this.emit('adapter:initialized', {
                adapter: this.name,
                version: this.adapterVersion,
                capabilities: this._capabilities
            });
            
            return true;
            
        } catch (error) {
            this.emit('adapter:error', {
                phase: 'initialization',
                error: error.message
            });
            throw error;
        }
    }
    
    async validateClaudeCode() {
        try {
            const { stdout } = await execAsync('claude --version');
            const version = stdout.trim();
            
            // Update API version based on actual installation
            const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
            if (versionMatch) {
                this._apiVersion = versionMatch[1];
            }
            
            console.log(`✅ Claude Code found: ${version}`);
            return { version, available: true };
            
        } catch (error) {
            throw new Error(
                'Claude Code CLI not found. Please install Claude Code:\n' +
                'Visit https://claude.ai/download for installation instructions'
            );
        }
    }
    
    async validateTmux() {
        try {
            const { stdout } = await execAsync('tmux -V');
            const version = stdout.trim();
            console.log(`✅ tmux found: ${version}`);
            return { version, available: true };
            
        } catch (error) {
            throw new Error(
                'tmux not found. Please install tmux:\n' +
                'sudo apt-get install tmux  # Ubuntu/Debian\n' +
                'brew install tmux         # macOS'
            );
        }
    }
    
    async validateWorkspace() {
        const workspace = this.config.workspaceRoot;
        
        if (!fs.existsSync(workspace)) {
            throw new Error(`Workspace directory not found: ${workspace}`);
        }
        
        // Check if workspace is readable/writable
        try {
            await fs.promises.access(workspace, fs.constants.R_OK | fs.constants.W_OK);
            console.log(`✅ Workspace validated: ${workspace}`);
        } catch (error) {
            throw new Error(`Workspace not accessible: ${workspace}`);
        }
    }
    
    // Health check
    async healthCheck() {
        try {
            const checks = await Promise.all([
                this.validateClaudeCode(),
                this.validateTmux(),
                this.tmuxManager.healthCheck()
            ]);
            
            const activeSessions = this.activeSessions.size;
            const maxSessions = this.config.maxSessions;
            
            return {
                healthy: true,
                adapter: this.name,
                version: this.adapterVersion,
                apiVersion: this.apiVersion,
                checks: {
                    claudeCode: checks[0],
                    tmux: checks[1],
                    sessionManager: checks[2]
                },
                sessions: {
                    active: activeSessions,
                    max: maxSessions,
                    available: maxSessions - activeSessions
                },
                workspace: this.config.workspaceRoot,
                lastCheck: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                adapter: this.name,
                lastCheck: new Date().toISOString()
            };
        }
    }
    
    // Task execution - V1 implementation
    async executeTaskV1(task) {
        if (!this.initialized) {
            throw new Error('Adapter not initialized');
        }
        
        const sessionId = `${this.config.sessionPrefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        try {
            // Create tmux session for isolated execution
            const session = await this.tmuxManager.createSession(sessionId, {
                workingDirectory: this.config.workspaceRoot,
                task: task
            });
            
            this.activeSessions.set(sessionId, {
                session,
                task,
                startTime,
                status: 'running'
            });
            
            // Build Claude Code command
            const command = this.commandBuilder.buildCommand(task, {
                workspaceRoot: this.config.workspaceRoot,
                sessionId
            });
            
            // Execute command in tmux session
            const executionResult = await this.tmuxManager.executeCommand(sessionId, command, {
                timeout: this.config.timeoutMs,
                onProgress: (progress) => {
                    this.emit('task:progress', {
                        taskId: task.id,
                        sessionId,
                        progress
                    });
                }
            });
            
            // Parse results
            const results = await this.resultsParser.parseResults(executionResult, task);
            
            // Update session status
            const sessionInfo = this.activeSessions.get(sessionId);
            if (sessionInfo) {
                sessionInfo.status = 'completed';
                sessionInfo.results = results;
            }
            
            // Emit completion event
            this.emit('task:completed', {
                taskId: task.id,
                sessionId,
                duration: Date.now() - startTime,
                results
            });
            
            return {
                taskId: task.id,
                sessionId,
                status: 'completed',
                output: results.output,
                artifacts: results.artifacts,
                metrics: {
                    duration: Date.now() - startTime,
                    adapter: this.name,
                    apiVersion: this.apiVersion,
                    sessionManager: 'tmux',
                    workspaceRoot: this.config.workspaceRoot
                }
            };
            
        } catch (error) {
            // Update session status
            const sessionInfo = this.activeSessions.get(sessionId);
            if (sessionInfo) {
                sessionInfo.status = 'failed';
                sessionInfo.error = error.message;
            }
            
            // Emit error event
            this.emit('task:failed', {
                taskId: task.id,
                sessionId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                taskId: task.id,
                sessionId,
                status: 'failed',
                error: error.message,
                metrics: {
                    duration: Date.now() - startTime,
                    adapter: this.name
                }
            };
            
        } finally {
            // Clean up session after delay (keep for debugging if needed)
            setTimeout(async () => {
                try {
                    await this.tmuxManager.destroySession(sessionId);
                    this.activeSessions.delete(sessionId);
                } catch (cleanupError) {
                    console.warn(`Failed to cleanup session ${sessionId}:`, cleanupError.message);
                }
            }, 30000); // Keep for 30 seconds
        }
    }
    
    // Session management
    async listActiveSessions() {
        const sessions = [];
        for (const [sessionId, info] of this.activeSessions.entries()) {
            sessions.push({
                sessionId,
                taskId: info.task.id,
                status: info.status,
                startTime: info.startTime,
                duration: Date.now() - info.startTime
            });
        }
        return sessions;
    }
    
    async getSessionStatus(sessionId) {
        const sessionInfo = this.activeSessions.get(sessionId);
        if (!sessionInfo) {
            return { found: false };
        }
        
        const tmuxStatus = await this.tmuxManager.getSessionStatus(sessionId);
        
        return {
            found: true,
            sessionId,
            taskId: sessionInfo.task.id,
            status: sessionInfo.status,
            startTime: sessionInfo.startTime,
            duration: Date.now() - sessionInfo.startTime,
            tmux: tmuxStatus,
            results: sessionInfo.results || null
        };
    }
    
    async cancelTask(sessionId) {
        const sessionInfo = this.activeSessions.get(sessionId);
        if (!sessionInfo) {
            return { found: false };
        }
        
        try {
            await this.tmuxManager.destroySession(sessionId);
            sessionInfo.status = 'cancelled';
            
            this.emit('task:cancelled', {
                taskId: sessionInfo.task.id,
                sessionId
            });
            
            return { found: true, cancelled: true };
            
        } catch (error) {
            return { found: true, cancelled: false, error: error.message };
        }
    }
    
    // Graceful degradation strategies - implement required methods
    async executeSequentially(task) {
        // Default implementation that uses executeTaskV1
        return await this.executeTaskV1(task);
    }
    
    // Template support for schedule integration
    async executeTemplate(templateName, parameters = {}) {
        // Build task from template
        const task = this.commandBuilder.buildTaskFromTemplate(templateName, parameters);
        return await this.executeTaskV1(task);
    }
    
    // Shutdown
    async shutdown() {
        try {
            // Cancel all active sessions
            const cancelPromises = Array.from(this.activeSessions.keys()).map(
                sessionId => this.cancelTask(sessionId)
            );
            await Promise.all(cancelPromises);
            
            // Shutdown tmux manager
            await this.tmuxManager.shutdown();
            
            this.initialized = false;
            this.activeSessions.clear();
            
            this.emit('adapter:shutdown', {
                adapter: this.name
            });
            
        } catch (error) {
            this.emit('adapter:error', {
                phase: 'shutdown',
                error: error.message
            });
            throw error;
        }
    }
}

module.exports = ClaudeCodeAdapter;