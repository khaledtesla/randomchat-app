#!/usr/bin/env node
// System monitoring script for production deployment

const http = require('http');
const fs = require('fs');
const path = require('path');

class SystemMonitor {
    constructor() {
        this.config = {
            port: process.env.PORT || 3000,
            checkInterval: 30000, // 30 seconds
            alertThresholds: {
                memory: 85, // %
                cpu: 80,    // %
                connections: 1000,
                responseTime: 5000 // ms
            },
            logFile: path.join(__dirname, '..', 'logs', 'monitor.log')
        };
        
        this.metrics = {
            uptime: 0,
            memory: 0,
            cpu: 0,
            connections: 0,
            responseTime: 0,
            errors: 0,
            lastCheck: new Date()
        };
        
        this.alerts = [];
        this.isRunning = false;
    }

    async start() {
        console.log('🔍 Starting system monitor...');
        this.isRunning = true;
        
        // Ensure logs directory exists
        const logsDir = path.dirname(this.config.logFile);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        
        // Start monitoring loop
        this.monitorLoop();
        
        // Handle graceful shutdown
        process.on('SIGINT', () => this.stop());
        process.on('SIGTERM', () => this.stop());
    }

    async monitorLoop() {
        while (this.isRunning) {
            try {
                await this.collectMetrics();
                this.checkAlerts();
                this.logMetrics();
                
                // Wait for next check
                await this.sleep(this.config.checkInterval);
            } catch (error) {
                console.error('Monitor error:', error);
                this.logError(error);
            }
        }
    }

    async collectMetrics() {
        // Collect system metrics
        this.metrics.lastCheck = new Date();
        
        // Memory usage
        const memoryUsage = process.memoryUsage();
        this.metrics.memory = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);
        
        // Uptime
        this.metrics.uptime = process.uptime();
        
        // Application health check
        try {
            const healthResponse = await this.healthCheck();
            this.metrics.responseTime = healthResponse.responseTime;
            this.metrics.connections = healthResponse.data.onlineUsers || 0;
            this.metrics.errors = 0; // Reset error count on successful check
        } catch (error) {
            this.metrics.errors++;
            this.metrics.responseTime = -1;
        }
    }

    async healthCheck() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const options = {
                hostname: 'localhost',
                port: this.config.port,
                path: '/api/health',
                method: 'GET',
                timeout: 10000
            };
            
            const req = http.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    const responseTime = Date.now() - startTime;
                    
                    try {
                        const response = JSON.parse(data);
                        resolve({
                            responseTime,
                            data: response,
                            statusCode: res.statusCode
                        });
                    } catch (error) {
                        reject(new Error(`Invalid JSON response: ${data}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Health check timeout'));
            });
            
            req.setTimeout(options.timeout);
            req.end();
        });
    }

    checkAlerts() {
        const now = new Date();
        const newAlerts = [];
        
        // Memory alert
        if (this.metrics.memory > this.config.alertThresholds.memory) {
            newAlerts.push({
                type: 'memory',
                severity: 'high',
                message: `High memory usage: ${this.metrics.memory}%`,
                timestamp: now
            });
        }
        
        // Response time alert
        if (this.metrics.responseTime > this.config.alertThresholds.responseTime) {
            newAlerts.push({
                type: 'performance',
                severity: 'medium',
                message: `Slow response time: ${this.metrics.responseTime}ms`,
                timestamp: now
            });
        }
        
        // Connection count alert
        if (this.metrics.connections > this.config.alertThresholds.connections) {
            newAlerts.push({
                type: 'capacity',
                severity: 'medium',
                message: `High connection count: ${this.metrics.connections}`,
                timestamp: now
            });
        }
        
        // Health check failure alert
        if (this.metrics.errors > 3) {
            newAlerts.push({
                type: 'availability',
                severity: 'critical',
                message: `Health check failures: ${this.metrics.errors}`,
                timestamp: now
            });
        }
        
        // Log new alerts
        newAlerts.forEach(alert => {
            console.log(`🚨 ${alert.severity.toUpperCase()} ALERT: ${alert.message}`);
            this.alerts.push(alert);
        });
        
        // Keep only recent alerts (last 24 hours)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        this.alerts = this.alerts.filter(alert => alert.timestamp > oneDayAgo);
    }

    logMetrics() {
        const logEntry = {
            timestamp: this.metrics.lastCheck.toISOString(),
            uptime: Math.round(this.metrics.uptime),
            memory: this.metrics.memory,
            connections: this.metrics.connections,
            responseTime: this.metrics.responseTime,
            errors: this.metrics.errors,
            alerts: this.alerts.length
        };
        
        // Console output
        console.log(`📊 ${logEntry.timestamp} | Memory: ${logEntry.memory}% | ` +
                   `Connections: ${logEntry.connections} | Response: ${logEntry.responseTime}ms | ` +
                   `Uptime: ${logEntry.uptime}s`);
        
        // File logging
        const logLine = JSON.stringify(logEntry) + '\n';
        fs.appendFileSync(this.config.logFile, logLine);
        
        // Rotate log file if it gets too large (>10MB)
        try {
            const stats = fs.statSync(this.config.logFile);
            if (stats.size > 10 * 1024 * 1024) {
                this.rotateLogFile();
            }
        } catch (error) {
            // Ignore rotation errors
        }
    }

    rotateLogFile() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = this.config.logFile.replace('.log', `-${timestamp}.log`);
        
        try {
            fs.renameSync(this.config.logFile, rotatedFile);
            console.log(`📝 Rotated log file to: ${rotatedFile}`);
        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }

    logError(error) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            type: 'monitor_error',
            message: error.message,
            stack: error.stack
        };
        
        const logLine = JSON.stringify(errorEntry) + '\n';
        fs.appendFileSync(this.config.logFile, logLine);
    }

    generateReport() {
        const now = new Date();
        const uptime = Math.round(this.metrics.uptime);
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        
        const report = {
            timestamp: now.toISOString(),
            uptime: `${uptimeHours}h ${uptimeMinutes}m`,
            currentMetrics: this.metrics,
            alerts: {
                total: this.alerts.length,
                critical: this.alerts.filter(a => a.severity === 'critical').length,
                high: this.alerts.filter(a => a.severity === 'high').length,
                medium: this.alerts.filter(a => a.severity === 'medium').length
            },
            recentAlerts: this.alerts.slice(-5)
        };
        
        console.log('\n📊 SYSTEM REPORT');
        console.log('=================');
        console.log(JSON.stringify(report, null, 2));
        
        return report;
    }

    stop() {
        console.log('\n🛑 Stopping system monitor...');
        this.isRunning = false;
        this.generateReport();
        process.exit(0);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
if (require.main === module) {
    const monitor = new SystemMonitor();
    
    // Handle command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--report')) {
        // Generate one-time report
        monitor.collectMetrics().then(() => {
            monitor.generateReport();
            process.exit(0);
        });
    } else {
        // Start continuous monitoring
        monitor.start();
    }
}

module.exports = SystemMonitor;