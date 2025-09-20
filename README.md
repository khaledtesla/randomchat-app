# RandomChat WebRTC - Production-Ready Anonymous Chat Application

A secure, scalable WebRTC-powered random chat application with video/text chat capabilities, built for production deployment on Oracle Cloud or any server infrastructure.

## 🎯 Features

### Core Features
- **Anonymous Random Matching**: Smart algorithm matches users based on preferences
- **WebRTC Video Chat**: High-quality peer-to-peer video communication
- **Text Chat**: Fast, real-time text messaging with Socket.IO
- **Advanced Filtering**: Match by gender, age, location, and interests
- **User Safety**: Content filtering, reporting system, and trust scoring

### Production Features
- **Enterprise Security**: Rate limiting, CORS, CSP, input validation
- **Scalable Architecture**: Clustered deployment with PM2
- **Comprehensive Logging**: Structured logging with Winston
- **Health Monitoring**: Built-in health checks and system monitoring
- **Docker Support**: Containerized deployment with Docker Compose
- **SSL/TLS Ready**: HTTPS support with Nginx reverse proxy

### Technical Stack
- **Backend**: Node.js, Express, Socket.IO
- **WebRTC**: Native WebRTC with STUN/TURN server support
- **Security**: Helmet, Express Rate Limit, CORS
- **Monitoring**: Custom monitoring system with alerts
- **Deployment**: PM2, Docker, Nginx

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm 8+
- (Optional) PM2 for production
- (Optional) Docker for containerized deployment

### Installation

1. **Clone and Setup**
```bash
git clone <your-repo-url>
cd randomchat-webrtc
npm install
```

2. **Configure Environment**
```bash
cp .env.example .env
# Edit .env with your server configuration
```

3. **Start Development Server**
```bash
npm run dev
```

4. **Start Production Server**
```bash
# Using PM2 (recommended)
npm run pm2:start

# Or using Node.js directly
npm start
```

## 📋 Oracle Server Deployment

### Step 1: Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2
```

### Step 2: Application Setup
```bash
# Upload your application files to the server
# Then navigate to your application directory

# Make startup script executable
chmod +x scripts/start.sh

# Run the startup script
./scripts/start.sh
```

### Step 3: Configure Environment
Edit `.env` file with your Oracle server settings:
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
PUBLIC_IP=your.oracle.server.public.ip

# Security
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
SESSION_SECRET=your-super-secure-session-secret-minimum-32-characters
ALLOWED_ORIGINS=https://your-domain.com

# WebRTC
STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
```

### Step 4: Configure Firewall
```bash
# Allow application port
sudo ufw allow 3000/tcp

# For HTTPS (if using Nginx)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

## 🐳 Docker Deployment

### Simple Docker Run
```bash
# Build image
docker build -t randomchat-webrtc .

# Run container
docker run -p 3000:3000 --env-file .env randomchat-webrtc
```

### Docker Compose (Recommended)
```bash
# Start with basic services
docker-compose up -d

# Start with all services (Redis, MongoDB, Nginx)
docker-compose --profile with-redis --profile with-mongodb --profile with-nginx up -d
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Environment (development/production) | development | No |
| `PORT` | Server port | 3000 | No |
| `HOST` | Server host | 0.0.0.0 | No |
| `PUBLIC_IP` | Your server's public IP | - | **Yes** |
| `JWT_SECRET` | JWT secret key | - | **Yes** |
| `ALLOWED_ORIGINS` | Allowed CORS origins | localhost | **Yes** |
| `STUN_SERVERS` | STUN servers for WebRTC | Google STUN | No |
| `TURN_SERVERS` | TURN servers for NAT traversal | [] | No |

### WebRTC Configuration
For optimal WebRTC performance, especially behind NAT:

1. **STUN Servers** (included by default):
   - `stun:stun.l.google.com:19302`
   - Free, good for most scenarios

2. **TURN Servers** (recommended for production):
   ```env
   TURN_SERVERS=[{"urls":"turn:your-turn-server:3478","username":"user","credential":"pass"}]
   ```

### Security Configuration
The application includes comprehensive security measures:

- **Rate Limiting**: Prevents abuse and DoS attacks
- **CORS**: Restricts cross-origin requests
- **CSP**: Content Security Policy headers
- **Input Validation**: Sanitizes all user inputs
- **Content Filtering**: Blocks inappropriate content

## 📊 Monitoring & Maintenance

### Health Monitoring
```bash
# Check application health
curl http://localhost:3000/api/health

# Get statistics
curl http://localhost:3000/api/stats

# Run health check script
node scripts/health-check.js
```

### System Monitoring
```bash
# Start system monitor
node scripts/monitor.js

# Generate system report
node scripts/monitor.js --report
```

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

# Stop application
pm2 stop all
```

## 🔐 Security Best Practices

### Server Security
1. **Update regularly**: Keep Node.js and dependencies updated
2. **Use HTTPS**: Deploy with SSL/TLS certificates
3. **Firewall**: Only open necessary ports
4. **User permissions**: Don't run as root
5. **Secrets management**: Use strong, unique secrets

### Application Security
1. **Environment**: Set `NODE_ENV=production`
2. **Origins**: Configure `ALLOWED_ORIGINS` properly
3. **Rate limits**: Adjust based on your needs
4. **Content filtering**: Enable for user safety
5. **Monitoring**: Set up alerts for security events

## 🐛 Troubleshooting

### Common Issues

**Issue**: WebRTC not working behind NAT
**Solution**: Configure TURN servers in `.env`:
```env
TURN_SERVERS=[{"urls":"turn:your-turn-server:3478","username":"user","credential":"pass"}]
```

**Issue**: Application not accessible from external IP
**Solution**: Check firewall and ensure `HOST=0.0.0.0`

**Issue**: High memory usage
**Solution**: Monitor with `node scripts/monitor.js` and adjust PM2 configuration

**Issue**: Socket.IO connection failed
**Solution**: Verify CORS settings and firewall configuration

### Logs
- Application logs: `./logs/`
- PM2 logs: `pm2 logs`
- System logs: `/var/log/` (Linux)

## 📈 Performance Optimization

### For High Traffic
1. **Load Balancing**: Use Nginx upstream configuration
2. **Caching**: Implement Redis for session storage
3. **Database**: Use MongoDB for persistent data
4. **CDN**: Serve static assets via CDN
5. **Monitoring**: Set up comprehensive monitoring

### Resource Requirements
- **Minimum**: 1 CPU, 1GB RAM, 10GB storage
- **Recommended**: 2+ CPU, 4GB RAM, 50GB storage
- **High Traffic**: 4+ CPU, 8GB RAM, 100GB storage

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- WebRTC community for excellent documentation
- Socket.IO team for real-time communication
- Express.js for the robust web framework
- All contributors and users of this project

## 📞 Support

- Create an issue for bug reports
- Join our Discord for community support
- Email: support@yourapp.com

---

**Built with ❤️ for the open source community**