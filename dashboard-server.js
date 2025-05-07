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
const requiredEnvVars = ['PRIVATE_KEY', 'SESSION_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  process.exit(1);
}

// Log that we're using real blockchain data
logger.info('Dashboard will use real blockchain data for price updates');


// Start the dashboard server
logger.info('Starting Flash Loan Arbitrage Bot Dashboard');

// Initialize price service
(async () => {
  try {
    logger.info('Initializing price service for real-time blockchain data...');
    const initialized = await priceService.initialize();

    if (initialized) {
      logger.info('Price service initialized successfully');
    } else {
      logger.error('Failed to initialize price service');
    }
  } catch (error) {
    logger.error(`Error initializing price service: ${error.message}`);
  }
})();

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