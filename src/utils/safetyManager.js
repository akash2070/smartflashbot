/**
 * Safety manager to handle protection mechanisms for the arbitrage bot
 * Including cooldown periods, network congestion detection, and competitive bot detection
 */
const logger = require('./logger');
const { BigNumber } = require('ethers');

class SafetyManager {
  constructor() {
    // Cooldown settings
    this.cooldownActive = false;
    this.cooldownRemainingTime = 0;
    this.consecutiveFailures = 0;
    this.failureThreshold = 3;
    this.cooldownPeriod = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.cooldownStartTime = null;
    this.cooldownTimer = null;
    
    // Network congestion settings
    this.baselineGasPrice = 1; // 1 Gwei as baseline on BNB Chain
    this.currentGasPrice = 1; // Initialize at baseline (real value from blockchain)
    this.gasSpikeFactor = 2.5; // Consider network congested if gas price is 2.5x baseline
    this.isHighGasPrice = false;
    
    // Competitive bot detection
    this.competitiveBotDetected = false;
    this.slippageMultiplier = 1.0;
    this.competitiveFailurePattern = 0;
    
    // Last update time
    this.lastUpdateTime = Date.now();
  }
  
  /**
   * Get the current safety status
   * @returns {Object} Safety status information
   */
  getStatus() {
    // Always ensure a minimum gas price of 1.0 Gwei on BNB Chain
    // This avoids the issue of 0.0 Gwei being displayed in the dashboard
    const actualGasPrice = Math.max(1.0, this.currentGasPrice || 1.0);
    
    return {
      cooldown: {
        active: this.cooldownActive,
        consecutiveFailures: this.consecutiveFailures,
        remainingTime: this.cooldownRemainingTime
      },
      networkCongestion: {
        isHighGasPrice: this.isHighGasPrice,
        currentGasPrice: actualGasPrice,  // Force minimum 1.0 Gwei
        baselineGasPrice: this.baselineGasPrice,
        gasSpikeFactor: this.gasSpikeFactor,
        congested: this.isHighGasPrice,
        lastUpdated: new Date().toISOString()
      },
      competitiveBots: {
        detected: this.competitiveBotDetected,
        slippageMultiplier: this.slippageMultiplier,
        lastUpdated: new Date().toISOString()
      },
      lastUpdated: new Date().toISOString()
    };
  }
  
  /**
   * Record a transaction failure and potentially trigger cooldown
   * @param {string} reason - Reason for failure
   * @returns {boolean} True if cooldown is now active
   */
  recordFailure(reason) {
    this.consecutiveFailures++;
    
    // Check for competitive bot pattern
    if (reason === 'transaction-reverted' || reason === 'frontrun-detected') {
      this.competitiveFailurePattern++;
      
      if (this.competitiveFailurePattern >= 2) {
        this.detectCompetitiveBot(true);
      }
    } else {
      // Reset competitive failure pattern for other failures
      this.competitiveFailurePattern = 0;
    }
    
    logger.warn(`Safety manager: Recorded failure #${this.consecutiveFailures}. Reason: ${reason}`);
    
    // Check if we need to enter cooldown
    if (this.consecutiveFailures >= this.failureThreshold && !this.cooldownActive) {
      this.enterCooldown();
      return true;
    }
    
    return this.cooldownActive;
  }
  
  /**
   * Record a successful transaction
   */
  recordSuccess() {
    if (this.consecutiveFailures > 0) {
      logger.info(`Safety manager: Resetting consecutive failures counter from ${this.consecutiveFailures} to 0`);
      this.consecutiveFailures = 0;
    }
    
    // After several successful transactions, reduce slippage multiplier gradually
    if (this.competitiveBotDetected && Math.random() < 0.3) { // 30% chance to decrease on success
      this.slippageMultiplier = Math.max(1.0, this.slippageMultiplier - 0.1);
      
      if (this.slippageMultiplier <= 1.05) {
        this.detectCompetitiveBot(false);
      }
    }
    
    this.competitiveFailurePattern = 0;
  }
  
  /**
   * Enter cooldown period
   */
  enterCooldown() {
    this.cooldownActive = true;
    this.cooldownStartTime = Date.now();
    this.cooldownRemainingTime = this.cooldownPeriod;
    
    logger.warn(`Safety manager: Entering cooldown period for ${this.cooldownPeriod / 60000} minutes due to ${this.consecutiveFailures} consecutive failures`);
    
    // Set up cooldown timer
    this.cooldownTimer = setInterval(() => this.updateCooldown(), 10000); // Update every 10 seconds
  }
  
