const { spawn } = require('child_process');
const path = require('path');

console.log("============================================================");
console.log("🚀 Starting Torus Concurrently...");
console.log("============================================================\n");

console.log("📡 Starting Torus Signaling/Main Server (Port 5002)...");
const signaling = spawn('node', ['server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: { ...process.env, PORT: '5002' }
});

console.log("🌐 Starting Torus Frontend Static Server (Port 3000)...");
const frontend = spawn('node', ['serve-frontend.js'], {
  cwd: __dirname,
  stdio: 'inherit'
});

console.log("🔑 Starting Torus OTP/Database Backend Server (Port 5003)...");
const backend = spawn('npm', ['start'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: '5003' }
});

const cleanup = () => {
  console.log("\n🛑 Stopping all Torus services...");
  try {
    signaling.kill();
  } catch (e) { }
  try {
    frontend.kill();
  } catch (e) { }
  try {
    backend.kill();
  } catch (e) { }
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
