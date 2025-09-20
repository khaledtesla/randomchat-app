// src/services/MatchingEngine.js - Advanced user matching algorithm
const { v4: uuidv4 } = require('uuid');

class MatchingEngine {
    constructor() {
        this.matchingQueue = new Map(); // userId -> QueueEntry
        this.queueHistory = [];
        this.matchingStats = {
            totalMatches: 0,
            successfulMatches: 0,
            averageWaitTime: 0,
            matchingAccuracy: 0
        };
        
        // Matching algorithm weights
        this.weights = {
            gender: 0.3,
            age: 0.2,
            location: 0.15,
            interests: 0.25,
            trustScore: 0.1
        };
        
        // Queue management
        this.maxQueueSize = 1000;
        this.maxWaitTime = 5 * 60 * 1000; // 5 minutes
        this.matchingInterval = 2000; // 2 seconds
        
        this.startMatchingLoop();
    }

    /**
     * Add user to matching queue
     * @param {Object} user - User object
     * @param {Object} preferences - User preferences
     * @returns {Object} Queue entry
     */
    addToQueue(user, preferences) {
        // Check if user is already in queue
        if (this.matchingQueue.has(user.id)) {
            return this.matchingQueue.get(user.id);
        }

        // Check queue size limit
        if (this.matchingQueue.size >= this.maxQueueSize) {
            throw new Error('Matching queue is full');
        }

        const queueEntry = {
            id: uuidv4(),
            userId: user.id,
            user: user,
            preferences: this.sanitizePreferences(preferences),
            queuedAt: new Date(),
            attempts: 0,
            lastAttempt: null,
            priority: this.calculatePriority(user),
            compatibility: {
                requirements: this.extractRequirements(preferences),
                flexibility: this.calculateFlexibility(preferences)
            }
        };

        this.matchingQueue.set(user.id, queueEntry);
        
        // Add to history
        this.queueHistory.push({
            userId: user.id,
            action: 'queued',
            timestamp: new Date(),
            preferences: preferences
        });

        return queueEntry;
    }

    /**
     * Remove user from matching queue
     * @param {string} userId - User ID
     * @returns {boolean} True if user was removed
     */
    removeFromQueue(userId) {
        if (this.matchingQueue.has(userId)) {
            this.matchingQueue.delete(userId);
            
            this.queueHistory.push({
                userId: userId,
                action: 'removed',
                timestamp: new Date()
            });
            
            return true;
        }
        return false;
    }

    /**
     * Find match for user
     * @param {Object} user - User object
     * @param {Object} preferences - User preferences
     * @returns {Object|null} Matched user or null if no match found
     */
    async findMatch(user, preferences) {
        // Add to queue first
        const queueEntry = this.addToQueue(user, preferences);
        
        // Try immediate matching
        const match = await this.findBestMatch(queueEntry);
        
        if (match) {
            // Remove both users from queue
            this.removeFromQueue(user.id);
            this.removeFromQueue(match.userId);
            
            // Record successful match
            this.recordMatch(queueEntry, match, true);
            
            return match.user;
        }

        return null; // Will be matched in the background loop
    }

    /**
     * Get user's position in queue
     * @param {string} userId - User ID
     * @returns {number} Queue position (1-based) or -1 if not found
     */
    getQueuePosition(userId) {
        if (!this.matchingQueue.has(userId)) {
            return -1;
        }

        const queueArray = Array.from(this.matchingQueue.values())
            .sort((a, b) => {
                // Sort by priority first, then by queue time
                if (b.priority !== a.priority) {
                    return b.priority - a.priority;
                }
                return a.queuedAt - b.queuedAt;
            });

        return queueArray.findIndex(entry => entry.userId === userId) + 1;
    }

