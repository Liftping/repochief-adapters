/**
 * Adapter Registry
 * 
 * Manages registration, versioning, and selection of AI agent adapters.
 * Enables dynamic adapter discovery and intelligent routing based on
 * capabilities and version compatibility.
 */

const { EventEmitter } = require('events');

class AdapterRegistry extends EventEmitter {
    constructor() {
        super();
        
        // Map of adapter name -> version -> adapter instance
        this._adapters = new Map();
        
        // Map of adapter name -> default version
        this._defaultVersions = new Map();
        
        // Performance metrics for adapters
        this._metrics = new Map();
    }
    
    /**
     * Register an adapter with the registry
     * @param {string} name - Adapter name (e.g., 'claude-code')
     * @param {AIAgentAdapter} adapter - Adapter instance
     * @param {string} version - Version string (e.g., '2.0.0')
     * @param {boolean} setAsDefault - Whether to set as default version
     */
    registerAdapter(name, adapter, version = null, setAsDefault = true) {
        if (!name || !adapter) {
            throw new Error('Name and adapter are required');
        }
        
        // Use adapter's version if not provided
        const adapterVersion = version || adapter.apiVersion;
        
        // Initialize name map if needed
        if (!this._adapters.has(name)) {
            this._adapters.set(name, new Map());
        }
        
        // Register the adapter
        const versionMap = this._adapters.get(name);
        versionMap.set(adapterVersion, adapter);
        
        // Set as default if requested or if it's the first version
        if (setAsDefault || !this._defaultVersions.has(name)) {
            this._defaultVersions.set(name, adapterVersion);
        }
        
        // Initialize metrics
        if (!this._metrics.has(name)) {
            this._metrics.set(name, new Map());
        }
        
        // Emit registration event
        this.emit('adapter:registered', {
            name,
            version: adapterVersion,
            isDefault: setAsDefault,
            timestamp: new Date()
        });
        
        console.log(`✅ Registered adapter: ${name} v${adapterVersion}${setAsDefault ? ' (default)' : ''}`);
    }
    
    /**
     * Get an adapter by name and optional version
     * @param {string} name - Adapter name
     * @param {string} version - Optional version (uses default if not specified)
     * @returns {AIAgentAdapter|null} Adapter instance or null
     */
    getAdapter(name, version = null) {
        const versionMap = this._adapters.get(name);
        if (!versionMap) {
            return null;
        }
        
        const targetVersion = version || this._defaultVersions.get(name);
        if (!targetVersion) {
            return null;
        }
        
        return versionMap.get(targetVersion) || null;
    }
    
    /**
     * Get the latest adapter for a given name
     * @param {string} name - Adapter name
     * @returns {AIAgentAdapter|null} Latest adapter or null
     */
    getLatestAdapter(name) {
        const versionMap = this._adapters.get(name);
        if (!versionMap || versionMap.size === 0) {
            return null;
        }
        
        // Sort versions and get the latest
        const versions = Array.from(versionMap.keys());
        const latestVersion = this._compareVersions(versions);
        
        return versionMap.get(latestVersion);
    }
    
    /**
     * List all versions available for an adapter
     * @param {string} name - Adapter name
     * @returns {Array<string>} Array of version strings
     */
    listVersions(name) {
        const versionMap = this._adapters.get(name);
        if (!versionMap) {
            return [];
        }
        
        return Array.from(versionMap.keys()).sort(this._versionComparator);
    }
    
    /**
     * List all registered adapter names
     * @returns {Array<string>} Array of adapter names
     */
    listAdapters() {
        return Array.from(this._adapters.keys());
    }
    
    /**
     * Get detailed information about all adapters
     * @returns {Array<Object>} Array of adapter information
     */
    getAllAdapterInfo() {
        const info = [];
        
        for (const [name, versionMap] of this._adapters) {
            const defaultVersion = this._defaultVersions.get(name);
            const versions = Array.from(versionMap.keys());
            
            for (const version of versions) {
                const adapter = versionMap.get(version);
                info.push({
                    name,
                    version,
                    isDefault: version === defaultVersion,
                    capabilities: adapter.capabilities,
                    supportedApiVersions: adapter.supportedApiVersions,
                    adapterVersion: adapter.adapterVersion
                });
            }
        }
        
        return info;
    }
    
