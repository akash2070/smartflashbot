require('dotenv').config();
const { ethers } = require('ethers');
const logger = require('./src/utils/logger');
const dashboardServer = require('./src/dashboard/server');
const priceService = require('./src/dashboard/priceService');
const config = require('./src/config');

// Ensure we're using real blockchain data 
process.env.USE_SIMULATED_DATA = 'false';
process.env.USE_REAL_BLOCKCHAIN = 'true';

// Use reliable public RPC endpoints since we're having connection issues
process.env.BNB_PREMIUM_RPC_1 = "https://bsc-dataseed.binance.org/"; // Binance official RPC
process.env.BNB_PREMIUM_RPC_2 = "https://bsc-dataseed1.binance.org/"; // Binance official RPC
process.env.BNB_PREMIUM_RPC_3 = "https://bsc-dataseed2.binance.org/"; // Binance official RPC
process.env.BNB_PREMIUM_RPC_4 = "https://bsc-dataseed3.binance.org/"; // Binance official RPC
process.env.BNB_RPC_URL_KEY = "https://bsc-dataseed4.binance.org/"; // Binance official RPC

// Use these RPC endpoints for each pair
process.env.WBNB_BUSD_RPC_URL = "https://bsc-dataseed.binance.org/"; // For WBNB/BUSD
process.env.WBNB_USDT_RPC_URL = "https://bsc-dataseed1.binance.org/"; // For WBNB/USDT
process.env.CAKE_WBNB_RPC_URL = "https://bsc-dataseed2.binance.org/"; // For CAKE/WBNB
process.env.BUSD_USDT_RPC_URL = "https://bsc-dataseed3.binance.org/"; // For BUSD/USDT

// Check for essential environment variables
const requiredEnvVars = ['PRIVATE_KEY'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  logger.warn('Using fallback values for missing environment variables');
}

if (!process.env.SESSION_SECRET) {
  logger.warn("SESSION_SECRET not found in environment variables. Using a random secret (will change on restart).");
  process.env.SESSION_SECRET = require('crypto').randomBytes(32).toString('hex');
}

// Log that we're using real blockchain data
logger.info('Dashboard will use real blockchain data for price updates');


// Start the dashboard server
logger.info('Starting Flash Loan Arbitrage Bot Dashboard');

// Initialize price service for real-time data
logger.info('Initializing price service...');

priceService.initialize().then(success => {
  if (success) {
    logger.info('✅ Price service initialized successfully');
  } else {
    logger.warn('⚠️ Price service initialization failed, dashboard will show limited data');
  }
  
  // Start the dashboard server regardless of price service initialization
}).catch(error => {
  logger.error('❌ Error initializing price service:', error.message);
  logger.warn('⚠️ Dashboard will start with limited functionality');
});

// Start the dashboard server
const port = process.env.PORT || 5000;
const host = '0.0.0.0';
const server = dashboardServer.start(port, host);


// Handle shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down dashboard server...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down dashboard server...');
  server.stop();
  process.exit(0);
});