    /**
     * Get queue statistics
     * @returns {Object} Queue statistics
     */
    getQueueStats() {
        const queueArray = Array.from(this.matchingQueue.values());
        const now = Date.now();
        
        return {
            queueSize: queueArray.length,
            averageWaitTime: this.calculateAverageWaitTime(queueArray, now),
            oldestEntry: queueArray.length > 0 ? Math.max(...queueArray.map(e => now - e.queuedAt.getTime())) : 0,
            typeDistribution: this.getQueueTypeDistribution(queueArray),
            priorityDistribution: this.getQueuePriorityDistribution(queueArray)
        };
    }

    /**
     * Get overall matching statistics
     * @returns {Object} Matching statistics
     */
    getMatchingStats() {
        return {
            ...this.matchingStats,
            queueStats: this.getQueueStats()
        };
    }

    /**
     * Clean up stale queue entries
     * @returns {number} Number of entries cleaned up
     */
    cleanupQueue() {
        const now = Date.now();
        const staleEntries = [];

        for (const [userId, entry] of this.matchingQueue) {
            if (now - entry.queuedAt.getTime() > this.maxWaitTime) {
                staleEntries.push(userId);
            }
        }

        staleEntries.forEach(userId => {
            this.removeFromQueue(userId);
        });

        return staleEntries.length;
    }

    // Private methods

    startMatchingLoop() {
        setInterval(() => {
            this.processMatchingQueue();
        }, this.matchingInterval);
    }

    async processMatchingQueue() {
        if (this.matchingQueue.size < 2) {
            return;
        }

        const queueArray = Array.from(this.matchingQueue.values())
            .sort((a, b) => {
                // Prioritize by wait time and priority
                const waitTimeA = Date.now() - a.queuedAt.getTime();
                const waitTimeB = Date.now() - b.queuedAt.getTime();
                const scoreA = waitTimeA + (a.priority * 10000);
                const scoreB = waitTimeB + (b.priority * 10000);
                return scoreB - scoreA;
            });

        // Process matches for highest priority users
        for (let i = 0; i < Math.min(queueArray.length, 10); i++) {
            const entry = queueArray[i];
            entry.attempts++;
            entry.lastAttempt = new Date();

            const match = await this.findBestMatch(entry, queueArray.slice(i + 1));
            
            if (match) {
                // Emit match found event (handled by server)
                this.emitMatchFound(entry, match);
                
                // Remove both users from queue
                this.removeFromQueue(entry.userId);
                this.removeFromQueue(match.userId);
                
                // Record successful match
                this.recordMatch(entry, match, true);
                
                break; // Process next batch in next iteration
            }
        }
    }

    async findBestMatch(queueEntry, candidates = null) {
        const searchPool = candidates || Array.from(this.matchingQueue.values())
            .filter(entry => entry.userId !== queueEntry.userId);

        if (searchPool.length === 0) {
            return null;
        }

        // Calculate compatibility scores
        const scoredCandidates = searchPool.map(candidate => ({
            ...candidate,
            compatibilityScore: this.calculateCompatibility(queueEntry, candidate)
        }));

        // Filter by minimum compatibility threshold
        const viableCandidates = scoredCandidates.filter(candidate => 
            candidate.compatibilityScore >= this.getMinimumCompatibility(queueEntry)
        );

        if (viableCandidates.length === 0) {
            return null;
        }

        // Sort by compatibility score
        viableCandidates.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

        // Return the best match
        return viableCandidates[0];
    }

