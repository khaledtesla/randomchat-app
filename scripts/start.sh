#!/bin/bash
# Startup script for RandomChat WebRTC Application on Oracle Server

set -e

echo "🚀 Starting RandomChat WebRTC Application..."

# Check if we're running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  WARNING: Running as root is not recommended for security reasons"
    echo "   Consider creating a dedicated user for the application"
fi

# Check Node.js version
NODE_VERSION=$(node --version)
echo "📦 Node.js version: $NODE_VERSION"

# Check if required environment file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your Oracle server configuration before starting!"
    echo "   Especially set PUBLIC_IP to your Oracle server's public IP address"
    exit 1
fi

# Source environment variables
source .env

# Validate critical environment variables
if [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" = "your.oracle.server.public.ip" ]; then
    echo "❌ PUBLIC_IP not configured in .env file"
    echo "   Please set PUBLIC_IP to your Oracle server's public IP address"
    exit 1
fi

# Create logs directory
mkdir -p logs
echo "📁 Created logs directory"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if PM2 is installed globally
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    npm install -g pm2
fi

# Check system resources
echo "💻 System resources:"
echo "   Memory: $(free -h | awk '/^Mem:/ {print $3 "/" $2}')"
echo "   Disk: $(df -h / | awk 'NR==2 {print $3 "/" $2 " (" $5 " used)"}')"
echo "   CPU cores: $(nproc)"

# Configure firewall (if ufw is available)
if command -v ufw &> /dev/null; then
    echo "🔥 Configuring firewall..."
    sudo ufw allow $PORT/tcp
    echo "   Opened port $PORT for the application"
fi

# Start the application with PM2
echo "🎬 Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup

echo "✅ RandomChat WebRTC Application started successfully!"
echo ""
echo "📊 Application Status:"
pm2 status

echo ""
echo "🌐 Access your application at:"
echo "   Local: http://localhost:$PORT"
echo "   Public: http://$PUBLIC_IP:$PORT"
echo ""
echo "📈 Monitoring commands:"
echo "   pm2 status          - Check application status"
echo "   pm2 logs            - View application logs"
echo "   pm2 restart all     - Restart all processes"
echo "   pm2 stop all        - Stop all processes"
echo "   pm2 reload all      - Zero-downtime reload"
echo ""
echo "🔍 Health check:"
echo "   curl http://localhost:$PORT/api/health"