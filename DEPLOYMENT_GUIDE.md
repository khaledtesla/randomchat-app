# 🚀 Production Deployment Guide for Oracle Server

This guide will help you deploy the RandomChat WebRTC application on an Oracle Cloud server using your public IP.

## 📋 Pre-Deployment Checklist

### Server Requirements
- Ubuntu 20.04+ or similar Linux distribution
- Minimum 2GB RAM, 1 CPU core
- Node.js 16+ installed
- Public IP address from Oracle Cloud

### Domain Setup (Optional but Recommended)
- Purchase a domain name
- Point domain to your Oracle server's public IP
- Set up SSL certificate (Let's Encrypt recommended)

## 🔧 Step-by-Step Deployment

### 1. Server Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install additional tools
sudo apt install -y git nginx certbot python3-certbot-nginx

# Install PM2 globally for process management
sudo npm install -g pm2

# Create application user (security best practice)
sudo useradd -m -s /bin/bash randomchat
sudo usermod -aG sudo randomchat
```

### 2. Application Deployment

```bash
# Switch to application user
sudo su - randomchat

# Clone your application (or upload files)
git clone <your-repository-url> randomchat-app
cd randomchat-app

# Install dependencies
npm install --production

# Copy environment template
cp .env.example .env
```

### 3. Environment Configuration

Edit the `.env` file with your production settings:

```bash
nano .env
```

**Critical settings for Oracle Cloud:**

```env
# Set to production for security
NODE_ENV=production

# Server configuration
PORT=3000
HOST=0.0.0.0

# Your Oracle server's public IP (CRITICAL)
PUBLIC_IP=xxx.xxx.xxx.xxx

# Generate strong secrets (use: openssl rand -base64 32)
JWT_SECRET=your-strong-32-character-secret-key-here
SESSION_SECRET=your-strong-32-character-session-secret-here

# CORS - Add your domain if you have one
ALLOWED_ORIGINS=https://your-domain.com,http://xxx.xxx.xxx.xxx:3000

# WebRTC Configuration
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302

# Optional: Add TURN servers for better NAT traversal
# TURN_SERVERS=[{"urls":"turn:your-turn-server:3478","username":"user","credential":"pass"}]

# Security settings
CONTENT_FILTER_ENABLED=true
PROFANITY_FILTER_STRICT=true
```

### 4. Firewall Configuration

```bash
# Configure Oracle Cloud Security Lists (via Oracle Cloud Console)
# Allow inbound traffic on ports:
# - Port 22 (SSH)
# - Port 80 (HTTP)
# - Port 443 (HTTPS)
# - Port 3000 (Application)

# Configure local firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

### 5. Start the Application

```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
# Follow the instructions shown by PM2
```

### 6. Nginx Configuration (Optional but Recommended)

Create Nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/randomchat
```

Basic configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/randomchat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. SSL Configuration (Recommended)

```bash
# Install SSL certificate using Let's Encrypt
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal (usually set up automatically)
sudo certbot renew --dry-run
```

## 🔍 Testing and Verification

### 1. Health Check
```bash
curl http://localhost:3000/api/health
curl http://your-domain.com/api/health
```

### 2. WebRTC Test
1. Open your application in two different browsers
2. Start a video chat
3. Verify video/audio connection works

### 3. Performance Test
```bash
# Run system monitor
node scripts/monitor.js --report
```

## 📊 Monitoring and Maintenance

### PM2 Management
```bash
# Check status
pm2 status

# View logs
pm2 logs

# Restart application
pm2 restart all

# Zero-downtime reload
pm2 reload all

# Monitor resources
pm2 monit
```

### System Monitoring
```bash
# Start continuous monitoring
node scripts/monitor.js

# Check disk usage
df -h

# Check memory usage
free -h

# Check system load
top
```

### Log Management
```bash
# View application logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# View error logs
tail -f logs/error-$(date +%Y-%m-%d).log

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🔐 Security Best Practices

### 1. Server Security
```bash
# Update packages regularly
sudo apt update && sudo apt upgrade

# Change default SSH port (optional)
sudo nano /etc/ssh/sshd_config
# Change: Port 22 to Port 2222
sudo systemctl restart sshd

# Disable root login
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no

# Install fail2ban
sudo apt install fail2ban
```

### 2. Application Security
- Use strong JWT secrets (32+ characters)
- Enable content filtering
- Set up proper CORS origins
- Monitor logs for suspicious activity
- Keep dependencies updated

### 3. Network Security
- Use Oracle Cloud Security Lists
- Enable local firewall (ufw)
- Consider using CloudFlare for DDoS protection
- Implement rate limiting (already configured)

## 🚨 Troubleshooting

### Common Issues

**Issue**: Application not accessible from external IP
```bash
# Check if application is running
pm2 status

# Check firewall
sudo ufw status

# Check Oracle Cloud Security Lists
# Ensure port 3000 is open in Oracle Cloud Console

# Check if application binds to correct interface
netstat -tlnp | grep 3000
```

**Issue**: WebRTC not working
```bash
# Check STUN/TURN configuration in .env
# Verify PUBLIC_IP is set correctly
# Test from different networks

# Check browser console for WebRTC errors
# Enable browser developer tools
```

**Issue**: High memory usage
```bash
# Monitor with PM2
pm2 monit

# Check logs for memory leaks
pm2 logs

# Restart if necessary
pm2 restart all
```

**Issue**: SSL certificate problems
```bash
# Renew certificate
sudo certbot renew

# Check certificate status
sudo certbot certificates

# Test SSL configuration
openssl s_client -connect your-domain.com:443
```

## 📈 Scaling for High Traffic

### 1. Horizontal Scaling
```bash
# Increase PM2 instances
pm2 scale randomchat-webrtc +2

# Or modify ecosystem.config.js
# instances: 'max' // Use all CPU cores
```

### 2. Load Balancing
- Use Nginx upstream configuration
- Consider Oracle Cloud Load Balancer
- Implement session sticky routing for Socket.IO

### 3. Database Integration
- Add Redis for session storage
- Use MongoDB for persistent data
- Implement connection pooling

### 4. CDN Integration
- Use Oracle Cloud CDN
- Or integrate with CloudFlare
- Serve static assets from CDN

## 🎯 Production Optimization

### Performance Tuning
```bash
# Node.js optimization
export UV_THREADPOOL_SIZE=128

# PM2 optimization
pm2 start ecosystem.config.js --max-memory-restart 1G

# Nginx optimization
# Increase worker connections
# Enable gzip compression
# Set proper cache headers
```

### Monitoring Setup
```bash
# Set up log rotation
sudo nano /etc/logrotate.d/randomchat

# Content:
/home/randomchat/randomchat-app/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
}
```

## 📞 Support and Maintenance

### Regular Maintenance Tasks
1. **Weekly**: Check logs, update dependencies
2. **Monthly**: Security updates, performance review
3. **Quarterly**: Full security audit, capacity planning

### Backup Strategy
```bash
# Backup application
tar -czf randomchat-backup-$(date +%Y%m%d).tar.gz /home/randomchat/randomchat-app

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz /home/randomchat/randomchat-app/logs
```

### Emergency Procedures
```bash
# Quick restart
pm2 restart all

# Full system restart
sudo reboot

# Rollback deployment
# Keep previous version in separate directory
# Switch symlinks for quick rollback
```

---

**🎉 Congratulations! Your RandomChat WebRTC application is now running in production on Oracle Cloud!**

Access your application at: `http://your-oracle-public-ip:3000` or `https://your-domain.com`