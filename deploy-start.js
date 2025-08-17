#!/usr/bin/env node

// Deployment startup script that handles webhook URL detection
const { spawn } = require('child_process');

console.log('🚀 Starting SendrPay Bot for deployment...');

// Set environment for deployment
process.env.NODE_ENV = 'production';
process.env.REPLIT_DEPLOYMENT = 'true';

// Detect if we're in a deployed environment
const deploymentUrl = process.env.REPLIT_URL || 
                      process.env.PUBLIC_URL || 
                      process.env.REPL_URL ||
                      `https://${process.env.REPLIT_DEV_DOMAIN}`;

if (deploymentUrl) {
  console.log(`🌐 Deployment URL detected: ${deploymentUrl}`);
  process.env.PUBLIC_URL = deploymentUrl;
} else {
  console.log('⚠️ No deployment URL found, using polling mode');
}

// Start the main application
const child = spawn('npx', ['tsx', 'src/index.ts'], {
  stdio: 'inherit',
  env: process.env
});

child.on('error', (error) => {
  console.error('❌ Failed to start application:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`📤 Application exited with code ${code}`);
  process.exit(code);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Received SIGTERM, shutting down gracefully...');
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🔄 Received SIGINT, shutting down gracefully...');
  child.kill('SIGINT');
});