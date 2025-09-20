// PM2 Ecosystem Configuration for RandomChat WebRTC App
module.exports = {
  apps: [{
    name: 'randomchat-webrtc',
    script: 'server.js',
    instances: 'max', // Use all available CPU cores
    exec_mode: 'cluster',
    
    // Environment configuration
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Logging
    log_file: './logs/pm2-combined.log',
    out_file: './logs/pm2-out.log',
    error_file: './logs/pm2-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto-restart configuration
    watch: false, // Set to true in development if you want file watching
    ignore_watch: ['node_modules', 'logs', 'public'],
    max_memory_restart: '1G',
    
    // Process management
    min_uptime: '10s',
    max_restarts: 10,
    autorestart: true,
    
    // Health monitoring
    health_check_url: 'http://localhost:3000/api/health',
    health_check_grace_period: 30000,
    
    // Advanced PM2 features
    merge_logs: true,
    combine_logs: true,
    time: true,
    
    // Kill timeout
    kill_timeout: 5000,
    
    // Environment variables for production
    env_vars: {
      'UV_THREADPOOL_SIZE': 128
    }
  }]
};