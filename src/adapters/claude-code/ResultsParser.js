/**
 * Results Parser for Claude Code Adapter
 * 
 * Parses and formats Claude Code output for RepoCHief cloud reporting,
 * handling various output formats and extracting artifacts.
 */

const fs = require('fs');
const path = require('path');

class ResultsParser {
    constructor() {
        this.artifactExtractors = new Map();
        this.initializeExtractors();
    }
    
    /**
     * Initialize artifact extractors for different content types
     */
    initializeExtractors() {
        // Code block extractor
        this.artifactExtractors.set('code', (content) => {
            const codeBlocks = [];
            const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
            let match;
            
            while ((match = codeBlockRegex.exec(content)) !== null) {
                codeBlocks.push({
                    type: 'code',
                    language: match[1] || 'plaintext',
                    content: match[2].trim(),
                    size: match[2].length
                });
            }
            
            return codeBlocks;
        });
        
        // File modification extractor
        this.artifactExtractors.set('fileModifications', (content) => {
            const modifications = [];
            
            // Look for file creation/modification patterns
            const filePatterns = [
                /(?:create|modify|update)\s+file[:\s]+([^\n]+)/gi,
                /(?:file|path)[:\s]+([^\n]+)/gi,
                /```[\w]*\s*\/\/ ([^\n]+)/gi
            ];
            
            for (const pattern of filePatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const filePath = match[1].trim();
                    if (this.isValidFilePath(filePath)) {
                        modifications.push({
                            type: 'file-modification',
                            path: filePath,
                            operation: 'unknown'
                        });
                    }
                }
            }
            
            return modifications;
        });
        
        // Security finding extractor
        this.artifactExtractors.set('securityFindings', (content) => {
            const findings = [];
            
            // Look for security-related patterns
            const securityPatterns = [
                /(?:vulnerability|security issue|risk)[:\s]+([^\n]+)/gi,
                /(?:critical|high|medium|low)\s+(?:severity|priority)[:\s]+([^\n]+)/gi
            ];
            
            for (const pattern of securityPatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    findings.push({
                        type: 'security-finding',
                        description: match[1].trim(),
                        severity: this.extractSeverity(match[0])
                    });
                }
            }
            
            return findings;
        });
        
        // Tech debt extractor
        this.artifactExtractors.set('techDebt', (content) => {
            const debtItems = [];
            
            // Look for tech debt patterns
            const debtPatterns = [
                /(?:tech debt|technical debt|refactor)[:\s]+([^\n]+)/gi,
                /(?:improve|optimize|cleanup)[:\s]+([^\n]+)/gi
            ];
            
            for (const pattern of debtPatterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    debtItems.push({
                        type: 'tech-debt',
                        description: match[1].trim(),
                        priority: this.extractPriority(match[0])
                    });
                }
            }
            
            return debtItems;
        });
    }
    
    /**
     * Parse execution results from Claude Code
     */
    async parseResults(executionResult, task) {
        const {
            output = '',
            outputBuffer = [],
            duration = 0,
            status = 'unknown'
        } = executionResult;
        
        try {
            // Try to parse as JSON first (for structured outputs)
            let structuredData = null;
            const jsonMatch = this.extractJson(output);
            if (jsonMatch) {
                try {
                    structuredData = JSON.parse(jsonMatch);
                } catch (jsonError) {
                    console.warn('Failed to parse extracted JSON:', jsonError.message);
                }
            }
            
            // Extract artifacts based on task type
            const artifacts = await this.extractArtifacts(output, task);
            
            // Generate summary
            const summary = this.generateSummary(output, task, artifacts);
            
            // Calculate metrics
            const metrics = this.calculateMetrics(output, duration, outputBuffer);
            
            // Format for cloud reporting
            const results = {
                taskId: task.id,
                taskType: task.type,
                template: task.template || null,
                status,
                output: this.cleanOutput(output),
                structuredData,
                artifacts,
                summary,
                metrics,
                timestamp: new Date().toISOString()
            };
            
            return results;
            
        } catch (error) {
            console.error('Error parsing results:', error);
            
            // Return basic results on parsing failure
            return {
                taskId: task.id,
                taskType: task.type,
                status: 'parsing_error',
                output: this.cleanOutput(output),
                error: error.message,
                artifacts: [],
                metrics: {
                    duration,
                    outputLength: output.length
                },
                timestamp: new Date().toISOString()
            };
        }
    }
    
    /**
     * Extract artifacts based on content and task type
     */
    async extractArtifacts(content, task) {
        const artifacts = [];
        
        // Extract code blocks
        const codeBlocks = this.artifactExtractors.get('code')(content);
        artifacts.push(...codeBlocks);
        
        // Extract file modifications
        const fileModifications = this.artifactExtractors.get('fileModifications')(content);
        artifacts.push(...fileModifications);
        
        // Task-specific extractions
        switch (task.type) {
            case 'security_audit':
            case 'security_scan':
                const securityFindings = this.artifactExtractors.get('securityFindings')(content);
                artifacts.push(...securityFindings);
                break;
                
            case 'tech_debt_analysis':
            case 'technical_debt':
                const techDebtItems = this.artifactExtractors.get('techDebt')(content);
                artifacts.push(...techDebtItems);
                break;
        }
        
        // Extract recommendations/suggestions
        const recommendations = this.extractRecommendations(content);
        artifacts.push(...recommendations);
        
        // Extract file references
        const fileReferences = this.extractFileReferences(content);
        artifacts.push(...fileReferences);
        
        return artifacts;
    }
    
    /**
     * Extract JSON content from output
     */
    extractJson(content) {
        // Look for JSON blocks
        const jsonPatterns = [
            /```json\n([\s\S]*?)\n```/g,
            /```\n(\{[\s\S]*?\})\n```/g,
            /(\{[\s\S]*?\})(?:\n|$)/g
        ];
        
        for (const pattern of jsonPatterns) {
            const match = pattern.exec(content);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }
    
    /**
     * Extract recommendations from content
     */
    extractRecommendations(content) {
        const recommendations = [];
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Look for recommendation indicators
            if (/(?:recommend|suggest|should|consider)/i.test(line)) {
                recommendations.push({
                    type: 'recommendation',
                    content: line.trim(),
                    lineNumber: i + 1
                });
            }
        }
        
        return recommendations;
    }
    
    /**
     * Extract file references from content
     */
    extractFileReferences(content) {
        const fileReferences = [];
        
        // Pattern to match file paths
        const filePathPattern = /(?:^|[\s:])([^\s]+\.(js|ts|py|java|go|rs|cpp|c|h|md|json|yml|yaml|xml|html|css))(?:\s|:|$)/gm;
        let match;
        
        while ((match = filePathPattern.exec(content)) !== null) {
            const filePath = match[1];
            if (this.isValidFilePath(filePath)) {
                fileReferences.push({
                    type: 'file-reference',
                    path: filePath,
                    context: match[0].trim()
                });
            }
        }
        
        return fileReferences;
    }
    
    /**
     * Generate summary of results
     */
    generateSummary(output, task, artifacts) {
        const summary = {
            taskType: task.type,
            template: task.template,
            outputLength: output.length,
            artifactCount: artifacts.length,
            artifactTypes: [...new Set(artifacts.map(a => a.type))],
            hasStructuredData: this.extractJson(output) !== null,
            keyFindings: []
        };
        
        // Extract key findings based on task type
        switch (task.type) {
            case 'security_audit':
                summary.keyFindings = artifacts
                    .filter(a => a.type === 'security-finding')
                    .slice(0, 5)
                    .map(a => a.description);
                break;
                
            case 'tech_debt_analysis':
                summary.keyFindings = artifacts
                    .filter(a => a.type === 'tech-debt')
                    .slice(0, 5)
                    .map(a => a.description);
                break;
                
            default:
                summary.keyFindings = artifacts
                    .filter(a => a.type === 'recommendation')
                    .slice(0, 3)
                    .map(a => a.content);
        }
        
        return summary;
    }
    
    /**
     * Calculate metrics from output
     */
    calculateMetrics(output, duration, outputBuffer) {
        const metrics = {
            duration,
            outputLength: output.length,
            wordCount: output.split(/\s+/).length,
            lineCount: output.split('\n').length,
            bufferEntries: outputBuffer.length
        };
        
        // Calculate tokens estimate (rough)
        metrics.estimatedTokens = Math.ceil(output.length / 4);
        
        // Calculate progress metrics
        if (outputBuffer.length > 1) {
            const firstEntry = outputBuffer[0];
            const lastEntry = outputBuffer[outputBuffer.length - 1];
            metrics.progressDuration = new Date(lastEntry.timestamp) - new Date(firstEntry.timestamp);
            metrics.averageUpdateInterval = metrics.progressDuration / outputBuffer.length;
        }
        
        return metrics;
    }
    
    /**
     * Clean output for cloud reporting
     */
    cleanOutput(output) {
        // Remove ANSI escape codes
        const cleaned = output.replace(/\x1b\[[0-9;]*m/g, '');
        
        // Limit length for cloud reporting (max 50KB)
        const maxLength = 50 * 1024;
        if (cleaned.length > maxLength) {
            return cleaned.substring(0, maxLength) + '\n\n[Output truncated for cloud reporting]';
        }
        
        return cleaned;
    }
    
    /**
     * Extract severity level from text
     */
    extractSeverity(text) {
        const severityMap = {
            critical: 'critical',
            high: 'high',
            medium: 'medium',
            low: 'low'
        };
        
        const lowerText = text.toLowerCase();
        for (const [keyword, severity] of Object.entries(severityMap)) {
            if (lowerText.includes(keyword)) {
                return severity;
            }
        }
        
        return 'unknown';
    }
    
    /**
     * Extract priority level from text
     */
    extractPriority(text) {
        const priorityMap = {
            urgent: 'urgent',
            high: 'high',
            medium: 'medium',
            low: 'low'
        };
        
        const lowerText = text.toLowerCase();
        for (const [keyword, priority] of Object.entries(priorityMap)) {
            if (lowerText.includes(keyword)) {
                return priority;
            }
        }
        
        return 'medium';
    }
    
    /**
     * Validate if a string looks like a valid file path
     */
    isValidFilePath(filePath) {
        // Basic validation for file paths
        return filePath && 
               !filePath.includes(' ') && 
               filePath.length < 500 &&
               /^[a-zA-Z0-9._/-]+$/.test(filePath) &&
               !filePath.startsWith('http');
    }
    
    /**
     * Add custom artifact extractor
     */
    addArtifactExtractor(type, extractorFunction) {
        this.artifactExtractors.set(type, extractorFunction);
    }
    
    /**
     * Get available artifact extractors
     */
    getAvailableExtractors() {
        return Array.from(this.artifactExtractors.keys());
    }
}

module.exports = ResultsParser;