    /**
     * Find adapters matching specific capabilities
     * @param {Object} requirements - Required capabilities
     * @returns {Array<Object>} Matching adapters with scores
     */
    findMatchingAdapters(requirements) {
        const matches = [];
        
        for (const [name, versionMap] of this._adapters) {
            for (const [version, adapter] of versionMap) {
                const score = this._calculateCapabilityScore(adapter, requirements);
                if (score > 0) {
                    matches.push({
                        name,
                        version,
                        adapter,
                        score,
                        capabilities: adapter.capabilities
                    });
                }
            }
        }
        
        // Sort by score (highest first)
        return matches.sort((a, b) => b.score - a.score);
    }
    
    /**
     * Select optimal adapter based on requirements and preferences
     * @param {Object} requirements - Required capabilities
     * @param {Object} preferences - User preferences (preferred adapters, etc.)
     * @returns {Object|null} Selected adapter info or null
     */
    selectOptimalAdapter(requirements, preferences = {}) {
        const matches = this.findMatchingAdapters(requirements);
        
        if (matches.length === 0) {
            return null;
        }
        
        // Apply preferences
        if (preferences.preferredAdapters) {
            // Boost score for preferred adapters
            matches.forEach(match => {
                if (preferences.preferredAdapters.includes(match.name)) {
                    match.score *= 1.5; // 50% boost for preferred adapters
                }
            });
            
            // Re-sort after preference adjustment
            matches.sort((a, b) => b.score - a.score);
        }
        
        // Consider performance metrics
        if (preferences.considerPerformance) {
            matches.forEach(match => {
                const metrics = this.getAdapterMetrics(match.name, match.version);
                if (metrics.avgDuration) {
                    // Boost faster adapters
                    const speedBoost = 1000 / metrics.avgDuration; // Inverse of avg duration
                    match.score *= (1 + Math.min(speedBoost * 0.1, 0.3)); // Max 30% boost
                }
            });
            
            // Final sort
            matches.sort((a, b) => b.score - a.score);
        }
        
        return matches[0];
    }
    
    /**
     * Set the default version for an adapter
     * @param {string} name - Adapter name
     * @param {string} version - Version to set as default
     */
    setDefaultVersion(name, version) {
        const versionMap = this._adapters.get(name);
        if (!versionMap || !versionMap.has(version)) {
            throw new Error(`Adapter ${name} v${version} not found`);
        }
        
        this._defaultVersions.set(name, version);
        
        this.emit('adapter:default-changed', {
            name,
            version,
            timestamp: new Date()
        });
    }
    
    /**
     * Unregister an adapter
     * @param {string} name - Adapter name
     * @param {string} version - Optional version (removes all if not specified)
     */
    unregisterAdapter(name, version = null) {
        if (!this._adapters.has(name)) {
            return;
        }
        
        if (version) {
            // Remove specific version
            const versionMap = this._adapters.get(name);
            versionMap.delete(version);
            
            // Remove name entry if no versions left
            if (versionMap.size === 0) {
                this._adapters.delete(name);
                this._defaultVersions.delete(name);
            } else if (this._defaultVersions.get(name) === version) {
                // Update default if we removed the default version
                const versions = Array.from(versionMap.keys());
                this._defaultVersions.set(name, versions[0]);
            }
        } else {
            // Remove all versions
            this._adapters.delete(name);
            this._defaultVersions.delete(name);
        }
        
        this.emit('adapter:unregistered', {
            name,
            version,
            timestamp: new Date()
        });
    }
    
