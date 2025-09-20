@echo off
REM Startup script for RandomChat WebRTC Application on Windows

echo 🚀 Starting RandomChat WebRTC Application...

REM Check Node.js version
node --version
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo 📝 Creating .env file from .env.example...
    copy .env.example .env
    echo ⚠️  Please edit .env file with your server configuration before starting!
    echo    Especially set PUBLIC_IP to your server's public IP address
    pause
    exit /b 1
)

REM Create logs directory
if not exist logs mkdir logs
echo 📁 Created logs directory

REM Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo 📦 Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

REM Check if PM2 is installed globally
pm2 --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 📦 Installing PM2 globally...
    npm install -g pm2
    if %errorlevel% neq 0 (
        echo ❌ Failed to install PM2
        pause
        exit /b 1
    )
)

REM Start the application with PM2
echo 🎬 Starting application with PM2...
pm2 start ecosystem.config.js --env production
if %errorlevel% neq 0 (
    echo ❌ Failed to start application
    pause
    exit /b 1
)

REM Save PM2 configuration
pm2 save

echo ✅ RandomChat WebRTC Application started successfully!
echo.
echo 📊 Application Status:
pm2 status

echo.
echo 🌐 Access your application at:
echo    Local: http://localhost:3000
echo    Public: Replace with your server's public IP
echo.
echo 📈 Monitoring commands:
echo    pm2 status          - Check application status
echo    pm2 logs            - View application logs
echo    pm2 restart all     - Restart all processes
echo    pm2 stop all        - Stop all processes
echo    pm2 reload all      - Zero-downtime reload
echo.
echo 🔍 Health check:
echo    curl http://localhost:3000/api/health

pause