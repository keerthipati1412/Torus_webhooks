const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const app = express();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = '0.0.0.0';

// 1. Create proxy middlewares
const socketIoProxy = createProxyMiddleware({
  target: 'http://localhost:5002',
  ws: true, // Upgrade for WebSockets
  changeOrigin: true,
  logLevel: 'debug'
});

const hapticWsProxy = createProxyMiddleware({
  target: 'http://localhost:5000',
  ws: true, // Upgrade for WebSockets
  changeOrigin: true,
  logLevel: 'debug'
});

const authApiProxy = createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  logLevel: 'debug'
});

const hapticApiProxy = createProxyMiddleware({
  target: 'http://localhost:5000',
  changeOrigin: true,
  logLevel: 'debug'
});

const generalApiProxy = createProxyMiddleware({
  target: 'http://localhost:5002',
  changeOrigin: true,
  logLevel: 'debug'
});

// 2. Mount HTTP routes
app.use('/socket.io', socketIoProxy);
app.use('/api/auth', authApiProxy);
app.use('/haptic-status', hapticApiProxy);
app.use('/ws', hapticWsProxy);
app.use('/api', generalApiProxy);

// 3. Serve static files from current directory
app.use(express.static(__dirname));

// 4. Start HTTP Server
const server = app.listen(PORT, HOST, () => {
    console.log(`🌐 Frontend proxy and static server running on http://${HOST}:${PORT}`);
});

// 5. Handle WebSocket upgrades explicitly
server.on('upgrade', (req, socket, head) => {
  console.log(`[UPGRADE] Request URL: ${req.url}`);
  if (req.url.startsWith('/socket.io')) {
    socketIoProxy.upgrade(req, socket, head);
  } else if (req.url.startsWith('/ws')) {
    hapticWsProxy.upgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});
