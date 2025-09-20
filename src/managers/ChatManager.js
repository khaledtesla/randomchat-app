// src/managers/ChatManager.js - Chat room and message management
const { v4: uuidv4 } = require('uuid');

class ChatManager {
    constructor() {
        this.chats = new Map(); // chatId -> Chat
        this.userChats = new Map(); // userId -> chatId
        this.chatHistory = [];
        this.maxHistorySize = 10000;
        this.maxChatDuration = 60 * 60 * 1000; // 1 hour
        this.maxMessagesPerChat = 1000;
        
        // Chat analytics
        this.totalChats = 0;
        this.totalMessages = 0;
        this.averageChatDuration = 0;
    }

    /**
     * Create a new chat room between two users
     * @param {string} user1Id - First user ID
     * @param {string} user2Id - Second user ID
     * @param {string} chatType - Chat type ('text' or 'video')
     * @returns {Object} Created chat object
     */
    createChat(user1Id, user2Id, chatType = 'text') {
        const chatId = uuidv4();
        const now = new Date();
        
        const chat = {
            id: chatId,
            type: chatType,
            participants: [user1Id, user2Id],
            createdAt: now,
            lastActivity: now,
            status: 'active',
            messages: [],
            metadata: {
                messageCount: 0,
                duration: 0,
                endedBy: null,
                endReason: null,
                webrtcEnabled: chatType === 'video',
                qualityIssues: []
            },
            settings: {
                maxMessages: this.maxMessagesPerChat,
                allowWebRTC: chatType === 'video',
                contentFilterEnabled: true,
                recordingEnabled: false
            },
            analytics: {
                responseTime: [],
                activeTime: 0,
                silentPeriods: 0,
                lastMessageTime: now
            }
        };

        // Store chat mappings
        this.chats.set(chatId, chat);
        this.userChats.set(user1Id, chatId);
        this.userChats.set(user2Id, chatId);
        
        this.totalChats++;
        
        // Set auto-cleanup timer
        this.setChatTimeout(chatId);

        return chat;
    }

    /**
     * Get chat by ID
     * @param {string} chatId - Chat ID
     * @returns {Object|null} Chat object or null if not found
     */
    getChat(chatId) {
        return this.chats.get(chatId) || null;
    }

    /**
     * Get user's current chat
     * @param {string} userId - User ID
     * @returns {Object|null} Chat object or null if not found
     */
    getUserCurrentChat(userId) {
        const chatId = this.userChats.get(userId);
        return chatId ? this.chats.get(chatId) : null;
    }

    /**
     * Add message to chat
     * @param {string} chatId - Chat ID
     * @param {Object} message - Message object
     * @returns {boolean} True if message was added successfully
     */
    addMessage(chatId, message) {
        const chat = this.chats.get(chatId);
        if (!chat || chat.status !== 'active') {
            return false;
        }

        // Check message limit
        if (chat.messages.length >= chat.settings.maxMessages) {
            this.endChat(chatId, 'message_limit_reached');
            return false;
        }

        // Enhance message with metadata
        const enhancedMessage = {
            ...message,
            id: message.id || uuidv4(),
            timestamp: new Date(),
            chatId: chatId,
            sequence: chat.messages.length + 1,
            edited: false,
            editHistory: []
        };

        // Add message to chat
        chat.messages.push(enhancedMessage);
        chat.metadata.messageCount++;
        chat.lastActivity = new Date();
        this.totalMessages++;

        // Update analytics
        this.updateChatAnalytics(chat, enhancedMessage);

        // Reset chat timeout
        this.setChatTimeout(chatId);

        return true;
    }

