# 🧪 Testing Guide - RandomChat WebRTC App

## Why "Looking for someone to chat with..." appears

The app is working correctly! The message "Looking for someone to chat with..." appears because:

1. **You need 2+ users** to match with each other
2. **The matching algorithm** is waiting for another user with compatible preferences
3. **You're testing alone** - which is normal during development

## 🚀 How to Test the App

### Method 1: Multiple Browser Tabs (Recommended)
1. **Open 2 browser tabs** pointing to `http://localhost:3000`
2. **Set different profiles** in each tab (different gender, age, etc.)
3. **Click "Start Chatting"** in both tabs
4. **They should match** and connect!

### Method 2: Different Browsers
1. **Open Chrome** and go to `http://localhost:3000`
2. **Open Firefox/Edge** and go to `http://localhost:3000`
3. **Start chatting** in both browsers
4. **Watch them connect!**

### Method 3: Demo Mode (New Feature!)
1. **Click "Start Chatting"**
2. **Wait 5 seconds** for the demo options to appear
3. **Click "Simulate Match (Demo)"** to test the interface
4. **Try sending messages** to the demo bot

## 🔍 Debug Information

### Check Current Status
Visit these URLs to see what's happening:

- **Health Check**: `http://localhost:3000/api/health`
- **Statistics**: `http://localhost:3000/api/stats`  
- **Debug Info**: `http://localhost:3000/api/debug` (development only)

### Browser Console
Open **Developer Tools** (F12) and check the console for:
- WebSocket connection status
- Match-finding progress
- WebRTC connection logs

## 📊 Understanding the Matching Process

1. **User Registration**: Each browser tab creates a unique user
2. **Queue Addition**: Users are added to the matching queue
3. **Compatibility Check**: Algorithm checks gender, age, location, interests
4. **Match Creation**: Compatible users are paired together
5. **Chat Room Setup**: WebRTC connection established

## 🎯 Testing Different Scenarios

### Test Text Chat
1. Set chat type to "Text Chat"
2. Open multiple tabs
3. Match and send messages

### Test Video Chat
1. Set chat type to "Video Chat"
2. **Allow camera/microphone** permissions
3. Open second tab and match
4. Test video/audio quality

### Test Filtering
1. **Tab 1**: Male, 18-25, USA
2. **Tab 2**: Female, 18-25, USA  
3. Should match quickly due to compatibility

1. **Tab 1**: Male, 18-25, USA
2. **Tab 2**: Male, 26-35, Europe
3. May take longer or not match (depending on preferences)

## 🐛 Troubleshooting

### "Looking for someone to chat with..." for too long
- **Solution**: Open another browser tab/window
- **Check**: Visit `/api/debug` to see online users count

### WebRTC not working
- **Allow permissions** for camera/microphone
- **Check browser compatibility** (Chrome/Firefox work best)
- **Try different network** if behind strict firewall

### Connection issues
- **Refresh the page** and try again
- **Check browser console** for error messages
- **Verify server is running** on port 3000

## 📱 Mobile Testing

### On Same Network
1. **Find your computer's IP** (e.g., 192.168.1.100)
2. **Open mobile browser** to `http://192.168.1.100:3000`
3. **Test with desktop browser** simultaneously

### Different Networks
1. **Deploy to server** with public IP
2. **Test from different networks**
3. **Verify WebRTC NAT traversal**

## 🔧 Configuration for Testing

### Quick Testing Setup
Edit `.env` file:
```env
NODE_ENV=development
LOG_LEVEL=debug
```

### Enable More Verbose Logging
The app now shows:
- User count in queue messages
- Queue position
- Online users count
- Detailed matching logs

## 🎉 Production Testing

### With Real Users
1. **Deploy to Oracle server**
2. **Share the public URL**
3. **Monitor with**: `http://your-ip:3000/api/stats`
4. **Check logs**: `tail -f logs/combined-*.log`

---

## 💡 Pro Tips

1. **Use Incognito/Private** browsing for clean tests
2. **Different user profiles** increase match probability  
3. **Check Network tab** in DevTools to see WebSocket traffic
4. **Monitor server logs** to understand matching process
5. **Test WebRTC** on different networks for production readiness

**Your app is working perfectly! The "looking for match" message is normal when testing alone.** 🎯