    // Performance tracking
    /**
     * Record performance metrics for an adapter
     * @param {string} name - Adapter name
     * @param {string} version - Adapter version
     * @param {Object} metrics - Performance metrics
     */
    recordMetrics(name, version, metrics) {
        const key = `${name}:${version}`;
        if (!this._metrics.has(key)) {
            this._metrics.set(key, {
                totalExecutions: 0,
                totalDuration: 0,
                failures: 0,
                lastUpdated: null
            });
        }
        
        const stats = this._metrics.get(key);
        stats.totalExecutions++;
        stats.totalDuration += metrics.duration || 0;
        if (metrics.failed) {
            stats.failures++;
        }
        stats.lastUpdated = new Date();
        
        // Calculate derived metrics
        stats.avgDuration = stats.totalDuration / stats.totalExecutions;
        stats.successRate = (stats.totalExecutions - stats.failures) / stats.totalExecutions;
    }
    
    /**
     * Get performance metrics for an adapter
     * @param {string} name - Adapter name
     * @param {string} version - Adapter version
     * @returns {Object} Performance metrics
     */
    getAdapterMetrics(name, version) {
        const key = `${name}:${version}`;
        return this._metrics.get(key) || {
            totalExecutions: 0,
            totalDuration: 0,
            failures: 0,
            avgDuration: 0,
            successRate: 1,
            lastUpdated: null
        };
    }
    
    // Private helper methods
    /**
     * Calculate capability match score
     * @private
     */
    _calculateCapabilityScore(adapter, requirements) {
        let score = 0;
        let requiredCount = 0;
        let matchedCount = 0;
        
        const capabilities = adapter.capabilities;
        
        // Check required features
        if (requirements.features) {
            for (const feature of requirements.features) {
                requiredCount++;
                if (adapter.supportsFeature(feature)) {
                    matchedCount++;
                    score += 10;
                }
            }
        }
        
        // Check context window requirement
        if (requirements.minContextTokens) {
            requiredCount++;
            if (capabilities.maxContextTokens >= requirements.minContextTokens) {
                matchedCount++;
                score += 5;
                // Bonus for significantly larger context
                const ratio = capabilities.maxContextTokens / requirements.minContextTokens;
                score += Math.min(ratio - 1, 5); // Max 5 bonus points
            }
        }
        
        // Check language support
        if (requirements.languages) {
            requiredCount++;
            const supportedLangs = new Set(capabilities.supportedLanguages || []);
            const requiredLangs = new Set(requirements.languages);
            const matchingLangs = [...requiredLangs].filter(lang => supportedLangs.has(lang));
            
            if (matchingLangs.length === requiredLangs.size) {
                matchedCount++;
                score += 5;
            } else if (matchingLangs.length > 0) {
                score += (matchingLangs.length / requiredLangs.size) * 5;
            }
        }
        
        // Check specific capabilities
        const capabilityChecks = [
            { req: 'multiFile', cap: 'multiFile', points: 3 },
            { req: 'streaming', cap: 'streaming', points: 2 },
            { req: 'subAgents', cap: 'subAgents.supported', points: 5 }
        ];
        
        for (const check of capabilityChecks) {
            if (requirements[check.req]) {
                requiredCount++;
                if (adapter.supportsFeature(check.cap)) {
                    matchedCount++;
                    score += check.points;
                }
            }
        }
        
        // Return 0 if not all required features are met
        if (requiredCount > 0 && matchedCount < requiredCount) {
            return 0;
        }
        
        return score;
    }
    
    /**
     * Compare versions and return the latest
     * @private
     */
    _compareVersions(versions) {
        return versions.sort(this._versionComparator).pop();
    }
    
    /**
     * Version comparator for sorting
     * @private
     */
    _versionComparator(a, b) {
        const aParts = a.split('.').map(Number);
        const bParts = b.split('.').map(Number);
        
        for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
            const aPart = aParts[i] || 0;
            const bPart = bParts[i] || 0;
            
            if (aPart !== bPart) {
                return aPart - bPart;
            }
        }
        
        return 0;
    }
}

module.exports = AdapterRegistry;