    /**
     * End a chat
     * @param {string} chatId - Chat ID
     * @param {string} reason - End reason
     * @param {string} endedBy - User ID who ended the chat
     * @returns {boolean} True if chat was ended successfully
     */
    endChat(chatId, reason = 'user_action', endedBy = null) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return false;
        }

        // Update chat status
        chat.status = 'ended';
        chat.metadata.endReason = reason;
        chat.metadata.endedBy = endedBy;
        chat.metadata.duration = Date.now() - chat.createdAt.getTime();
        chat.endedAt = new Date();

        // Calculate final analytics
        this.calculateFinalAnalytics(chat);

        // Remove user mappings
        chat.participants.forEach(userId => {
            this.userChats.delete(userId);
        });

        // Move to history
        this.addToHistory(chat);

        // Remove from active chats
        this.chats.delete(chatId);

        // Clear timeout
        this.clearChatTimeout(chatId);

        return true;
    }

    /**
     * Update chat activity
     * @param {string} chatId - Chat ID
     * @param {string} activityType - Type of activity
     * @param {Object} data - Activity data
     */
    updateActivity(chatId, activityType, data = {}) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return;
        }

        chat.lastActivity = new Date();
        
        switch (activityType) {
            case 'typing':
                chat.analytics.lastTypingTime = new Date();
                break;
            case 'webrtc_connected':
                chat.metadata.webrtcConnected = true;
                chat.metadata.webrtcConnectedAt = new Date();
                break;
            case 'webrtc_disconnected':
                chat.metadata.webrtcConnected = false;
                if (chat.metadata.webrtcConnectedAt) {
                    const webrtcDuration = Date.now() - chat.metadata.webrtcConnectedAt.getTime();
                    chat.analytics.webrtcDuration = (chat.analytics.webrtcDuration || 0) + webrtcDuration;
                }
                break;
            case 'quality_issue':
                chat.metadata.qualityIssues.push({
                    type: data.type,
                    timestamp: new Date(),
                    details: data.details
                });
                break;
        }

        // Reset timeout
        this.setChatTimeout(chatId);
    }

    /**
     * Get chat statistics
     * @param {string} chatId - Chat ID
     * @returns {Object|null} Chat statistics or null if not found
     */
    getChatStats(chatId) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return null;
        }

        const now = Date.now();
        const duration = now - chat.createdAt.getTime();
        
        return {
            id: chatId,
            type: chat.type,
            duration: duration,
            messageCount: chat.messages.length,
            participantCount: chat.participants.length,
            averageResponseTime: this.calculateAverageResponseTime(chat),
            activeTime: chat.analytics.activeTime,
            silentPeriods: chat.analytics.silentPeriods,
            qualityIssues: chat.metadata.qualityIssues.length,
            webrtcDuration: chat.analytics.webrtcDuration || 0
        };
    }

    /**
     * Get all active chats
     * @returns {Array} Array of active chats
     */
    getActiveChats() {
        return Array.from(this.chats.values()).filter(chat => chat.status === 'active');
    }

    /**
     * Get active chat count
     * @returns {number} Number of active chats
     */
    getActiveChatCount() {
        return this.chats.size;
    }

    /**
     * Clean up inactive chats
     * @param {number} inactivityThreshold - Inactivity threshold in milliseconds
     * @returns {number} Number of chats cleaned up
     */
    cleanupInactiveChats(inactivityThreshold = 30 * 60 * 1000) { // 30 minutes default
        const now = Date.now();
        const inactiveChats = [];

        for (const [chatId, chat] of this.chats) {
            if (now - chat.lastActivity.getTime() > inactivityThreshold) {
                inactiveChats.push(chatId);
            }
        }

        inactiveChats.forEach(chatId => {
            this.endChat(chatId, 'inactive_timeout');
        });

        return inactiveChats.length;
    }

    /**
     * Get chat history for analysis
     * @param {Object} filters - Filter options
     * @returns {Array} Filtered chat history
     */
    getChatHistory(filters = {}) {
        let history = [...this.chatHistory];

        // Apply filters
        if (filters.type) {
            history = history.filter(chat => chat.type === filters.type);
        }

        if (filters.minDuration) {
            history = history.filter(chat => chat.metadata.duration >= filters.minDuration);
        }

        if (filters.maxDuration) {
            history = history.filter(chat => chat.metadata.duration <= filters.maxDuration);
        }

        if (filters.startDate) {
            history = history.filter(chat => chat.createdAt >= new Date(filters.startDate));
        }

        if (filters.endDate) {
            history = history.filter(chat => chat.createdAt <= new Date(filters.endDate));
        }

        if (filters.limit) {
            history = history.slice(0, filters.limit);
        }

        return history;
    }

    /**
     * Get overall statistics
     * @returns {Object} Overall chat statistics
     */
    getOverallStats() {
        const activeChats = this.getActiveChats();
        const recentHistory = this.chatHistory.slice(-1000); // Last 1000 chats
        
        return {
            totalChats: this.totalChats,
            totalMessages: this.totalMessages,
            activeChats: activeChats.length,
            averageChatDuration: this.calculateAverageHistoryDuration(recentHistory),
            averageMessagesPerChat: this.calculateAverageMessagesPerChat(recentHistory),
            chatTypes: this.getChatTypeDistribution(recentHistory),
            peakConcurrentChats: this.getPeakConcurrentChats(),
            qualityIssueRate: this.getQualityIssueRate(recentHistory),
            completionRate: this.getCompletionRate(recentHistory)
        };
    }

    /**
     * Report chat issue
     * @param {string} chatId - Chat ID
     * @param {string} reporterId - Reporter user ID
     * @param {string} issueType - Type of issue
     * @param {string} description - Issue description
     * @returns {boolean} True if report was recorded
     */
    reportIssue(chatId, reporterId, issueType, description) {
        const chat = this.chats.get(chatId);
        if (!chat) {
            return false;
        }

        if (!chat.reports) {
            chat.reports = [];
        }

        chat.reports.push({
            id: uuidv4(),
            reporterId,
            issueType,
            description,
            timestamp: new Date(),
            status: 'pending'
        });

        // Auto-end chat for severe issues
        const severeIssues = ['harassment', 'inappropriate_content', 'spam'];
        if (severeIssues.includes(issueType)) {
            this.endChat(chatId, 'reported_' + issueType, reporterId);
        }

        return true;
    }

    // Private helper methods

    updateChatAnalytics(chat, message) {
        const now = Date.now();
        const lastMessageTime = chat.analytics.lastMessageTime.getTime();
        
        // Calculate response time
        if (chat.messages.length > 1) {
            const responseTime = now - lastMessageTime;
            chat.analytics.responseTime.push(responseTime);
            
            // Keep only last 50 response times for memory efficiency
            if (chat.analytics.responseTime.length > 50) {
                chat.analytics.responseTime = chat.analytics.responseTime.slice(-50);
            }
        }

        // Update active time
        const timeSinceLastMessage = now - lastMessageTime;
        if (timeSinceLastMessage < 60000) { // Within 1 minute
            chat.analytics.activeTime += timeSinceLastMessage;
        } else {
            chat.analytics.silentPeriods++;
        }

        chat.analytics.lastMessageTime = new Date();
    }

    calculateFinalAnalytics(chat) {
        if (chat.messages.length > 0) {
            // Update average response time
            if (chat.analytics.responseTime.length > 0) {
                const avgResponseTime = chat.analytics.responseTime.reduce((a, b) => a + b, 0) / chat.analytics.responseTime.length;
                chat.analytics.averageResponseTime = avgResponseTime;
            }

            // Calculate engagement score
            const engagementScore = this.calculateEngagementScore(chat);
            chat.analytics.engagementScore = engagementScore;
        }
    }

    calculateEngagementScore(chat) {
        if (chat.messages.length === 0) return 0;

        const duration = chat.metadata.duration;
        const messageCount = chat.messages.length;
        const activeTime = chat.analytics.activeTime;
        const silentPeriods = chat.analytics.silentPeriods;

        // Base score from message frequency
        const messageFrequency = messageCount / (duration / 60000); // messages per minute
        let score = Math.min(messageFrequency * 10, 50); // Max 50 points

        // Bonus for active time ratio
        if (duration > 0) {
            const activeRatio = activeTime / duration;
            score += activeRatio * 30; // Max 30 points
        }

        // Penalty for too many silent periods
        score -= Math.min(silentPeriods * 5, 20); // Max 20 point penalty

        return Math.max(0, Math.min(100, score));
    }

    calculateAverageResponseTime(chat) {
        if (!chat.analytics.responseTime || chat.analytics.responseTime.length === 0) {
            return 0;
        }

        const sum = chat.analytics.responseTime.reduce((a, b) => a + b, 0);
        return sum / chat.analytics.responseTime.length;
    }

    addToHistory(chat) {
        // Create history entry with essential data only
        const historyEntry = {
            id: chat.id,
            type: chat.type,
            createdAt: chat.createdAt,
            endedAt: chat.endedAt,
            duration: chat.metadata.duration,
            messageCount: chat.metadata.messageCount,
            endReason: chat.metadata.endReason,
            engagementScore: chat.analytics.engagementScore || 0,
            qualityIssues: chat.metadata.qualityIssues.length,
            webrtcDuration: chat.analytics.webrtcDuration || 0
        };

        this.chatHistory.push(historyEntry);

        // Maintain history size
        if (this.chatHistory.length > this.maxHistorySize) {
            this.chatHistory = this.chatHistory.slice(-this.maxHistorySize);
        }
    }

    setChatTimeout(chatId) {
        // Clear existing timeout
        this.clearChatTimeout(chatId);
        
        // Set new timeout
        const timeoutId = setTimeout(() => {
            this.endChat(chatId, 'timeout');
        }, this.maxChatDuration);
        
        // Store timeout ID in chat
        const chat = this.chats.get(chatId);
        if (chat) {
            chat.timeoutId = timeoutId;
        }
    }

    clearChatTimeout(chatId) {
        const chat = this.chats.get(chatId);
        if (chat && chat.timeoutId) {
            clearTimeout(chat.timeoutId);
            delete chat.timeoutId;
        }
    }

    calculateAverageHistoryDuration(history) {
        if (history.length === 0) return 0;
        
        const totalDuration = history.reduce((sum, chat) => sum + (chat.duration || 0), 0);
        return totalDuration / history.length;
    }

    calculateAverageMessagesPerChat(history) {
        if (history.length === 0) return 0;
        
        const totalMessages = history.reduce((sum, chat) => sum + (chat.messageCount || 0), 0);
        return totalMessages / history.length;
    }

    getChatTypeDistribution(history) {
        return history.reduce((acc, chat) => {
            acc[chat.type] = (acc[chat.type] || 0) + 1;
            return acc;
        }, {});
    }

    getPeakConcurrentChats() {
        // This would require tracking concurrent chat counts over time
        // For now, return current active count as an approximation
        return this.chats.size;
    }

    getQualityIssueRate(history) {
        if (history.length === 0) return 0;
        
        const chatsWithIssues = history.filter(chat => (chat.qualityIssues || 0) > 0).length;
        return (chatsWithIssues / history.length) * 100;
    }

    getCompletionRate(history) {
        if (history.length === 0) return 0;
        
        const completedChats = history.filter(chat => 
            chat.endReason === 'user_action' && chat.duration > 60000 // At least 1 minute
        ).length;
        
        return (completedChats / history.length) * 100;
    }
}

module.exports = ChatManager;