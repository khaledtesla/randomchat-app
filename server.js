// server.js - Main server file
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const UserManager = require('./src/managers/UserManager');
const ChatManager = require('./src/managers/ChatManager');
const MatchingEngine = require('./src/services/MatchingEngine');
const Logger = require('./src/utils/Logger');
const config = require('./src/config/config');

class RandomChatServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: config.ALLOWED_ORIGINS,
                methods: ["GET", "POST"]
            },
            transports: ['websocket', 'polling']
        });

        this.userManager = new UserManager();
        this.chatManager = new ChatManager();
        this.matchingEngine = new MatchingEngine();
        this.logger = new Logger();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.startCleanupTasks();
    }

    setupMiddleware() {
        // Validate security configuration
        const securityErrors = config.validateSecurityConfig();
        if (securityErrors.length > 0) {
            this.logger.error('Security configuration errors:', securityErrors);
            if (config.isProduction()) {
                throw new Error('Security configuration invalid for production: ' + securityErrors.join(', '));
            }
        }

        // Enhanced security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: [
                        "'self'", 
                        "'unsafe-inline'", // Required for inline scripts
                        "https://www.googletagmanager.com",
                        "https://pagead2.googlesyndication.com",
                        "https://www.google-analytics.com"
                    ],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: [
                        "'self'", 
                        "data:", 
                        "https://www.google-analytics.com",
                        "https://pagead2.googlesyndication.com",
                        "https://googleads.g.doubleclick.net"
                    ],
                    connectSrc: [
                        "'self'", 
                        "wss:", 
                        "ws:",
                        "https://www.google-analytics.com",
                        "https://pagead2.googlesyndication.com"
                    ],
                    frameSrc: [
                        "https://pagead2.googlesyndication.com",
                        "https://googleads.g.doubleclick.net"
                    ],
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"],
                    fontSrc: ["'self'", "https:", "data:"],
                    formAction: ["'self'"]
                },
                reportOnly: !config.isProduction()
            },
            crossOriginEmbedderPolicy: false, // Required for WebRTC
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        }));
        
        // Enhanced CORS with validation
        this.app.use(cors({
            origin: (origin, callback) => {
                // Allow requests with no origin (mobile apps, curl, etc.)
                if (!origin) return callback(null, true);
                
                // Check if origin is allowed
                const allowedOrigins = [...config.ALLOWED_ORIGINS, ...config.TRUSTED_AD_DOMAINS];
                
                if (allowedOrigins.some(allowed => {
                    if (allowed === '*') return true;
                    if (typeof allowed === 'string') return origin === allowed;
                    if (allowed instanceof RegExp) return allowed.test(origin);
                    return false;
                })) {
                    return callback(null, true);
                }
                
                this.logger.warn(`CORS blocked origin: ${origin}`);
                return callback(new Error('Not allowed by CORS'), false);
            },
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            maxAge: 86400 // 24 hours
        }));

        // Enhanced rate limiting with different limits for different endpoints
        const apiLimiter = rateLimit({
            windowMs: config.RATE_LIMIT_WINDOW_MS,
            max: config.RATE_LIMIT_MAX_REQUESTS,
            message: {
                error: 'Too many requests',
                retryAfter: Math.ceil(config.RATE_LIMIT_WINDOW_MS / 1000)
            },
            standardHeaders: true,
            legacyHeaders: false
        });
        
        // More restrictive rate limiting for chat endpoints
        const chatLimiter = rateLimit({
            windowMs: 60 * 1000, // 1 minute
            max: 60, // 60 messages per minute
            message: {
                error: 'Too many messages',
                retryAfter: 60
            }
        });

        this.app.use('/api', apiLimiter);
        this.app.use('/socket.io', apiLimiter);

        // Body parsing with size limits
        this.app.use(express.json({ 
            limit: '10kb',
            verify: (req, res, buf) => {
                // Store raw body for validation if needed
                req.rawBody = buf;
            }
        }));
        
        this.app.use(express.urlencoded({ 
            extended: false, 
            limit: '10kb' 
        }));

        // Security headers middleware
        this.app.use((req, res, next) => {
            // Prevent MIME type sniffing
            res.setHeader('X-Content-Type-Options', 'nosniff');
            
            // Prevent clickjacking
            res.setHeader('X-Frame-Options', 'DENY');
            
            // XSS protection
            res.setHeader('X-XSS-Protection', '1; mode=block');
            
            // Referrer policy
            res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
            
            // Permissions policy
            res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
            
            next();
        });

        this.app.use(express.static('public', {
            setHeaders: (res, path) => {
                // Cache static files for 1 hour in development, 1 day in production
                const maxAge = config.isProduction() ? 86400 : 3600;
                res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
            }
        }));
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                onlineUsers: this.userManager.getOnlineCount(),
                activeChats: this.chatManager.getActiveChatCount(),
                version: process.env.npm_package_version || '1.0.0',
                environment: config.NODE_ENV
            });
        });

        // Statistics endpoint
        this.app.get('/api/stats', (req, res) => {
            res.json({
                onlineUsers: this.userManager.getOnlineCount(),
                activeChats: this.chatManager.getActiveChatCount(),
                totalConnections: this.userManager.getTotalConnections(),
                averageWaitTime: this.matchingEngine.getAverageWaitTime(),
                serverUptime: process.uptime()
            });
        });

        // Client configuration endpoint
        this.app.get('/api/config', (req, res) => {
            res.json({
                googleAnalyticsId: config.GOOGLE_ANALYTICS_ID,
                adsenseClientId: config.GOOGLE_ADSENSE_CLIENT_ID,
                maxMessageLength: config.MAX_MESSAGE_LENGTH,
                environment: config.NODE_ENV,
                webrtcConfig: config.getWebRTCConfig()
            });
        });

        // Debug endpoint for development
        if (!config.isProduction()) {
            this.app.get('/api/debug', (req, res) => {
                res.json({
                    onlineUsers: this.userManager.getOnlineCount(),
                    usersList: Array.from(this.userManager.users.values()).map(u => ({
                        id: u.id,
                        profile: u.profile,
                        connectionTime: u.connectionTime
                    })),
                    queueStats: this.matchingEngine.getQueueStats(),
                    activeChats: this.chatManager.getActiveChatCount(),
                    environment: config.NODE_ENV
                });
            });
        }

        // Input validation middleware
        this.app.use('/api', (req, res, next) => {
            const errors = this.validateInput(req);
            if (errors.length > 0) {
                this.logger.warn('Input validation failed:', { errors, ip: req.ip });
                return res.status(400).json({ 
                    error: 'Invalid input',
                    details: errors
                });
            }
            next();
        });

        // Serve the main application
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            this.logger.error('Express error:', err);
            
            if (err.type === 'entity.parse.failed') {
                return res.status(400).json({ error: 'Invalid JSON' });
            }
            
            if (err.type === 'entity.too.large') {
                return res.status(413).json({ error: 'Request too large' });
            }
            
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            this.logger.info(`User connected: ${socket.id}`);

            // Handle user registration
            socket.on('register-user', (userData) => {
                this.handleUserRegistration(socket, userData);
            });

            // Handle match finding
            socket.on('find-match', (preferences) => {
                this.handleFindMatch(socket, preferences);
            });

            // Handle chat messages
            socket.on('chat-message', (messageData) => {
                this.handleChatMessage(socket, messageData);
            });

            // Handle WebRTC signaling
            socket.on('webrtc-offer', (data) => {
                this.handleWebRTCOffer(socket, data);
            });

            socket.on('webrtc-answer', (data) => {
                this.handleWebRTCanswer(socket, data);
            });

            socket.on('ice-candidate', (data) => {
                this.handleICECandidate(socket, data);
            });

            // Handle typing indicators
            socket.on('typing-start', () => {
                this.handleTypingStart(socket);
            });

            socket.on('typing-stop', () => {
                this.handleTypingStop(socket);
            });

            // Handle chat ending
            socket.on('end-chat', () => {
                this.handleEndChat(socket);
            });

            // Handle user disconnect
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });

            // Send initial stats
            this.sendStats(socket);
        });
    }

    handleUserRegistration(socket, userData) {
        try {
            const user = this.userManager.createUser(socket.id, userData);
            socket.userId = user.id;
            socket.userProfile = userData;

            socket.emit('registration-success', {
                userId: user.id,
                onlineCount: this.userManager.getOnlineCount()
            });

            // Broadcast updated online count
            this.io.emit('online-count-update', {
                count: this.userManager.getOnlineCount()
            });

            this.logger.info(`User registered: ${user.id}`, userData);
        } catch (error) {
            this.logger.error('User registration failed:', error);
            socket.emit('registration-error', { message: 'Registration failed' });
        }
    }

    async handleFindMatch(socket, preferences) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) {
                socket.emit('match-error', { message: 'User not found' });
                return;
            }

            this.logger.info(`User ${user.id} looking for match with preferences:`, preferences);
            socket.emit('match-searching', { message: 'Searching for a match...' });

            // Add user to matching queue
            const match = await this.matchingEngine.findMatch(user, preferences);
            
            // Debug logging
            const queueStats = this.matchingEngine.getQueueStats();
            this.logger.info(`Queue stats:`, queueStats);

            if (match) {
                // Create chat room
                const chatRoom = this.chatManager.createChat(user.id, match.id, preferences.chatType);
                
                // Join both users to the chat room
                const userSocket = this.io.sockets.sockets.get(user.socketId);
                const matchSocket = this.io.sockets.sockets.get(match.socketId);

                if (userSocket && matchSocket) {
                    userSocket.join(chatRoom.id);
                    matchSocket.join(chatRoom.id);

                    // Notify both users of successful match
                    userSocket.emit('match-found', {
                        chatId: chatRoom.id,
                        chatType: preferences.chatType,
                        stranger: {
                            id: match.id,
                            filters: this.getPublicProfile(match)
                        }
                    });

                    matchSocket.emit('match-found', {
                        chatId: chatRoom.id,
                        chatType: preferences.chatType,
                        stranger: {
                            id: user.id,
                            filters: this.getPublicProfile(user)
                        }
                    });

                    // Send initial system message
                    this.io.to(chatRoom.id).emit('system-message', {
                        message: 'You are now connected to a stranger. Say hello!',
                        timestamp: new Date().toISOString()
                    });

                    this.logger.info(`Match created: ${user.id} <-> ${match.id}`);
                }
            } else {
                // No immediate match found, user added to queue
                const queuePosition = this.matchingEngine.getQueuePosition(user.id);
                socket.emit('match-queued', { 
                    message: `Looking for someone to chat with... (Position: ${queuePosition}, Online: ${this.userManager.getOnlineCount()})`,
                    position: queuePosition,
                    onlineUsers: this.userManager.getOnlineCount()
                });
                
                this.logger.info(`User ${user.id} added to queue. Position: ${queuePosition}, Online users: ${this.userManager.getOnlineCount()}`);
            }
        } catch (error) {
            this.logger.error('Match finding failed:', error);
            socket.emit('match-error', { message: 'Failed to find match' });
        }
    }

    handleChatMessage(socket, messageData) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) return;

            const chat = this.chatManager.getUserCurrentChat(user.id);
            if (!chat) {
                socket.emit('chat-error', { message: 'No active chat found' });
                return;
            }

            // Enhanced message validation
            const validationResult = this.validateMessage(messageData);
            if (!validationResult.isValid) {
                socket.emit('chat-error', { message: validationResult.error });
                this.logger.warn('Message validation failed:', {
                    userId: user.id,
                    error: validationResult.error,
                    message: messageData.message?.substring(0, 50) + '...'
                });
                return;
            }

            // Apply enhanced content filtering
            const filteredMessage = this.filterMessage(messageData.message);
            
            const message = {
                id: this.generateMessageId(),
                senderId: user.id,
                message: filteredMessage,
                timestamp: new Date().toISOString(),
                type: 'user'
            };

            // Save message to chat history
            this.chatManager.addMessage(chat.id, message);

            // Send to all users in the chat room except sender
            socket.to(chat.id).emit('chat-message', {
                ...message,
                senderType: 'stranger'
            });

            // Confirm message sent to sender
            socket.emit('message-sent', {
                messageId: message.id,
                timestamp: message.timestamp
            });

            this.logger.debug(`Message sent in chat ${chat.id}: ${user.id}`);
        } catch (error) {
            this.logger.error('Message handling failed:', error);
            socket.emit('chat-error', { message: 'Failed to send message' });
        }
    }

    handleWebRTCOffer(socket, data) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) return;

            const chat = this.chatManager.getUserCurrentChat(user.id);
            if (!chat) return;

            // Forward offer to the other user
            socket.to(chat.id).emit('webrtc-offer', {
                offer: data.offer,
                senderId: user.id
            });

            this.logger.debug(`WebRTC offer forwarded from ${user.id}`);
        } catch (error) {
            this.logger.error('WebRTC offer handling failed:', error);
        }
    }

    handleWebRTCanswer(socket, data) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) return;

            const chat = this.chatManager.getUserCurrentChat(user.id);
            if (!chat) return;

            // Forward answer to the other user
            socket.to(chat.id).emit('webrtc-answer', {
                answer: data.answer,
                senderId: user.id
            });

            this.logger.debug(`WebRTC answer forwarded from ${user.id}`);
        } catch (error) {
            this.logger.error('WebRTC answer handling failed:', error);
        }
    }

    handleICECandidate(socket, data) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) return;

            const chat = this.chatManager.getUserCurrentChat(user.id);
            if (!chat) return;

            // Forward ICE candidate to the other user
            socket.to(chat.id).emit('ice-candidate', {
                candidate: data.candidate,
                senderId: user.id
            });
        } catch (error) {
            this.logger.error('ICE candidate handling failed:', error);
        }
    }

    handleTypingStart(socket) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) return;

            const chat = this.chatManager.getUserCurrentChat(user.id);
            if (!chat) return;

            socket.to(chat.id).emit('stranger-typing', { typing: true });
        } catch (error) {
            this.logger.error('Typing start handling failed:', error);
        }
    }

    handleTypingStop(socket) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) return;

            const chat = this.chatManager.getUserCurrentChat(user.id);
            if (!chat) return;

            socket.to(chat.id).emit('stranger-typing', { typing: false });
        } catch (error) {
            this.logger.error('Typing stop handling failed:', error);
        }
    }

    handleEndChat(socket) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (!user) return;

            const chat = this.chatManager.getUserCurrentChat(user.id);
            if (!chat) return;

            // Notify the other user
            socket.to(chat.id).emit('chat-ended', {
                reason: 'stranger_left',
                message: 'Stranger has disconnected'
            });

            // Leave the chat room
            socket.leave(chat.id);

            // End the chat
            this.chatManager.endChat(chat.id);

            // Remove user from matching queue if they were in it
            this.matchingEngine.removeFromQueue(user.id);

            socket.emit('chat-ended-confirm', {
                message: 'Chat ended successfully'
            });

            this.logger.info(`Chat ended by user: ${user.id}`);
        } catch (error) {
            this.logger.error('End chat handling failed:', error);
        }
    }

    handleDisconnect(socket) {
        try {
            const user = this.userManager.getUser(socket.id);
            if (user) {
                // Handle ongoing chat
                const chat = this.chatManager.getUserCurrentChat(user.id);
                if (chat) {
                    socket.to(chat.id).emit('chat-ended', {
                        reason: 'stranger_disconnected',
                        message: 'Stranger has disconnected'
                    });
                    this.chatManager.endChat(chat.id);
                }

                // Remove from matching queue
                this.matchingEngine.removeFromQueue(user.id);

                // Remove user
                this.userManager.removeUser(socket.id);

                // Broadcast updated online count
                this.io.emit('online-count-update', {
                    count: this.userManager.getOnlineCount()
                });

                this.logger.info(`User disconnected: ${socket.id}`);
            }
        } catch (error) {
            this.logger.error('Disconnect handling failed:', error);
        }
    }

    sendStats(socket) {
        socket.emit('stats-update', {
            onlineUsers: this.userManager.getOnlineCount(),
            activeChats: this.chatManager.getActiveChatCount()
        });
    }

    getPublicProfile(user) {
        // Return only safe, public information about the user
        return {
            gender: user.profile?.gender || 'not-specified',
            location: user.profile?.location || 'unknown',
            age: user.profile?.age || 'not-specified',
            interests: user.profile?.keywords || []
        };
    }

    filterMessage(message) {
        if (!config.CONTENT_FILTER_ENABLED) {
            return message.substring(0, config.MAX_MESSAGE_LENGTH);
        }

        // Enhanced content filtering with different severity levels
        const inappropriate = {
            // High severity - replace completely
            high: [
                'spam', 'scam', 'fraud', 'phishing',
                'advertisement', 'promotion', 'sell', 'buy'
            ],
            // Medium severity - partial censoring
            medium: [
                'stupid', 'idiot', 'hate'
            ],
            // Low severity - warn but allow
            low: [
                'annoying', 'boring'
            ]
        };

        let filtered = message;
        
        // High severity filtering
        inappropriate.high.forEach(word => {
            const regex = new RegExp(word, 'gi');
            filtered = filtered.replace(regex, '[REMOVED]');
        });

        // Medium severity filtering
        if (config.PROFANITY_FILTER_STRICT) {
            inappropriate.medium.forEach(word => {
                const regex = new RegExp(word, 'gi');
                filtered = filtered.replace(regex, '*'.repeat(word.length));
            });
        }

        // Remove excessive whitespace and normalize
        filtered = filtered.replace(/\s+/g, ' ').trim();
        
        // URL filtering
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
        filtered = filtered.replace(urlRegex, '[LINK REMOVED]');
        
        // Email filtering
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
        filtered = filtered.replace(emailRegex, '[EMAIL REMOVED]');
        
        // Phone number filtering
        const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
        filtered = filtered.replace(phoneRegex, '[PHONE REMOVED]');

        return filtered.substring(0, config.MAX_MESSAGE_LENGTH);
    }

    validateMessage(messageData) {
        if (!messageData) {
            return { isValid: false, error: 'Message data is required' };
        }

        if (!messageData.message) {
            return { isValid: false, error: 'Message content is required' };
        }

        if (typeof messageData.message !== 'string') {
            return { isValid: false, error: 'Message must be a string' };
        }

        const trimmedMessage = messageData.message.trim();
        
        if (trimmedMessage.length === 0) {
            return { isValid: false, error: 'Message cannot be empty' };
        }

        if (trimmedMessage.length > config.MAX_MESSAGE_LENGTH) {
            return { 
                isValid: false, 
                error: `Message exceeds maximum length of ${config.MAX_MESSAGE_LENGTH} characters` 
            };
        }

        // Check for suspicious patterns
        const suspiciousPatterns = [
            /^.{1,3}$/, // Too short (1-3 chars)
            /^(.)\1{10,}$/, // Repeated character spam
            /[A-Z]{10,}/, // Excessive caps
            /(.)\1{5,}/, // Character repetition
            /\d{10,}/, // Long number sequences
            /[!@#$%^&*()]{5,}/ // Symbol spam
        ];

        for (const pattern of suspiciousPatterns) {
            if (pattern.test(trimmedMessage)) {
                return { isValid: false, error: 'Message contains suspicious patterns' };
            }
        }

        return { isValid: true };
    }

    validateInput(req) {
        const errors = [];
        
        // Validate content type for POST requests
        if (req.method === 'POST' && !req.is('application/json')) {
            errors.push('Content-Type must be application/json');
        }
        
        // Check for suspicious headers
        const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip'];
        for (const header of suspiciousHeaders) {
            if (req.headers[header] && typeof req.headers[header] === 'string') {
                // Basic IP validation
                const ipPattern = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
                if (!ipPattern.test(req.headers[header].split(',')[0].trim())) {
                    errors.push(`Invalid ${header} header format`);
                }
            }
        }
        
        // Validate user agent
        const userAgent = req.headers['user-agent'];
        if (!userAgent || userAgent.length < 10 || userAgent.length > 500) {
            errors.push('Invalid or missing User-Agent header');
        }
        
        return errors;
    }

    generateMessageId() {
        return Date.now().toString() + Math.random().toString(36).substr(2, 9);
    }

    startCleanupTasks() {
        // Clean up inactive chats every 5 minutes
        setInterval(() => {
            this.chatManager.cleanupInactiveChats();
        }, 5 * 60 * 1000);

        // Clean up stale matching queue entries every minute
        setInterval(() => {
            this.matchingEngine.cleanupQueue();
        }, 60 * 1000);

        // Broadcast stats every 30 seconds
        setInterval(() => {
            this.io.emit('stats-update', {
                onlineUsers: this.userManager.getOnlineCount(),
                activeChats: this.chatManager.getActiveChatCount()
            });
        }, 30 * 1000);
    }

    start(port = 3000, host = config.HOST) {
        this.server.listen(port, host, () => {
            this.logger.info(`RandomChat server is running on ${host}:${port}`);
            console.log(`🚀 Server running at http://${host}:${port}`);
            console.log(`📊 Health check: http://${host}:${port}/api/health`);
            console.log(`📈 Statistics: http://${host}:${port}/api/stats`);
            console.log(`🌐 Public access: http://YOUR_PUBLIC_IP:${port}`);
        });
    }
}

module.exports = RandomChatServer;

// Start the server if this file is run directly
if (require.main === module) {
    const server = new RandomChatServer();
    server.start(process.env.PORT || 3000, process.env.HOST || '0.0.0.0');
}