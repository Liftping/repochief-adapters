/**
 * Command Builder for Claude Code Adapter
 * 
 * Translates RepoCHief tasks into Claude Code CLI commands,
 * supporting schedule templates and various task types.
 */

class CommandBuilder {
    constructor() {
        this.templates = new Map();
        this.initializeTemplates();
    }
    
    /**
     * Initialize schedule templates mapping
     */
    initializeTemplates() {
        // Security audit template
        this.templates.set('security_audit', {
            name: 'Security Audit',
            description: 'Automated security vulnerability scanning',
            command: 'claude',
            args: [
                '--interactive=false',
                '--output=json'
            ],
            prompt: `Please perform a comprehensive security audit of this codebase. 

Focus on:
1. Input validation vulnerabilities
2. Authentication and authorization flaws
3. SQL injection possibilities
4. Cross-site scripting (XSS) vulnerabilities
5. Insecure dependencies
6. Configuration security issues
7. Secret/key exposure

Provide:
- List of security issues found with severity levels
- Specific file locations and line numbers
- Recommendations for fixes
- Priority ranking for remediation

Output format: JSON with structured findings.`,
            workingDirectory: true,
            timeout: 300000 // 5 minutes
        });
        
        // Tech debt analysis template
        this.templates.set('tech_debt_analysis', {
            name: 'Technical Debt Analysis',
            description: 'Analyze and prioritize technical debt',
            command: 'claude',
            args: [
                '--interactive=false',
                '--output=json'
            ],
            prompt: `Analyze this codebase for technical debt and provide improvement recommendations.

Focus on:
1. Code complexity and maintainability issues
2. Outdated dependencies and libraries
3. Code duplication and refactoring opportunities
4. Architecture anti-patterns
5. Performance bottlenecks
6. Test coverage gaps
7. Documentation deficiencies

Provide:
- Technical debt items with impact assessment
- Effort estimates for remediation
- Priority ranking based on business impact
- Suggested refactoring strategies
- Dependencies between debt items

Output format: JSON with structured analysis.`,
            workingDirectory: true,
            timeout: 600000 // 10 minutes
        });
        
        // Dependency update template
        this.templates.set('dependency_update', {
            name: 'Dependency Updates',
            description: 'Analyze and recommend dependency updates',
            command: 'claude',
            args: [
                '--interactive=false',
                '--output=json'
            ],
            prompt: `Analyze this project's dependencies and recommend updates.

Focus on:
1. Outdated packages and their latest versions
2. Security vulnerabilities in current dependencies
3. Breaking changes and migration requirements
4. Compatibility matrix between dependencies
5. Performance improvements from updates
6. New features available in updated versions

Provide:
- List of outdated dependencies with version info
- Security vulnerability assessment
- Update priority ranking
- Migration effort estimates
- Potential breaking changes
- Recommended update strategy

Output format: JSON with structured recommendations.`,
            workingDirectory: true,
            timeout: 300000 // 5 minutes
        });
    }
    
    /**
     * Build Claude Code command from RepoCHief task
     */
    buildCommand(task, options = {}) {
        const {
            workspaceRoot = process.cwd(),
            sessionId = 'default'
        } = options;
        
        // Check if task uses a template
        if (task.template) {
            return this.buildTemplateCommand(task.template, task.parameters || {}, {
                workspaceRoot,
                sessionId,
                ...options
            });
        }
        
        // Build command based on task type
        switch (task.type) {
            case 'security_scan':
            case 'security_audit':
                return this.buildSecurityAuditCommand(task, options);
                
            case 'tech_debt_analysis':
            case 'technical_debt':
                return this.buildTechDebtCommand(task, options);
                
            case 'dependency_update':
            case 'dependency_analysis':
                return this.buildDependencyCommand(task, options);
                
            case 'code_review':
                return this.buildCodeReviewCommand(task, options);
                
            case 'generation':
                return this.buildGenerationCommand(task, options);
                
            case 'refactoring':
                return this.buildRefactoringCommand(task, options);
                
            default:
                return this.buildGenericCommand(task, options);
        }
    }
    
    /**
     * Build command from template
     */
    buildTemplateCommand(templateName, parameters, options) {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new Error(`Unknown template: ${templateName}`);
        }
        
        const {
            workspaceRoot = process.cwd(),
            sessionId = 'default'
        } = options;
        
        // Build base command
        let command = template.command;
        
        // Add template arguments
        if (template.args) {
            command += ' ' + template.args.join(' ');
        }
        
        // Add workspace context
        command += ` --working-directory="${workspaceRoot}"`;
        
        // Add session identifier for tracking
        command += ` --session-id="${sessionId}"`;
        
        // Customize prompt with parameters
        let prompt = template.prompt;
        for (const [key, value] of Object.entries(parameters)) {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        
        // Add prompt (escaped for shell)
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        command += ` "${escapedPrompt}"`;
        
        return {
            command,
            template: templateName,
            prompt,
            workspaceRoot,
            sessionId,
            timeout: template.timeout,
            expectsJson: template.args?.includes('--output=json') || false
        };
    }
    
    /**
     * Build security audit command
     */
    buildSecurityAuditCommand(task, options = {}) {
        const template = this.templates.get('security_audit');
        return this.buildTemplateCommand('security_audit', task.parameters || {}, options);
    }
    