  /**
   * Update cooldown timer
   */
  updateCooldown() {
    if (!this.cooldownActive) {
      clearInterval(this.cooldownTimer);
      return;
    }
    
    const currentTime = Date.now();
    const elapsedTime = currentTime - this.cooldownStartTime;
    
    if (elapsedTime >= this.cooldownPeriod) {
      // Cooldown period is over
      this.exitCooldown();
    } else {
      // Update remaining time
      this.cooldownRemainingTime = this.cooldownPeriod - elapsedTime;
    }
  }
  
  /**
   * Exit cooldown period
   */
  exitCooldown() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer);
    }
    
    this.cooldownActive = false;
    this.cooldownRemainingTime = 0;
    // Don't reset consecutive failures immediately, let a successful transaction do that
    
    logger.info('Safety manager: Exiting cooldown period');
  }
  
  /**
   * Check if the network is congested based on gas price
   * @returns {boolean} True if network is congested
   */
  isNetworkCongested() {
    return this.isHighGasPrice;
  }
  
  /**
   * Check if operations should be blocked due to safety measures
   * @returns {Object} Object containing blocked status and reason
   */
  shouldBlockOperations() {
    if (this.cooldownActive) {
      return {
        blocked: true,
        reason: 'cooldown',
        message: `Cooldown active for ${Math.ceil(this.cooldownRemainingTime / 60000)} more minutes`
      };
    }
    
    if (this.isHighGasPrice) {
      return {
        blocked: true,
        reason: 'highGasPrice',
        message: `Network congestion detected. Gas price: ${this.currentGasPrice} Gwei (${Math.round((this.currentGasPrice / this.baselineGasPrice) * 100) / 100}x baseline)`
      };
    }
    
    return {
      blocked: false
    };
  }
  
  /**
   * Update current gas price and check for network congestion
   * @param {BigNumber|number} gasPrice - Current gas price in wei or Gwei
   */
  updateGasPrice(gasPrice) {
    // Convert to Gwei if needed
    let gasPriceGwei;
    
    if (BigNumber.isBigNumber(gasPrice)) {
      gasPriceGwei = parseFloat(gasPrice.div(1e9).toString());
    } else if (typeof gasPrice === 'string' && gasPrice.startsWith('0x')) {
      // Handle hex string
      gasPriceGwei = parseFloat(BigNumber.from(gasPrice).div(1e9).toString());
    } else if (typeof gasPrice === 'number') {
      // Assume it's already in Gwei if it's a reasonable number
      gasPriceGwei = gasPrice > 1000000000 ? gasPrice / 1e9 : gasPrice;
    } else {
      logger.error(`Safety manager: Invalid gas price format: ${typeof gasPrice}`);
      return;
    }
    
    this.currentGasPrice = gasPriceGwei;
    
    // Check for network congestion
    const ratio = this.currentGasPrice / this.baselineGasPrice;
    const wasHighGas = this.isHighGasPrice;
    this.isHighGasPrice = ratio >= this.gasSpikeFactor;
    
    // Log changes in congestion status
    if (this.isHighGasPrice !== wasHighGas) {
      if (this.isHighGasPrice) {
        logger.warn(`Safety manager: Network congestion detected. Gas price: ${gasPriceGwei.toFixed(1)} Gwei (${ratio.toFixed(2)}x baseline)`);
      } else {
        logger.info(`Safety manager: Network congestion resolved. Gas price: ${gasPriceGwei.toFixed(1)} Gwei`);
      }
    }
    
    this.lastUpdateTime = Date.now();
  }
  
  /**
   * Set competitive bot detection status
   * @param {boolean} detected - Whether competitive bots are detected
   */
  detectCompetitiveBot(detected) {
    const previousStatus = this.competitiveBotDetected;
    this.competitiveBotDetected = detected;
    
    if (detected && !previousStatus) {
      // Just detected competitive bots
      this.slippageMultiplier = 1.3; // Increase slippage to compete
      logger.warn('Safety manager: Competitive arbitrage bots detected. Increasing slippage tolerance.');
    } else if (!detected && previousStatus) {
      // No longer detecting competitive bots
      this.slippageMultiplier = 1.0;
      this.competitiveFailurePattern = 0;
      logger.info('Safety manager: Competitive arbitrage bot detection cleared.');
    }
  }
  
  /**
   * Get the current slippage multiplier for dynamic slippage adjustment
   * @returns {number} Slippage multiplier
   */
  getSlippageMultiplier() {
    return this.slippageMultiplier;
  }
  
  /**
   * Apply safety-adjusted slippage to base slippage
   * @param {number} baseSlippage - Base slippage percentage (e.g., 0.5 for 0.5%)
   * @returns {number} Adjusted slippage percentage
   */
  applySlippage(baseSlippage) {
    return baseSlippage * this.slippageMultiplier;
  }
}

// Export a singleton instance
const safetyManager = new SafetyManager();
module.exports = safetyManager;