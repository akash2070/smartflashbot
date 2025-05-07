/**
 * Dashboard server for monitoring bot performance
 */
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const moment = require('moment');
const logger = require('../utils/logger');
const { formatEther } = require('ethers').utils;
const priceService = require('./priceService');
const session = require('express-session');

class DashboardServer {
  constructor() {
    // Initialize Express
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.io = socketIo(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Initialize default data
    this.initializeStats();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketEvents();
  }

  /**
   * Initialize default stats and data
   */
  initializeStats() {
    this.stats = {
      totalOpportunities: 0,
      profitableOpportunities: 0,
      executedArbitrages: 0,
      failedArbitrages: 0,
      totalProfit: '0',
      botStatus: 'initializing',
      botStatusMessage: 'Starting up...',
      lastUpdated: new Date().toISOString(),
      walletAddress: '',
      walletBalance: '0',
      mevStats: {
        backrunsDetected: 0,
        backrunsExecuted: 0,
        sandwichesDetected: 0,
        sandwichesExecuted: 0,
        hourlyProfit: '0',
        pendingTransactions: 0
      },
      safetyStatus: {
        cooldown: {
          active: false,
          consecutiveFailures: 0,
          remainingTime: 0
        },
        networkCongestion: {
          isHighGasPrice: false,
          currentGasPrice: 1.0,
          maxGasPrice: 5.0
        },
        competitiveBots: {
          detected: false,
          slippageMultiplier: 1.0
        }
      }
    };

    this.transactions = [];
    this.opportunities = [];
    this.prices = {
      'WBNB/BUSD': { 
        pancakeV2: 'N/A', 
        pancakeV3: 'N/A', 
        apeswap: 'N/A',
        biswap: 'N/A',
        timestamp: new Date().toISOString()
      },
      'WBNB/USDT': { 
        pancakeV2: 'N/A', 
        pancakeV3: 'N/A', 
        apeswap: 'N/A',
        biswap: 'N/A',
        timestamp: new Date().toISOString()
      },
      'CAKE/WBNB': { 
        pancakeV2: 'N/A', 
        pancakeV3: 'N/A', 
        apeswap: 'N/A',
        biswap: 'N/A',
        timestamp: new Date().toISOString()
      },
      'BUSD/USDT': { 
        pancakeV2: 'N/A', 
        pancakeV3: 'N/A', 
        apeswap: 'N/A',
        biswap: 'N/A',
        timestamp: new Date().toISOString()
      }
    };

    // Set sample price data
    this.updateSamplePrices();
  }

  /**
   * Set up Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Set up session for security
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'flash-loan-arbitrage-bot-secret',
      resave: false,
      saveUninitialized: true,
      cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
      }
    }));
    
    // Serve static files
    this.app.use(express.static(path.join(__dirname, '../../public')));
  }

  /**
   * Set up Express routes
   */
  setupRoutes() {
    // Home route
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../../public/index.html'));
    });

    // API routes
    this.app.get('/api/stats', (req, res) => {
      res.json(this.stats);
    });

    this.app.get('/api/transactions', (req, res) => {
      res.json(this.transactions);
    });

    this.app.get('/api/opportunities', (req, res) => {
      res.json(this.opportunities);
    });

    this.app.get('/api/prices', (req, res) => {
      res.json(this.prices);
    });
    
    // API route for MEV configuration and status
    this.app.get('/api/mev', (req, res) => {
      const config = require('../config');
      const mevConfig = {
        enabled: config.MEV?.ENABLED || false,
        strategies: {
          enabled: config.MEV?.STRATEGIES?.ENABLED || false,
          backrun: config.MEV?.STRATEGIES?.BACKRUN?.ENABLED || false,
          sandwich: config.MEV?.STRATEGIES?.SANDWICH?.ENABLED || false
        },
        protection: {
          enabled: config.MEV?.PROTECTION?.ENABLED || false,
          methods: config.MEV?.PROTECTION?.METHODS || {}
        },
        stats: this.stats.mevStats || {}
      };
      res.json(mevConfig);
    });

