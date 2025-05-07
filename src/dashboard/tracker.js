const logger = require('../utils/logger');
const dashboardServer = require('./server');
const { ethers } = require('ethers');

/**
 * Performance tracker for the arbitrage bot
 * Collects data and pushes updates to the dashboard
 */
class PerformanceTracker {
  constructor() {
    this.stats = {
      totalOpportunities: 0,
      profitableOpportunities: 0,
      executedArbitrages: 0,
      failedArbitrages: 0,
      totalProfit: ethers.BigNumber.from(0),
      mevStats: {
        backrunCount: 0,
        sandwichCount: 0,
        backrunExecuted: 0,
        sandwichExecuted: 0,
        hourlyProfit: ethers.BigNumber.from(0),
        pendingTransactions: 0
      },
      // Profit records for last 24 hours
      profitRecords: [],
      // Recent transactions
      transactions: []
    };
    
    // Track hourly profit
    this.lastHourTimestamp = Date.now();
    this.lastHourProfit = ethers.BigNumber.from(0);
    
    // Update interval (every 5 minutes)
    this.updateInterval = 5 * 60 * 1000;
    this.intervalId = null;
    
    // Store reference to dashboard server for convenience
    this.dashboardServer = dashboardServer;
  }
  
  /**
   * Start just the performance tracking (without starting the dashboard server)
   */
  startTracking() {
    // Start periodic stats updates
    this.intervalId = setInterval(() => {
      this.updateHourlyMetrics();
      this.pushStatsToDashboard();
    }, this.updateInterval);
    
    logger.info('Performance tracker started');
    return this;
  }
  
  /**
   * Start both the performance tracker and dashboard
   */
  start() {
    // Start the dashboard server
    dashboardServer.start();
    
    // Also start the tracking
    this.startTracking();
    
    logger.info('Performance tracker and dashboard started');
    return this;
  }
  
  /**
   * Stop the performance tracker and dashboard
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    dashboardServer.stop();
    logger.info('Performance tracker stopped');
  }
  
  /**
   * Record a new arbitrage opportunity
   * @param {Object} opportunity - The arbitrage opportunity
   */
  recordOpportunity(opportunity) {
    this.stats.totalOpportunities++;
    
    // Update the dashboard
    this.pushStatsToDashboard();
  }
  
  /**
   * Record a profitable opportunity
   * @param {Object} opportunity - The profitable arbitrage opportunity
   */
  recordProfitableOpportunity(opportunity) {
    this.stats.profitableOpportunities++;
    
    // Update the dashboard
    this.pushStatsToDashboard();
  }
  
  /**
   * Record an executed arbitrage
   * @param {Object} result - The result of the arbitrage execution
   */
  recordArbitrageExecution(result) {
    if (result.success) {
      this.stats.executedArbitrages++;
      
      // Add profit
      if (result.actualProfit) {
        this.stats.totalProfit = this.stats.totalProfit.add(result.actualProfit);
        
        // Add to profit records for charts
        this.stats.profitRecords.push({
          timestamp: new Date().toISOString(),
          profit: result.actualProfit
        });
        
        // Keep only last 24 hours of records
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        this.stats.profitRecords = this.stats.profitRecords.filter(record => 
          new Date(record.timestamp).getTime() > oneDayAgo
        );
      }
    } else {
      this.stats.failedArbitrages++;
    }
    
    // Add to recent transactions
    this.stats.transactions.unshift({
      ...result,
      timestamp: new Date().toISOString()
    });
    
    // Keep only the most recent 10 transactions
    if (this.stats.transactions.length > 10) {
      this.stats.transactions.pop();
    }
    
    // Update the dashboard with the new transaction
    dashboardServer.addTransaction(result);
    
    // Update the dashboard with overall stats
    this.pushStatsToDashboard();
  }
  
  /**
   * Record MEV strategy results
   * @param {Object} mevResult - The result of the MEV strategy
   */
  recordMevStrategy(mevResult) {
    if (mevResult.type === 'backrun') {
      this.stats.mevStats.backrunCount++;
      
      if (mevResult.executed) {
        this.stats.mevStats.backrunExecuted++;
      }
    } else if (mevResult.type === 'sandwich') {
      this.stats.mevStats.sandwichCount++;
      
      if (mevResult.executed) {
        this.stats.mevStats.sandwichExecuted++;
      }
    }
    
    // If the MEV strategy was profitable, add to total profit
    if (mevResult.profit && mevResult.executed) {
      this.stats.totalProfit = this.stats.totalProfit.add(mevResult.profit);
      
      // Add to hourly MEV profit for tracking
      this.lastHourProfit = this.lastHourProfit.add(mevResult.profit);
      
      // Add to profit records for charts
      this.stats.profitRecords.push({
        timestamp: new Date().toISOString(),
        profit: mevResult.profit
      });
    }
    
    // Add to recent transactions if executed
    if (mevResult.executed) {
      this.stats.transactions.unshift({
        ...mevResult,
        timestamp: new Date().toISOString()
      });
      
      // Keep only the most recent 10 transactions
      if (this.stats.transactions.length > 10) {
        this.stats.transactions.pop();
      }
      
      // Update the dashboard with the new transaction
      dashboardServer.addTransaction(mevResult);
    }
    
    // Update pending transactions count
    if (mevResult.pendingCount) {
      this.stats.mevStats.pendingTransactions = mevResult.pendingCount;
    }
    
    // Update the dashboard
    this.pushStatsToDashboard();
  }
  
  /**
   * Update hourly profit metrics
   */
  updateHourlyMetrics() {
    const now = Date.now();
    const hoursPassed = (now - this.lastHourTimestamp) / (60 * 60 * 1000);
    
    if (hoursPassed >= 1) {
      // Save hourly profit
      this.stats.mevStats.hourlyProfit = this.lastHourProfit;
      
      // Reset for next hour
      this.lastHourProfit = ethers.BigNumber.from(0);
      this.lastHourTimestamp = now;
    }
  }
  
  /**
   * Push current stats to the dashboard
   */
  pushStatsToDashboard() {
    const dashboardStats = {
      totalOpportunities: this.stats.totalOpportunities,
      profitableOpportunities: this.stats.profitableOpportunities,
      executedArbitrages: this.stats.executedArbitrages,
      failedArbitrages: this.stats.failedArbitrages,
      totalProfit: this.stats.totalProfit,
      mevStats: {
        backrunCount: this.stats.mevStats.backrunCount,
        sandwichCount: this.stats.mevStats.sandwichCount,
        backrunExecuted: this.stats.mevStats.backrunExecuted,
        sandwichExecuted: this.stats.mevStats.sandwichExecuted,
        hourlyProfit: this.stats.mevStats.hourlyProfit,
        pendingTransactions: this.stats.mevStats.pendingTransactions
      },
      profitHistory: this.stats.profitRecords,
      recentTransactions: this.stats.transactions
    };
    
    dashboardServer.updateStats(dashboardStats);
  }
  
  /**
   * Update bot status on the dashboard
   * @param {string} status - Bot status (running, paused, error)
   * @param {string} [message] - Optional status message
   */
  updateBotStatus(status, message) {
    dashboardServer.updateBotStatus(status, message);
  }
}

// Export a singleton instance
const performanceTracker = new PerformanceTracker();

module.exports = performanceTracker;