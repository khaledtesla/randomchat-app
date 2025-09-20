// src/config/config.js - Configuration management with environment validation
require('dotenv').config();

class Config {
    constructor() {
        this.NODE_ENV = process.env.NODE_ENV || 'development';
        this.PORT = parseInt(process.env.PORT) || 3000;
        this.HOST = process.env.HOST || '0.0.0.0';
        
        // Security Configuration
        this.ALLOWED_ORIGINS = this.parseAllowedOrigins();
        this.TRUSTED_AD_DOMAINS = this.parseTrustedAdDomains();
        this.JWT_SECRET = process.env.JWT_SECRET || this.generateRandomSecret();
        this.SESSION_SECRET = process.env.SESSION_SECRET || this.generateRandomSecret();
        
        // Rate Limiting
        this.RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 minutes
        this.RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
        
        // Chat Configuration
        this.MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH) || 500;
        this.MAX_CHAT_DURATION = parseInt(process.env.MAX_CHAT_DURATION) || 60 * 60 * 1000; // 1 hour
        this.CONTENT_FILTER_ENABLED = process.env.CONTENT_FILTER_ENABLED !== 'false';
        this.PROFANITY_FILTER_STRICT = process.env.PROFANITY_FILTER_STRICT === 'true';
        
        // WebRTC Configuration
        this.STUN_SERVERS = this.parseStunServers();
        this.TURN_SERVERS = this.parseTurnServers();
        
        // Analytics & Ads
        this.GOOGLE_ANALYTICS_ID = process.env.GOOGLE_ANALYTICS_ID || '';
        this.GOOGLE_ADSENSE_CLIENT_ID = process.env.GOOGLE_ADSENSE_CLIENT_ID || '';
        
        // Database (optional for production logging)
        this.REDIS_URL = process.env.REDIS_URL || '';
        this.MONGODB_URL = process.env.MONGODB_URL || '';
        
        // Logging
        this.LOG_LEVEL = process.env.LOG_LEVEL || (this.isProduction() ? 'info' : 'debug');
        this.LOG_FILE_PATH = process.env.LOG_FILE_PATH || './logs';
        
