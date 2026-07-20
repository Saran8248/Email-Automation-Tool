import { spawn } from 'child_process';

console.log('Starting OutreachSphere development servers...');

// Start the Express backend server
const server = spawn('node', ['server.js'], { 
  stdio: 'inherit', 
  shell: true,
  env: { ...process.env }
});

// Start the Vite client dev server
const client = spawn('npx', ['vite'], { 
  stdio: 'inherit', 
  shell: true,
  env: { ...process.env }
});

// Handle graceful shutdown
const cleanup = () => {
  console.log('\nStopping servers...');
  server.kill();
  client.kill();
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
