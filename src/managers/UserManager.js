// src/managers/UserManager.js - User connection and session management
const { v4: uuidv4 } = require('uuid');

class UserManager {
    constructor() {
        this.users = new Map(); // socketId -> User
        this.usersByUserId = new Map(); // userId -> User
        this.totalConnections = 0;
        this.connectionHistory = [];
        this.maxHistorySize = 1000;
        
        // User session management
        this.sessionTimeouts = new Map();
        this.defaultSessionTimeout = 30 * 60 * 1000; // 30 minutes
    }

    /**
     * Create a new user session
     * @param {string} socketId - Socket.IO connection ID
     * @param {Object} profile - User profile data
     * @returns {Object} Created user object
     */
    createUser(socketId, profile = {}) {
        const userId = uuidv4();
        const now = new Date();
        
        const user = {
            id: userId,
            socketId: socketId,
            profile: this.sanitizeProfile(profile),
            connectionTime: now,
            lastActivity: now,
            status: 'online',
            currentChatId: null,
            preferences: this.extractPreferences(profile),
            sessionData: {
                ipAddress: null, // Will be set by socket handler
                userAgent: null,
                country: null,
                city: null
            },
            stats: {
                totalChats: 0,
                totalMessages: 0,
                averageChatDuration: 0,
                violations: 0
            },
            flags: {
                isReported: false,
                isBanned: false,
                isBot: false,
                trustScore: 1.0
            }
        };

        // Store user mappings
        this.users.set(socketId, user);
        this.usersByUserId.set(userId, user);
        
        // Track connection history
        this.totalConnections++;
        this.addToConnectionHistory({
            userId,
            socketId,
            connectionTime: now,
            profile: this.getPublicProfile(user)
        });

        // Set session timeout
        this.setSessionTimeout(userId);

        return user;
    }

    /**
     * Get user by socket ID
     * @param {string} socketId - Socket.IO connection ID
     * @returns {Object|null} User object or null if not found
     */
    getUser(socketId) {
        return this.users.get(socketId) || null;
    }

    /**
     * Get user by user ID
     * @param {string} userId - User ID
     * @returns {Object|null} User object or null if not found
     */
    getUserById(userId) {
        return this.usersByUserId.get(userId) || null;
    }

    /**
     * Remove user from system
     * @param {string} socketId - Socket.IO connection ID
     * @returns {boolean} True if user was removed, false if not found
     */
    removeUser(socketId) {
        const user = this.users.get(socketId);
        if (!user) {
            return false;
        }

        // Clear session timeout
        this.clearSessionTimeout(user.id);

        // Remove from maps
        this.users.delete(socketId);
        this.usersByUserId.delete(user.id);

        // Log disconnection
        this.addToConnectionHistory({
            userId: user.id,
            socketId,
            disconnectionTime: new Date(),
            sessionDuration: Date.now() - user.connectionTime.getTime(),
            totalChats: user.stats.totalChats,
            totalMessages: user.stats.totalMessages
        });

        return true;
    }

    /**
     * Update user activity timestamp
     * @param {string} socketId - Socket.IO connection ID
     */
    updateActivity(socketId) {
        const user = this.users.get(socketId);
        if (user) {
            user.lastActivity = new Date();
            this.setSessionTimeout(user.id); // Reset timeout
        }
    }

    /**
     * Update user profile
     * @param {string} socketId - Socket.IO connection ID
     * @param {Object} profileUpdates - Profile updates
     * @returns {boolean} True if updated successfully
     */
    updateProfile(socketId, profileUpdates) {
        const user = this.users.get(socketId);
        if (!user) {
            return false;
        }

        // Sanitize and merge profile updates
        const sanitizedUpdates = this.sanitizeProfile(profileUpdates);
        user.profile = { ...user.profile, ...sanitizedUpdates };
        user.preferences = this.extractPreferences(user.profile);
        user.lastActivity = new Date();

        return true;
    }

    /**
     * Set user's current chat
     * @param {string} socketId - Socket.IO connection ID
     * @param {string} chatId - Chat room ID
     */
    setCurrentChat(socketId, chatId) {
        const user = this.users.get(socketId);
        if (user) {
            user.currentChatId = chatId;
            user.lastActivity = new Date();
        }
    }

    /**
     * Clear user's current chat
     * @param {string} socketId - Socket.IO connection ID
     */
    clearCurrentChat(socketId) {
        const user = this.users.get(socketId);
        if (user) {
            user.currentChatId = null;
            user.stats.totalChats++;
            user.lastActivity = new Date();
        }
    }

    /**
     * Update user statistics
     * @param {string} socketId - Socket.IO connection ID
     * @param {Object} statUpdates - Statistics to update
     */
    updateStats(socketId, statUpdates) {
        const user = this.users.get(socketId);
        if (user) {
            Object.assign(user.stats, statUpdates);
            user.lastActivity = new Date();
        }
    }

