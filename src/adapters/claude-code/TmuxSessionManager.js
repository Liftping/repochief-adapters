/**
 * Tmux Session Manager for Claude Code Adapter
 * 
 * Manages tmux sessions for isolated Claude Code execution,
 * providing session lifecycle management and monitoring.
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const { EventEmitter } = require('events');

const execAsync = promisify(exec);

class TmuxSessionManager extends EventEmitter {
    constructor() {
        super();
        this.sessions = new Map();
        this.config = {};
        this.initialized = false;
    }
    
    async initialize(config = {}) {
        this.config = {
            sessionPrefix: config.sessionPrefix || 'repochief-claude',
            maxSessions: config.maxSessions || 10,
            sessionTimeout: config.sessionTimeout || 300000, // 5 minutes
            cleanupInterval: config.cleanupInterval || 60000,  // 1 minute
            ...config
        };
        
        // Start cleanup timer
        this.cleanupTimer = setInterval(() => {
            this.cleanupExpiredSessions();
        }, this.config.cleanupInterval);
        
        this.initialized = true;
        console.log('✅ TmuxSessionManager initialized');
    }
    
    async healthCheck() {
        try {
            // Check tmux server status
            const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo "no-sessions"');
            
            const activeSessions = this.sessions.size;
            const tmuxSessions = stdout.trim() === 'no-sessions' ? 0 : stdout.split('\n').length;
            
            return {
                healthy: true,
                activeSessions,
                tmuxSessions,
                maxSessions: this.config.maxSessions,
                lastCheck: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }
    
    async createSession(sessionId, options = {}) {
        if (this.sessions.has(sessionId)) {
            throw new Error(`Session ${sessionId} already exists`);
        }
        
        if (this.sessions.size >= this.config.maxSessions) {
            throw new Error(`Maximum sessions (${this.config.maxSessions}) reached`);
        }
        
        const {
            workingDirectory = process.cwd(),
            task = null,
            environment = {}
        } = options;
        
        try {
            // Create new tmux session in detached mode
            const createCommand = [
                'tmux', 'new-session',
                '-d',                           // detached
                '-s', sessionId,                // session name
                '-c', workingDirectory          // working directory
            ];
            
            await execAsync(createCommand.join(' '));
            
            // Set up session environment if provided
            for (const [key, value] of Object.entries(environment)) {
                await execAsync(`tmux set-environment -t ${sessionId} ${key} "${value}"`);
            }
            
            // Configure session settings
            await execAsync(`tmux set-option -t ${sessionId} remain-on-exit on`); // Keep session alive after command exit
            
            // Store session info
            const sessionInfo = {
                sessionId,
                task,
                workingDirectory,
                environment,
                createdAt: new Date(),
                lastActivity: new Date(),
                status: 'created',
                output: [],
                pid: null
            };
            
            this.sessions.set(sessionId, sessionInfo);
            
            this.emit('session:created', {
                sessionId,
                workingDirectory,
                timestamp: new Date()
            });
            
            console.log(`📋 Created tmux session: ${sessionId}`);
            return sessionInfo;
            
        } catch (error) {
            this.emit('session:error', {
                sessionId,
                phase: 'creation',
                error: error.message
            });
            throw new Error(`Failed to create tmux session ${sessionId}: ${error.message}`);
        }
    }
    
    async executeCommand(sessionId, command, options = {}) {
        const sessionInfo = this.sessions.get(sessionId);
        if (!sessionInfo) {
            throw new Error(`Session ${sessionId} not found`);
        }
        
        const {
            timeout = this.config.sessionTimeout,
            onProgress = null
        } = options;
        
        try {
            sessionInfo.status = 'executing';
            sessionInfo.lastActivity = new Date();
            
            // Send command to tmux session
            await execAsync(`tmux send-keys -t ${sessionId} "${command.replace(/"/g, '\\"')}" C-m`);
            
            // Monitor execution with timeout
            const startTime = Date.now();
            let lastOutputTime = startTime;
            const outputBuffer = [];
            
            return new Promise((resolve, reject) => {
                const checkInterval = 1000; // Check every second
                const progressInterval = setInterval(async () => {
                    try {
                        // Capture current pane content
                        const { stdout } = await execAsync(`tmux capture-pane -t ${sessionId} -p`);
                        
                        if (stdout !== sessionInfo.lastOutput) {
                            sessionInfo.lastOutput = stdout;
                            sessionInfo.lastActivity = new Date();
                            lastOutputTime = Date.now();
                            
                            // Add to output buffer
                            outputBuffer.push({
                                timestamp: new Date(),
                                content: stdout
                            });
                            
                            // Call progress callback if provided
                            if (onProgress) {
                                onProgress({
                                    sessionId,
                                    output: stdout,
                                    duration: Date.now() - startTime,
                                    status: 'running'
                                });
                            }
                        }
                        
                        // Check for command completion indicators
                        // This is heuristic - look for shell prompt or specific completion markers
                        if (this.isCommandComplete(stdout)) {
                            clearInterval(progressInterval);
                            
                            sessionInfo.status = 'completed';
                            sessionInfo.output = outputBuffer;
                            
                            resolve({
                                sessionId,
                                output: stdout,
                                outputBuffer,
                                duration: Date.now() - startTime,
                                status: 'completed'
                            });
                            return;
                        }
                        
                        // Check for timeout
                        if (Date.now() - startTime > timeout) {
                            clearInterval(progressInterval);
                            
                            sessionInfo.status = 'timeout';
                            
                            reject(new Error(`Command execution timeout after ${timeout}ms`));
                            return;
                        }
                        
                        // Check for inactivity timeout (no output change)
                        if (Date.now() - lastOutputTime > timeout / 2) {
                            console.warn(`⚠️  No output change for ${(Date.now() - lastOutputTime) / 1000}s in session ${sessionId}`);
                        }
                        
                    } catch (error) {
                        clearInterval(progressInterval);
                        sessionInfo.status = 'error';
                        reject(error);
                    }
                }, checkInterval);
                
                // Initial progress call
                if (onProgress) {
                    onProgress({
                        sessionId,
                        output: '',
                        duration: 0,
                        status: 'started'
                    });
                }
            });
            
        } catch (error) {
            sessionInfo.status = 'error';
            this.emit('session:error', {
                sessionId,
                phase: 'execution',
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Heuristic to detect command completion
     * This is imperfect but works for most cases
     */
    isCommandComplete(output) {
        const lines = output.split('\n');
        const lastLine = lines[lines.length - 1] || lines[lines.length - 2] || '';
        
        // Look for shell prompt indicators
        const promptIndicators = [
            /\$\s*$/,           // bash/sh prompt ending with $
            />\s*$/,            // zsh prompt ending with >
            /carlosleivacom.*\$/, // specific user prompt
            /repochief.*\$/,    // repochief workspace prompt
        ];
        
        // Look for Claude Code completion indicators
        const claudeIndicators = [
            /Task completed/i,
            /Operation finished/i,
            /Done\./,
            /✓/,
            /✅/
        ];
        
        // Check all indicators
        for (const pattern of [...promptIndicators, ...claudeIndicators]) {
            if (pattern.test(lastLine)) {
                return true;
            }
        }
        
        // If no clear completion indicator, assume still running
        return false;
    }
    
    async getSessionStatus(sessionId) {
        const sessionInfo = this.sessions.get(sessionId);
        if (!sessionInfo) {
            return { found: false };
        }
        
        try {
            // Check if tmux session still exists
            const { stdout } = await execAsync(`tmux list-sessions 2>/dev/null | grep "^${sessionId}:" || echo ""`);
            const tmuxExists = stdout.trim() !== '';
            
            // Get current pane content if session exists
            let currentOutput = '';
            if (tmuxExists) {
                try {
                    const { stdout: paneContent } = await execAsync(`tmux capture-pane -t ${sessionId} -p`);
                    currentOutput = paneContent;
                } catch (error) {
                    // Session might be in transition
                }
            }
            
            return {
                found: true,
                sessionId,
                status: sessionInfo.status,
                createdAt: sessionInfo.createdAt,
                lastActivity: sessionInfo.lastActivity,
                workingDirectory: sessionInfo.workingDirectory,
                tmuxExists,
                currentOutput,
                outputHistory: sessionInfo.output || []
            };
            
        } catch (error) {
            return {
                found: true,
                sessionId,
                error: error.message
            };
        }
    }
    
    async destroySession(sessionId) {
        const sessionInfo = this.sessions.get(sessionId);
        
        try {
            // Kill tmux session if it exists
            await execAsync(`tmux kill-session -t ${sessionId} 2>/dev/null || true`);
            
            // Remove from our tracking
            this.sessions.delete(sessionId);
            
            this.emit('session:destroyed', {
                sessionId,
                timestamp: new Date(),
                wasTracked: !!sessionInfo
            });
            
            console.log(`🗑️  Destroyed tmux session: ${sessionId}`);
            
        } catch (error) {
            this.emit('session:error', {
                sessionId,
                phase: 'destruction',
                error: error.message
            });
            console.warn(`Failed to destroy session ${sessionId}:`, error.message);
        }
    }
    
    async listSessions() {
        const sessions = [];
        
        for (const [sessionId, sessionInfo] of this.sessions.entries()) {
            const status = await this.getSessionStatus(sessionId);
            sessions.push({
                sessionId,
                ...sessionInfo,
                ...status
            });
        }
        
        return sessions;
    }
    
    async cleanupExpiredSessions() {
        const now = Date.now();
        const expiredSessions = [];
        
        for (const [sessionId, sessionInfo] of this.sessions.entries()) {
            const age = now - sessionInfo.lastActivity.getTime();
            
            if (age > this.config.sessionTimeout) {
                expiredSessions.push(sessionId);
            }
        }
        
        // Cleanup expired sessions
        for (const sessionId of expiredSessions) {
            console.log(`🕐 Cleaning up expired session: ${sessionId}`);
            await this.destroySession(sessionId);
        }
        
        return expiredSessions.length;
    }
    
    async shutdown() {
        try {
            // Clear cleanup timer
            if (this.cleanupTimer) {
                clearInterval(this.cleanupTimer);
                this.cleanupTimer = null;
            }
            
            // Destroy all tracked sessions
            const sessionIds = Array.from(this.sessions.keys());
            for (const sessionId of sessionIds) {
                await this.destroySession(sessionId);
            }
            
            this.sessions.clear();
            this.initialized = false;
            
            console.log('✅ TmuxSessionManager shutdown complete');
            
        } catch (error) {
            console.error('Error during TmuxSessionManager shutdown:', error);
            throw error;
        }
    }
}

module.exports = TmuxSessionManager;