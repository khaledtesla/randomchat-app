// src/utils/Logger.js - Production-ready logging utility with structured logging
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

class Logger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || process.env.LOG_LEVEL || 'info';
        this.logPath = options.logPath || process.env.LOG_FILE_PATH || './logs';
        this.serviceName = options.serviceName || 'RandomChat';
        this.enableConsole = options.enableConsole !== false;
        
        // Ensure log directory exists
        this.ensureLogDirectory();
        
        // Create Winston logger
        this.logger = this.createLogger();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logPath)) {
            fs.mkdirSync(this.logPath, { recursive: true });
        }
    }

    createLogger() {
        const formats = winston.format;
        
        // Custom format for production logs
        const productionFormat = formats.combine(
            formats.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
            formats.errors({ stack: true }),
            formats.json(),
            formats.printf(({ timestamp, level, message, service, ...meta }) => {
                const logEntry = {
                    timestamp,
                    level: level.toUpperCase(),
                    service: this.serviceName,
                    message,
                    ...meta
                };
                
                // Add request context if available
                if (meta.requestId) {
                    logEntry.requestId = meta.requestId;
                }
                
                // Add user context if available
                if (meta.userId) {
                    logEntry.userId = meta.userId;
                }
                
                return JSON.stringify(logEntry);
            })
        );

        // Development format (more readable)
        const developmentFormat = formats.combine(
            formats.timestamp({ format: 'HH:mm:ss.SSS' }),
            formats.colorize({ all: true }),
            formats.errors({ stack: true }),
            formats.printf(({ timestamp, level, message, ...meta }) => {
                let log = `[${timestamp}] ${level}: ${message}`;
                
                // Add metadata if present
                const metaKeys = Object.keys(meta).filter(key => 
                    !['timestamp', 'level', 'message', 'service'].includes(key)
                );
                
                if (metaKeys.length > 0) {
                    const metaStr = metaKeys.map(key => {
                        const value = typeof meta[key] === 'object' 
                            ? JSON.stringify(meta[key]) 
                            : meta[key];
                        return `${key}=${value}`;
                    }).join(' ');
                    log += ` | ${metaStr}`;
                }
                
                return log;
            })
        );

        const isProduction = process.env.NODE_ENV === 'production';
        const transports = [];

        // Console transport
        if (this.enableConsole) {
            transports.push(new winston.transports.Console({
                level: this.logLevel,
                format: isProduction ? productionFormat : developmentFormat,
                handleExceptions: true,
                handleRejections: true
            }));
        }

        // File transports for production
        if (isProduction || process.env.LOG_TO_FILE === 'true') {
            // Combined log (all levels)
            transports.push(new DailyRotateFile({
                filename: path.join(this.logPath, 'combined-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '100m',
                maxFiles: '30d',
                level: this.logLevel,
                format: productionFormat,
                handleExceptions: true,
                handleRejections: true
            }));

            // Error log (errors only)
            transports.push(new DailyRotateFile({
                filename: path.join(this.logPath, 'error-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '100m',
                maxFiles: '30d',
                level: 'error',
                format: productionFormat
            }));

            // Access log for HTTP requests
            transports.push(new DailyRotateFile({
                filename: path.join(this.logPath, 'access-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '100m',
                maxFiles: '30d',
                level: 'info',
                format: productionFormat
            }));
        }

        return winston.createLogger({
            level: this.logLevel,
            transports,
            exitOnError: false,
            // Prevent duplicate logs
            defaultMeta: { service: this.serviceName }
        });
    }

    // Helper method to add request context
    withRequest(req) {
        const requestId = req.headers['x-request-id'] || 
                         req.id || 
                         Math.random().toString(36).substr(2, 9);
        
        return {
            info: (message, meta = {}) => this.info(message, { ...meta, requestId, ip: req.ip }),
            warn: (message, meta = {}) => this.warn(message, { ...meta, requestId, ip: req.ip }),
            error: (message, meta = {}) => this.error(message, { ...meta, requestId, ip: req.ip }),
            debug: (message, meta = {}) => this.debug(message, { ...meta, requestId, ip: req.ip })
        };
    }

    // Helper method to add user context
    withUser(userId) {
        return {
            info: (message, meta = {}) => this.info(message, { ...meta, userId }),
            warn: (message, meta = {}) => this.warn(message, { ...meta, userId }),
            error: (message, meta = {}) => this.error(message, { ...meta, userId }),
            debug: (message, meta = {}) => this.debug(message, { ...meta, userId })
        };
    }

    // Core logging methods
    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    error(message, meta = {}) {
        if (message instanceof Error) {
            this.logger.error(message.message, { 
                ...meta, 
                stack: message.stack,
                errorName: message.name 
            });
        } else {
            this.logger.error(message, meta);
        }
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Specialized logging methods
    httpAccess(req, res, responseTime) {
        const logData = {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            userAgent: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            contentLength: res.get('content-length') || 0
        };

        // Add user info if available
        if (req.user) {
            logData.userId = req.user.id || req.user._id;
        }

        this.logger.info('HTTP Request', logData);
    }

    socketConnection(socketId, userId = null) {
        this.logger.info('Socket connection established', {
            socketId,
            userId,
            event: 'socket:connect'
        });
    }

    socketDisconnection(socketId, userId = null, reason = null) {
        this.logger.info('Socket disconnected', {
            socketId,
            userId,
            reason,
            event: 'socket:disconnect'
        });
    }

    webrtcEvent(event, data = {}) {
        this.logger.debug('WebRTC event', {
            event: `webrtc:${event}`,
            ...data
        });
    }

    chatEvent(event, chatId, userId, data = {}) {
        this.logger.info('Chat event', {
            event: `chat:${event}`,
            chatId,
            userId,
            ...data
        });
    }

    securityEvent(event, details = {}) {
        this.logger.warn('Security event', {
            event: `security:${event}`,
            ...details,
            timestamp: new Date().toISOString()
        });
    }

    performanceMetric(metric, value, unit = '', meta = {}) {
        this.logger.info('Performance metric', {
            event: 'performance:metric',
            metric,
            value,
            unit,
            ...meta
        });
    }

    // System monitoring
    systemHealth(metrics) {
        this.logger.info('System health check', {
            event: 'system:health',
            ...metrics,
            timestamp: new Date().toISOString()
        });
    }

    // Error handling for uncaught exceptions
    setupGlobalErrorHandling() {
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught Exception', {
                error: error.message,
                stack: error.stack,
                event: 'process:uncaughtException'
            });
            
            // Give logger time to write before exiting
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.logger.error('Unhandled Rejection', {
                reason: reason instanceof Error ? reason.message : reason,
                stack: reason instanceof Error ? reason.stack : undefined,
                promise: promise.toString(),
                event: 'process:unhandledRejection'
            });
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            this.logger.info('Received SIGTERM, shutting down gracefully');
            this.shutdown();
        });

        process.on('SIGINT', () => {
            this.logger.info('Received SIGINT, shutting down gracefully');
            this.shutdown();
        });
    }

    shutdown() {
        this.logger.info('Logger shutting down');
        this.logger.end();
    }

    // Utility method for timing operations
    timer(label) {
        const start = Date.now();
        return {
            end: (meta = {}) => {
                const duration = Date.now() - start;
                this.performanceMetric(label, duration, 'ms', meta);
                return duration;
            }
        };
    }

    // Log level management
    setLevel(level) {
        this.logger.level = level;
        this.logger.transports.forEach(transport => {
            transport.level = level;
        });
    }

    getLevel() {
        return this.logger.level;
    }

    // Health check for logging system
    healthCheck() {
        try {
            this.logger.info('Logger health check');
            return {
                status: 'healthy',
                level: this.logger.level,
                transports: this.logger.transports.length
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }
}

module.exports = Logger;