    /**
     * Flag user for violations
     * @param {string} userId - User ID
     * @param {string} violationType - Type of violation
     * @param {Object} details - Violation details
     */
    flagUser(userId, violationType, details = {}) {
        const user = this.usersByUserId.get(userId);
        if (user) {
            user.stats.violations++;
            user.flags.trustScore = Math.max(0, user.flags.trustScore - 0.1);
            
            // Add violation record
            if (!user.violations) {
                user.violations = [];
            }
            
            user.violations.push({
                type: violationType,
                timestamp: new Date(),
                details,
                severity: this.getViolationSeverity(violationType)
            });

            // Auto-ban for severe violations
            if (user.stats.violations >= 5 || user.flags.trustScore <= 0.3) {
                this.banUser(userId, 'Automated ban due to multiple violations');
            }
        }
    }

    /**
     * Ban user
     * @param {string} userId - User ID
     * @param {string} reason - Ban reason
     */
    banUser(userId, reason) {
        const user = this.usersByUserId.get(userId);
        if (user) {
            user.flags.isBanned = true;
            user.banInfo = {
                reason,
                timestamp: new Date(),
                bannedBy: 'system'
            };
        }
    }

    /**
     * Check if user is banned
     * @param {string} userId - User ID
     * @returns {boolean} True if user is banned
     */
    isUserBanned(userId) {
        const user = this.usersByUserId.get(userId);
        return user ? user.flags.isBanned : false;
    }

    /**
     * Get online user count
     * @returns {number} Number of online users
     */
    getOnlineCount() {
        return this.users.size;
    }

    /**
     * Get total connections count
     * @returns {number} Total number of connections since server start
     */
    getTotalConnections() {
        return this.totalConnections;
    }

    /**
     * Get users by criteria
     * @param {Object} criteria - Search criteria
     * @returns {Array} Array of matching users
     */
    getUsersByCriteria(criteria = {}) {
        const users = Array.from(this.users.values());
        
        return users.filter(user => {
            // Filter by status
            if (criteria.status && user.status !== criteria.status) {
                return false;
            }

            // Filter by gender
            if (criteria.gender && user.profile.gender !== criteria.gender) {
                return false;
            }

            // Filter by age range
            if (criteria.ageRange && !this.isInAgeRange(user.profile.age, criteria.ageRange)) {
                return false;
            }

            // Filter by location
            if (criteria.location && !this.matchesLocation(user.profile.location, criteria.location)) {
                return false;
            }

            // Filter by keywords/interests
            if (criteria.keywords && !this.hasMatchingKeywords(user.profile.keywords, criteria.keywords)) {
                return false;
            }

            // Filter out banned users
            if (user.flags.isBanned) {
                return false;
            }

            // Filter by trust score
            if (criteria.minTrustScore && user.flags.trustScore < criteria.minTrustScore) {
                return false;
            }

            return true;
        });
    }

    /**
     * Get available users for matching (not in chat)
     * @param {Object} criteria - Matching criteria
     * @returns {Array} Array of available users
     */
    getAvailableUsers(criteria = {}) {
        const availableUsers = this.getUsersByCriteria({
            ...criteria,
            status: 'online'
        }).filter(user => !user.currentChatId);

        // Sort by trust score and connection time
        return availableUsers.sort((a, b) => {
            // Higher trust score first
            if (b.flags.trustScore !== a.flags.trustScore) {
                return b.flags.trustScore - a.flags.trustScore;
            }
            // Earlier connection time first
            return a.connectionTime - b.connectionTime;
        });
    }

    /**
     * Clean up inactive users
     * @param {number} inactivityThreshold - Inactivity threshold in milliseconds
     */
    cleanupInactiveUsers(inactivityThreshold = 30 * 60 * 1000) { // 30 minutes default
        const now = Date.now();
        const inactiveUsers = [];

        for (const [socketId, user] of this.users) {
            if (now - user.lastActivity.getTime() > inactivityThreshold) {
                inactiveUsers.push(socketId);
            }
        }

        inactiveUsers.forEach(socketId => {
            this.removeUser(socketId);
        });

        return inactiveUsers.length;
    }

    /**
     * Get user statistics summary
     * @returns {Object} Statistics summary
     */
    getStatistics() {
        const users = Array.from(this.users.values());
        
        return {
            onlineUsers: this.users.size,
            totalConnections: this.totalConnections,
            averageSessionDuration: this.getAverageSessionDuration(),
            usersByGender: this.getUserCountByGender(users),
            usersByAge: this.getUserCountByAge(users),
            usersByLocation: this.getUserCountByLocation(users),
            averageTrustScore: this.getAverageTrustScore(users),
            bannedUsers: users.filter(u => u.flags.isBanned).length,
            reportedUsers: users.filter(u => u.flags.isReported).length
        };
    }

    // Private helper methods