    // API route to get all prices for the price checker utility
    this.app.get('/api/all-prices', async (req, res) => {
      try {
        const allPrices = await priceService.getAllPrices();
        res.json(allPrices);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Set up Socket.IO events
   */
  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      logger.info(`Dashboard client connected: ${socket.id}`);

      // Send initial data
      socket.emit('stats', this.stats);
      socket.emit('transactions', this.transactions);
      socket.emit('opportunities', this.opportunities);
      
      // Setup price socket events
      this.setupPriceSocketEvents(socket);

      socket.on('disconnect', () => {
        logger.info(`Dashboard client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Start the dashboard server
   * @param {number} port - Port to listen on
   * @param {string} host - Host to bind to
   * @returns {object} - Server instance
   */
  start(port, host) {
    this.httpServer.listen(port, host, () => {
      logger.info(`Dashboard server running at http://${host}:${port}`);
    });
    
    return this;
  }

  /**
   * Stop the dashboard server
   */
  stop() {
    this.httpServer.close();
    logger.info('Dashboard server stopped');
  }

  /**
   * Update performance statistics
   * @param {Object} stats - Updated statistics
   */
  updateStats(stats) {
    this.stats = { ...this.stats, ...stats, lastUpdated: new Date().toISOString() };
    this.io.emit('stats', this.stats);
  }

  /**
   * Add a transaction to the recent transactions list
   * @param {Object} transaction - Transaction details
   */
  addTransaction(transaction) {
    this.transactions.unshift(transaction);
    this.transactions = this.transactions.slice(0, 50); // Keep last 50 transactions
    this.io.emit('transactions', this.transactions);
  }

  /**
   * Update bot status
   * @param {string} status - New status (running, paused, error)
   * @param {string} [message] - Optional status message
   */
  updateBotStatus(status, message) {
    this.stats.botStatus = status;
    this.stats.botStatusMessage = message || '';
    this.stats.lastUpdated = new Date().toISOString();
    this.io.emit('stats', this.stats);
    logger.info(`Updating bot status: ${status} - ${message || ''}`);
  }

  /**
   * Update safety status information
   * @param {Object} safetyData - Safety feature status data
   */
  updateSafetyStatus(safetyData) {
    this.stats.safetyStatus = safetyData;
    this.stats.lastUpdated = new Date().toISOString();
    this.io.emit('stats', this.stats);
  }

  /**
   * Update Socket.IO routes for price data
   */
  setupPriceSocketEvents(socket) {
    socket.on('price-data', async () => {
      logger.info(`Price data requested by client: ${socket.id}`);
      
      // First send any cached price data
      socket.emit('price-update', this.prices);
      
      // Then try to update with fresh data from blockchain
      try {
        logger.info('Fetching real price data from blockchain...');
        
        // Begin with WBNB/BUSD which has highest liquidity
        const wbnbBusdPrices = await priceService.getPricesForPair('WBNB/BUSD');
        if (wbnbBusdPrices) {
          this.prices['WBNB/BUSD'] = wbnbBusdPrices;
          socket.emit('price-update', this.prices);
        }
        
        // Then get prices for the other pairs
        try {
          const wbnbUsdtPrices = await priceService.getPricesForPair('WBNB/USDT');
          if (wbnbUsdtPrices) {
            this.prices['WBNB/USDT'] = wbnbUsdtPrices;
            socket.emit('price-update', this.prices);
          }
        } catch (e) {
          logger.error(`Error fetching WBNB/USDT prices: ${e.message}`);
        }
        
        try {
          const cakeWbnbPrices = await priceService.getPricesForPair('CAKE/WBNB');
          if (cakeWbnbPrices) {
            this.prices['CAKE/WBNB'] = cakeWbnbPrices;
            socket.emit('price-update', this.prices);
          }
        } catch (e) {
          logger.error(`Error fetching CAKE/WBNB prices: ${e.message}`);
        }
        
        try {
          const busdUsdtPrices = await priceService.getPricesForPair('BUSD/USDT');
          if (busdUsdtPrices) {
            this.prices['BUSD/USDT'] = busdUsdtPrices;
            socket.emit('price-update', this.prices);
          }
        } catch (e) {
          logger.error(`Error fetching BUSD/USDT prices: ${e.message}`);
        }
        
      } catch (error) {
        logger.error(`Error fetching price data: ${error.message}`);
      }
    });
  }

  /**
   * Send price updates to the connected client
   * @param {Object} socket - Socket.io client socket
   */
  sendPriceUpdates(socket) {
    socket.emit('price-update', this.prices);
  }

  /**
   * Set all prices to N/A when real data can't be fetched
   */
  setNAForAllPrices() {
    for (const pair in this.prices) {
      this.prices[pair] = {
        pancakeV2: 'N/A',
        pancakeV3: 'N/A',
        apeswap: 'N/A',
        biswap: 'N/A',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Update sample prices from blockchain data with improved reliability
   */
  async updateSamplePrices() {
    try {
      logger.info('Fetching real price data from blockchain...');
      
      const pairs = ['WBNB/BUSD', 'WBNB/USDT', 'CAKE/WBNB', 'BUSD/USDT'];
      
      for (const pair of pairs) {
        try {
          const prices = await priceService.getPricesForPair(pair);
          if (prices) {
            this.prices[pair] = prices;
            logger.info(`[debug] ${pair} price data collected: ${JSON.stringify(prices)}`);
          }
        } catch (error) {
          logger.error(`Error fetching ${pair} prices: ${error.message}`);
        }
      }
      
      // Broadcast updated prices to all connected clients
      this.io.emit('price-update', this.prices);
      
    } catch (error) {
      logger.error(`Error updating sample prices: ${error.message}`);
      // Set all prices to N/A in case of complete failure
      this.setNAForAllPrices();
    }
  }

  /**
   * Update arbitrage opportunities based on current price data
   */
  updateArbitrageOpportunities() {
    // Calculate potential arbitrage opportunities and update the list
    const opportunities = [];
    
    // Iterate through all pairs
    for (const pair in this.prices) {
      const priceData = this.prices[pair];
      
      // Get all DEX prices
      const dexes = ['pancakeV2', 'pancakeV3', 'apeswap', 'biswap'];
      const availablePrices = {};
      
      // Only include valid numerical prices
      for (const dex of dexes) {
        if (priceData[dex] && priceData[dex] !== 'N/A' && !isNaN(parseFloat(priceData[dex]))) {
          availablePrices[dex] = parseFloat(priceData[dex]);
        }
      }
      
      // Need at least 2 DEXes to compare
      const dexNames = Object.keys(availablePrices);
      if (dexNames.length >= 2) {
        // Compare all DEX combinations
        for (let i = 0; i < dexNames.length; i++) {
          for (let j = i + 1; j < dexNames.length; j++) {
            const dex1 = dexNames[i];
            const dex2 = dexNames[j];
            
            const price1 = availablePrices[dex1];
            const price2 = availablePrices[dex2];
            
            // Calculate percentage difference
            const priceDiff = Math.abs(price1 - price2);
            const avgPrice = (price1 + price2) / 2;
            const percentDiff = (priceDiff / avgPrice) * 100;
            
            // Only add if there's at least 0.1% difference
            if (percentDiff >= 0.1) {
              opportunities.push({
                pair,
                dex1: { name: dex1, price: price1 },
                dex2: { name: dex2, price: price2 },
                priceDiffPercent: percentDiff.toFixed(2),
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }
    }
    
    // Sort by price difference (descending)
    this.opportunities = opportunities.sort((a, b) => 
      parseFloat(b.priceDiffPercent) - parseFloat(a.priceDiffPercent)
    ).slice(0, 10); // Keep only top 10 opportunities
    
    // Broadcast updated opportunities to all connected clients
    this.io.emit('opportunities', this.opportunities);
  }

  /**
   * Ensure correct fee display in dashboard for demonstration purposes
   * This is display-only and doesn't affect actual trading operations
   */
  ensureCorrectFeeDisplay() {
    // Update the display of fees to match the actual DEX fee structures
    // This is for information purposes only and doesn't alter trading logic
    const feesByDex = {
      'pancakeV2': '0.25%',
      'pancakeV3_lowest': '0.01%',
      'pancakeV3_low': '0.05%', 
      'pancakeV3_medium': '0.3%',
      'pancakeV3_high': '1.0%',
      'apeswap': '0.3%',
      'biswap': '0.2%'
    };
    
    // Set accurate fee displays for the dashboard
    this.feeDisplay = feesByDex;
    
    // Make this info available via API for any external dashboards
    this.app.get('/api/fees', (req, res) => {
      res.json(this.feeDisplay);
    });
  }
}

// Create a singleton instance
const dashboardServer = new DashboardServer();

// Export the dashboard server instance
module.exports = dashboardServer;