    calculateCompatibility(entry1, entry2) {
        let totalScore = 0;
        let totalWeight = 0;

        // Gender compatibility
        const genderScore = this.calculateGenderCompatibility(entry1, entry2);
        totalScore += genderScore * this.weights.gender;
        totalWeight += this.weights.gender;

        // Age compatibility
        const ageScore = this.calculateAgeCompatibility(entry1, entry2);
        totalScore += ageScore * this.weights.age;
        totalWeight += this.weights.age;

        // Location compatibility
        const locationScore = this.calculateLocationCompatibility(entry1, entry2);
        totalScore += locationScore * this.weights.location;
        totalWeight += this.weights.location;

        // Interest compatibility
        const interestScore = this.calculateInterestCompatibility(entry1, entry2);
        totalScore += interestScore * this.weights.interests;
        totalWeight += this.weights.interests;

        // Trust score compatibility
        const trustScore = this.calculateTrustCompatibility(entry1, entry2);
        totalScore += trustScore * this.weights.trustScore;
        totalWeight += this.weights.trustScore;

        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    calculateGenderCompatibility(entry1, entry2) {
        const pref1 = entry1.preferences.gender || 'any';
        const pref2 = entry2.preferences.gender || 'any';
        const gender1 = entry1.user.profile.gender || 'not-specified';
        const gender2 = entry2.user.profile.gender || 'not-specified';

        // Perfect match if both want any gender
        if (pref1 === 'any' && pref2 === 'any') return 1.0;

        // Check if preferences match
        let score = 0;
        
        if (pref1 === 'any' || pref1 === gender2) score += 0.5;
        if (pref2 === 'any' || pref2 === gender1) score += 0.5;

        return score;
    }

    calculateAgeCompatibility(entry1, entry2) {
        const age1 = entry1.user.profile.age;
        const age2 = entry2.user.profile.age;
        const prefAge1 = entry1.preferences.age;
        const prefAge2 = entry2.preferences.age;

        if (!age1 || !age2 || age1 === 'not-specified' || age2 === 'not-specified') {
            return 0.5; // Neutral score for unknown ages
        }

        // Perfect match if ages are in same range
        if (age1 === age2) return 1.0;

        // Check preference compatibility
        let score = 0;
        if (!prefAge1 || prefAge1 === 'any' || prefAge1 === age2) score += 0.5;
        if (!prefAge2 || prefAge2 === 'any' || prefAge2 === age1) score += 0.5;

        return score;
    }

    calculateLocationCompatibility(entry1, entry2) {
        const loc1 = entry1.user.profile.location;
        const loc2 = entry2.user.profile.location;

        if (!loc1 || !loc2) return 0.5;

        const location1 = loc1.toLowerCase();
        const location2 = loc2.toLowerCase();

        // Exact match
        if (location1 === location2) return 1.0;

        // Country match (first part before comma)
        const country1 = location1.split(',')[0].trim();
        const country2 = location2.split(',')[0].trim();
        if (country1 === country2) return 0.8;

        // Partial match
        if (location1.includes(location2) || location2.includes(location1)) return 0.6;

        return 0.3; // Different locations but still possible
    }

    calculateInterestCompatibility(entry1, entry2) {
        const interests1 = entry1.user.profile.keywords || [];
        const interests2 = entry2.user.profile.keywords || [];

        if (interests1.length === 0 && interests2.length === 0) return 0.5;
        if (interests1.length === 0 || interests2.length === 0) return 0.4;

        // Calculate Jaccard similarity
        const set1 = new Set(interests1.map(i => i.toLowerCase()));
        const set2 = new Set(interests2.map(i => i.toLowerCase()));
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        const jaccardSimilarity = intersection.size / union.size;
        
        // Boost score for common interests
        const commonCount = intersection.size;
        const bonus = Math.min(commonCount * 0.1, 0.3);

        return Math.min(jaccardSimilarity + bonus, 1.0);
    }

    calculateTrustCompatibility(entry1, entry2) {
        const trust1 = entry1.user.flags.trustScore || 1.0;
        const trust2 = entry2.user.flags.trustScore || 1.0;

        // Prefer users with high trust scores
        const averageTrust = (trust1 + trust2) / 2;
        const trustDifference = Math.abs(trust1 - trust2);

        // High average trust and low difference is best
        return averageTrust * (1 - trustDifference * 0.5);
    }

    getMinimumCompatibility(queueEntry) {
        const baseThreshold = 0.3;
        const waitTime = Date.now() - queueEntry.queuedAt.getTime();
        const waitMinutes = waitTime / (60 * 1000);

        // Lower threshold as wait time increases
        const reduction = Math.min(waitMinutes * 0.02, 0.2); // Max 20% reduction
        
        return Math.max(baseThreshold - reduction, 0.1);
    }

    calculatePriority(user) {
        let priority = 1.0;

        // Higher priority for users with high trust scores
        priority += (user.flags.trustScore - 0.5) * 0.5;

        // Lower priority for users with violations
        priority -= user.stats.violations * 0.1;

        // Slight priority boost for new users
        const hoursSinceConnection = (Date.now() - user.connectionTime.getTime()) / (60 * 60 * 1000);
        if (hoursSinceConnection < 1) {
            priority += 0.2;
        }

        return Math.max(0.1, Math.min(2.0, priority));
    }

    calculateFlexibility(preferences) {
        let flexibilityScore = 0;
        let totalPreferences = 0;

        if (preferences.gender === 'any') flexibilityScore++;
        totalPreferences++;

        if (!preferences.age || preferences.age === 'any') flexibilityScore++;
        totalPreferences++;

        if (!preferences.location || preferences.location === 'any') flexibilityScore++;
        totalPreferences++;

        if (!preferences.keywords || preferences.keywords.length === 0) flexibilityScore++;
        totalPreferences++;

        return totalPreferences > 0 ? flexibilityScore / totalPreferences : 1.0;
    }

    extractRequirements(preferences) {
        const requirements = [];

        if (preferences.gender && preferences.gender !== 'any') {
            requirements.push({ type: 'gender', value: preferences.gender, strict: true });
        }

        if (preferences.age && preferences.age !== 'any') {
            requirements.push({ type: 'age', value: preferences.age, strict: false });
        }

        if (preferences.location && preferences.location !== 'any') {
            requirements.push({ type: 'location', value: preferences.location, strict: false });
        }

        if (preferences.keywords && preferences.keywords.length > 0) {
            requirements.push({ type: 'interests', value: preferences.keywords, strict: false });
        }

        return requirements;
    }

    sanitizePreferences(preferences) {
        return {
            chatType: preferences.chatType || 'text',
            gender: preferences.gender || 'any',
            age: preferences.age || 'any',
            location: preferences.location || 'any',
            keywords: Array.isArray(preferences.keywords) ? preferences.keywords : []
        };
    }

    recordMatch(entry1, entry2, successful) {
        this.matchingStats.totalMatches++;
        if (successful) {
            this.matchingStats.successfulMatches++;
        }

        const waitTime1 = Date.now() - entry1.queuedAt.getTime();
        const waitTime2 = Date.now() - entry2.queuedAt.getTime();
        const averageWaitTime = (waitTime1 + waitTime2) / 2;

        // Update running average
        this.matchingStats.averageWaitTime = 
            (this.matchingStats.averageWaitTime * (this.matchingStats.totalMatches - 1) + averageWaitTime) / 
            this.matchingStats.totalMatches;

        // Calculate matching accuracy
        this.matchingStats.matchingAccuracy = 
            (this.matchingStats.successfulMatches / this.matchingStats.totalMatches) * 100;
    }

    calculateAverageWaitTime(queueArray, now) {
        if (queueArray.length === 0) return 0;
        
        const totalWaitTime = queueArray.reduce((sum, entry) => 
            sum + (now - entry.queuedAt.getTime()), 0);
        
        return totalWaitTime / queueArray.length;
    }

    getQueueTypeDistribution(queueArray) {
        return queueArray.reduce((acc, entry) => {
            const type = entry.preferences.chatType || 'text';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
    }

    getQueuePriorityDistribution(queueArray) {
        const ranges = { low: 0, medium: 0, high: 0 };
        
        queueArray.forEach(entry => {
            if (entry.priority < 0.7) ranges.low++;
            else if (entry.priority < 1.3) ranges.medium++;
            else ranges.high++;
        });

        return ranges;
    }

    getAverageWaitTime() {
        return this.matchingStats.averageWaitTime;
    }

    emitMatchFound(entry1, entry2) {
        // This method will be overridden by the server to emit socket events
        if (this.onMatchFound) {
            this.onMatchFound(entry1, entry2);
        }
    }

    setMatchFoundCallback(callback) {
        this.onMatchFound = callback;
    }
}

module.exports = MatchingEngine;