    sanitizeProfile(profile) {
        const sanitized = {};
        
        // Sanitize gender
        if (profile.gender) {
            const validGenders = ['male', 'female', 'other', 'not-specified'];
            sanitized.gender = validGenders.includes(profile.gender.toLowerCase()) 
                ? profile.gender.toLowerCase() 
                : 'not-specified';
        }

        // Sanitize location
        if (profile.location) {
            sanitized.location = profile.location.toString().substring(0, 100).trim();
        }

        // Sanitize age
        if (profile.age) {
            const validAges = ['18-25', '26-35', '36-45', '46+', 'not-specified'];
            sanitized.age = validAges.includes(profile.age) ? profile.age : 'not-specified';
        }

        // Sanitize keywords
        if (profile.keywords) {
            const keywords = typeof profile.keywords === 'string' 
                ? profile.keywords.split(',') 
                : profile.keywords;
            sanitized.keywords = Array.isArray(keywords)
                ? keywords.map(k => k.toString().trim().substring(0, 50)).slice(0, 10)
                : [];
        }

        return sanitized;
    }

    extractPreferences(profile) {
        return {
            preferredGender: profile.preferredGender || 'any',
            preferredAgeRange: profile.preferredAgeRange || 'any',
            preferredLocation: profile.preferredLocation || 'any',
            interests: profile.keywords || []
        };
    }

    getPublicProfile(user) {
        return {
            gender: user.profile.gender || 'not-specified',
            location: user.profile.location || 'unknown',
            age: user.profile.age || 'not-specified',
            interests: user.profile.keywords || [],
            trustScore: Math.round(user.flags.trustScore * 100) / 100
        };
    }

    isInAgeRange(userAge, targetAgeRange) {
        if (!userAge || !targetAgeRange || targetAgeRange === 'any') {
            return true;
        }
        return userAge === targetAgeRange;
    }

    matchesLocation(userLocation, targetLocation) {
        if (!userLocation || !targetLocation || targetLocation === 'any') {
            return true;
        }
        return userLocation.toLowerCase().includes(targetLocation.toLowerCase()) ||
               targetLocation.toLowerCase().includes(userLocation.toLowerCase());
    }

    hasMatchingKeywords(userKeywords, targetKeywords) {
        if (!userKeywords || !targetKeywords || targetKeywords.length === 0) {
            return true;
        }
        
        const userKw = Array.isArray(userKeywords) ? userKeywords : [userKeywords];
        const targetKw = Array.isArray(targetKeywords) ? targetKeywords : [targetKeywords];
        
        return userKw.some(uk => 
            targetKw.some(tk => 
                uk.toLowerCase().includes(tk.toLowerCase()) ||
                tk.toLowerCase().includes(uk.toLowerCase())
            )
        );
    }

    addToConnectionHistory(entry) {
        this.connectionHistory.push(entry);
        
        // Keep history size manageable
        if (this.connectionHistory.length > this.maxHistorySize) {
            this.connectionHistory = this.connectionHistory.slice(-this.maxHistorySize);
        }
    }

    setSessionTimeout(userId) {
        // Clear existing timeout
        this.clearSessionTimeout(userId);
        
        // Set new timeout
        const timeoutId = setTimeout(() => {
            const user = this.usersByUserId.get(userId);
            if (user) {
                this.removeUser(user.socketId);
            }
        }, this.defaultSessionTimeout);
        
        this.sessionTimeouts.set(userId, timeoutId);
    }

    clearSessionTimeout(userId) {
        const timeoutId = this.sessionTimeouts.get(userId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.sessionTimeouts.delete(userId);
        }
    }

    getViolationSeverity(violationType) {
        const severityMap = {
            'spam': 'medium',
            'inappropriate_content': 'high',
            'harassment': 'high',
            'rate_limit_exceeded': 'low',
            'suspicious_behavior': 'medium',
            'malicious_content': 'high'
        };
        
        return severityMap[violationType] || 'medium';
    }

    getAverageSessionDuration() {
        const completedSessions = this.connectionHistory.filter(h => h.sessionDuration);
        if (completedSessions.length === 0) return 0;
        
        const totalDuration = completedSessions.reduce((sum, session) => sum + session.sessionDuration, 0);
        return Math.round(totalDuration / completedSessions.length / 1000); // in seconds
    }

    getUserCountByGender(users) {
        return users.reduce((acc, user) => {
            const gender = user.profile.gender || 'not-specified';
            acc[gender] = (acc[gender] || 0) + 1;
            return acc;
        }, {});
    }

    getUserCountByAge(users) {
        return users.reduce((acc, user) => {
            const age = user.profile.age || 'not-specified';
            acc[age] = (acc[age] || 0) + 1;
            return acc;
        }, {});
    }

    getUserCountByLocation(users) {
        return users.reduce((acc, user) => {
            const location = user.profile.location || 'unknown';
            const country = location.split(',')[0].trim();
            acc[country] = (acc[country] || 0) + 1;
            return acc;
        }, {});
    }

    getAverageTrustScore(users) {
        if (users.length === 0) return 1.0;
        
        const totalScore = users.reduce((sum, user) => sum + user.flags.trustScore, 0);
        return Math.round((totalScore / users.length) * 100) / 100;
    }
}

module.exports = UserManager;