        // Monitoring
        this.HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000; // 30 seconds
        this.CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL) || 5 * 60 * 1000; // 5 minutes
        
        // Oracle Cloud Configuration
        this.PUBLIC_IP = process.env.PUBLIC_IP || '';
        this.INTERNAL_IP = process.env.INTERNAL_IP || '0.0.0.0';
        this.SSL_ENABLED = process.env.SSL_ENABLED === 'true';
        this.SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
        this.SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
        
        this.validateConfig();
    }

    parseAllowedOrigins() {
        const origins = process.env.ALLOWED_ORIGINS || '';
        if (!origins) {
            return this.isProduction() ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'];
        }
        return origins.split(',').map(origin => origin.trim());
    }

    parseTrustedAdDomains() {
        const domains = process.env.TRUSTED_AD_DOMAINS || '';
        const defaultDomains = [
            'https://www.googletagmanager.com',
            'https://pagead2.googlesyndication.com',
            'https://www.google-analytics.com',
            'https://googleads.g.doubleclick.net'
        ];
        
        if (!domains) {
            return defaultDomains;
        }
        
        return [...defaultDomains, ...domains.split(',').map(domain => domain.trim())];
    }

    parseStunServers() {
        const servers = process.env.STUN_SERVERS || '';
        const defaultServers = [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302'
        ];
        
        if (!servers) {
            return defaultServers;
        }
        
        return servers.split(',').map(server => server.trim());
    }

    parseTurnServers() {
        const servers = process.env.TURN_SERVERS || '';
        if (!servers) {
            return [];
        }
        
        try {
            return JSON.parse(servers);
        } catch (error) {
            console.warn('Invalid TURN_SERVERS configuration:', error.message);
            return [];
        }
    }

    generateRandomSecret() {
        if (this.isProduction()) {
            throw new Error('JWT_SECRET and SESSION_SECRET must be set in production environment');
        }
        
        const crypto = require('crypto');
        return crypto.randomBytes(64).toString('hex');
    }

    validateConfig() {
        const errors = [];
        
        // Validate production requirements
        if (this.isProduction()) {
            if (!this.JWT_SECRET || this.JWT_SECRET.length < 32) {
                errors.push('JWT_SECRET must be at least 32 characters in production');
            }
            
            if (!this.SESSION_SECRET || this.SESSION_SECRET.length < 32) {
                errors.push('SESSION_SECRET must be at least 32 characters in production');
            }
            
            if (this.ALLOWED_ORIGINS.length === 0) {
                errors.push('ALLOWED_ORIGINS must be configured in production');
            }
            
            if (!this.PUBLIC_IP) {
                console.warn('PUBLIC_IP not set - WebRTC may not work correctly');
            }
        }
        
        // Validate port range
        if (this.PORT < 1 || this.PORT > 65535) {
            errors.push('PORT must be between 1 and 65535');
        }
        
        // Validate rate limiting
        if (this.RATE_LIMIT_MAX_REQUESTS < 1) {
            errors.push('RATE_LIMIT_MAX_REQUESTS must be greater than 0');
        }
        
        // Validate message length
        if (this.MAX_MESSAGE_LENGTH < 1 || this.MAX_MESSAGE_LENGTH > 10000) {
            errors.push('MAX_MESSAGE_LENGTH must be between 1 and 10000');
        }
        
        // Validate SSL configuration
        if (this.SSL_ENABLED) {
            if (!this.SSL_CERT_PATH || !this.SSL_KEY_PATH) {
                errors.push('SSL_CERT_PATH and SSL_KEY_PATH must be set when SSL_ENABLED is true');
            }
        }
        
        if (errors.length > 0) {
            throw new Error('Configuration validation failed:\n' + errors.join('\n'));
        }
    }

    validateSecurityConfig() {
        const errors = [];
        
        if (this.isProduction()) {
            // Check for default/weak secrets
            if (this.JWT_SECRET.includes('default') || this.JWT_SECRET.includes('secret')) {
                errors.push('JWT_SECRET appears to use default/weak values');
            }
            
            // Check for wildcard origins in production
            if (this.ALLOWED_ORIGINS.includes('*')) {
                errors.push('Wildcard (*) origins not allowed in production');
            }
            
            // Check for localhost origins in production
            const hasLocalhost = this.ALLOWED_ORIGINS.some(origin => 
                origin.includes('localhost') || origin.includes('127.0.0.1')
            );
            if (hasLocalhost) {
                errors.push('Localhost origins should not be allowed in production');
            }
        }
        
        return errors;
    }

    isProduction() {
        return this.NODE_ENV === 'production';
    }

    isDevelopment() {
        return this.NODE_ENV === 'development';
    }

    isTest() {
        return this.NODE_ENV === 'test';
    }

    getWebRTCConfig() {
        const iceServers = [
            ...this.STUN_SERVERS.map(url => ({ urls: url })),
            ...this.TURN_SERVERS
        ];
        
        return {
            iceServers,
            iceCandidatePoolSize: 10
        };
    }

    getServerConfig() {
        return {
            host: this.HOST,
            port: this.PORT,
            ssl: {
                enabled: this.SSL_ENABLED,
                cert: this.SSL_CERT_PATH,
                key: this.SSL_KEY_PATH
            }
        };
    }

    getCORSConfig() {
        return {
            origin: this.ALLOWED_ORIGINS,
            credentials: true,
            methods: ['GET', 'POST', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
        };
    }

    getHelmetConfig() {
        return {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: [
                        "'self'", 
                        "'unsafe-inline'",
                        ...this.TRUSTED_AD_DOMAINS
                    ],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: [
                        "'self'", 
                        "data:", 
                        ...this.TRUSTED_AD_DOMAINS
                    ],
                    connectSrc: [
                        "'self'", 
                        "wss:", 
                        "ws:",
                        ...this.TRUSTED_AD_DOMAINS
                    ],
                    frameSrc: this.TRUSTED_AD_DOMAINS,
                    objectSrc: ["'none'"],
                    baseUri: ["'self'"],
                    fontSrc: ["'self'", "https:", "data:"],
                    formAction: ["'self'"]
                },
                reportOnly: !this.isProduction()
            },
            crossOriginEmbedderPolicy: false, // Required for WebRTC
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }
        };
    }

    // Method to update configuration at runtime (for development)
    updateConfig(updates) {
        if (this.isProduction()) {
            throw new Error('Configuration updates not allowed in production');
        }
        
        Object.assign(this, updates);
        this.validateConfig();
    }

    // Get sanitized config for client
    getClientConfig() {
        return {
            maxMessageLength: this.MAX_MESSAGE_LENGTH,
            googleAnalyticsId: this.GOOGLE_ANALYTICS_ID,
            adsenseClientId: this.GOOGLE_ADSENSE_CLIENT_ID,
            environment: this.NODE_ENV,
            webrtcConfig: this.getWebRTCConfig()
        };
    }
}

// Create and export singleton instance
const config = new Config();

module.exports = config;