    /**
     * Build tech debt analysis command
     */
    buildTechDebtCommand(task, options = {}) {
        const template = this.templates.get('tech_debt_analysis');
        return this.buildTemplateCommand('tech_debt_analysis', task.parameters || {}, options);
    }
    
    /**
     * Build dependency update command
     */
    buildDependencyCommand(task, options = {}) {
        const template = this.templates.get('dependency_update');
        return this.buildTemplateCommand('dependency_update', task.parameters || {}, options);
    }
    
    /**
     * Build code review command
     */
    buildCodeReviewCommand(task, options = {}) {
        const { workspaceRoot = process.cwd(), sessionId = 'default' } = options;
        
        let command = 'claude --interactive=false --output=json';
        command += ` --working-directory="${workspaceRoot}"`;
        command += ` --session-id="${sessionId}"`;
        
        const prompt = `Please review the code in this repository for:
1. Code quality and best practices
2. Potential bugs and issues
3. Performance optimizations
4. Maintainability improvements
5. Security considerations

Focus on files: ${task.context?.files?.join(', ') || 'all files'}

Provide detailed feedback with specific line numbers and improvement suggestions.
Output format: JSON with structured review findings.`;
        
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        command += ` "${escapedPrompt}"`;
        
        return {
            command,
            template: 'code_review',
            prompt,
            workspaceRoot,
            sessionId,
            timeout: 300000,
            expectsJson: true
        };
    }
    
    /**
     * Build code generation command
     */
    buildGenerationCommand(task, options = {}) {
        const { workspaceRoot = process.cwd(), sessionId = 'default' } = options;
        
        let command = 'claude --interactive=false';
        command += ` --working-directory="${workspaceRoot}"`;
        command += ` --session-id="${sessionId}"`;
        
        // Add context files if specified
        if (task.context?.files?.length > 0) {
            command += ` --context="${task.context.files.join(' ')}"`;
        }
        
        // Add the generation prompt
        const escapedPrompt = task.description.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        command += ` "${escapedPrompt}"`;
        
        return {
            command,
            template: 'generation',
            prompt: task.description,
            workspaceRoot,
            sessionId,
            timeout: 180000, // 3 minutes
            expectsJson: false
        };
    }
    
    /**
     * Build refactoring command
     */
    buildRefactoringCommand(task, options = {}) {
        const { workspaceRoot = process.cwd(), sessionId = 'default' } = options;
        
        let command = 'claude --interactive=false';
        command += ` --working-directory="${workspaceRoot}"`;
        command += ` --session-id="${sessionId}"`;
        
        const prompt = `Please refactor the following code according to these requirements:
${task.description}

Focus on:
1. Improving code readability and maintainability
2. Applying design patterns where appropriate
3. Optimizing performance
4. Ensuring backwards compatibility
5. Maintaining existing functionality

${task.context?.files ? `Files to refactor: ${task.context.files.join(', ')}` : ''}

Please provide the refactored code with explanations for changes made.`;
        
        const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        command += ` "${escapedPrompt}"`;
        
        return {
            command,
            template: 'refactoring',
            prompt,
            workspaceRoot,
            sessionId,
            timeout: 300000, // 5 minutes
            expectsJson: false
        };
    }
    
    /**
     * Build generic command for unknown task types
     */
    buildGenericCommand(task, options = {}) {
        const { workspaceRoot = process.cwd(), sessionId = 'default' } = options;
        
        let command = 'claude --interactive=false';
        command += ` --working-directory="${workspaceRoot}"`;
        command += ` --session-id="${sessionId}"`;
        
        // Add context files if specified
        if (task.context?.files?.length > 0) {
            command += ` --context="${task.context.files.join(' ')}"`;
        }
        
        // Use task description as prompt
        const escapedPrompt = task.description.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        command += ` "${escapedPrompt}"`;
        
        return {
            command,
            template: 'generic',
            prompt: task.description,
            workspaceRoot,
            sessionId,
            timeout: 180000, // 3 minutes
            expectsJson: false
        };
    }
    
    /**
     * Build task from template (for direct template execution)
     */
    buildTaskFromTemplate(templateName, parameters = {}) {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new Error(`Unknown template: ${templateName}`);
        }
        
        // Customize prompt with parameters
        let description = template.prompt;
        for (const [key, value] of Object.entries(parameters)) {
            description = description.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        
        return {
            id: `template-${templateName}-${Date.now()}`,
            type: templateName,
            objective: template.name,
            description,
            template: templateName,
            parameters,
            context: parameters.context || {}
        };
    }
    
    /**
     * Get available templates
     */
    getAvailableTemplates() {
        const templates = [];
        for (const [id, template] of this.templates.entries()) {
            templates.push({
                id,
                name: template.name,
                description: template.description,
                timeout: template.timeout
            });
        }
        return templates;
    }
    
    /**
     * Add custom template
     */
    addTemplate(templateId, templateConfig) {
        this.templates.set(templateId, templateConfig);
    }
    
    /**
     * Get template configuration
     */
    getTemplate(templateId) {
        return this.templates.get(templateId);
    }
}

module.exports = CommandBuilder;