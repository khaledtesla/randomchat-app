#!/usr/bin/env node
// Health check script for Docker and monitoring systems

const http = require('http');

const options = {
    hostname: 'localhost',
    port: process.env.PORT || 3000,
    path: '/api/health',
    method: 'GET',
    timeout: 5000
};

const healthCheck = () => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (res.statusCode === 200 && response.status === 'OK') {
                        resolve(response);
                    } else {
                        reject(new Error(`Health check failed: ${res.statusCode} - ${data}`));
                    }
                } catch (error) {
                    reject(new Error(`Invalid JSON response: ${data}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`Health check request failed: ${error.message}`));
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Health check request timed out'));
        });
        
        req.setTimeout(options.timeout);
        req.end();
    });
};

// Run health check
healthCheck()
    .then((response) => {
        console.log('✅ Health check passed:', JSON.stringify(response, null, 2));
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Health check failed:', error.message);
        process.exit(1);
    });