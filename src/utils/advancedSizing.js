/**
 * Advanced Flash Loan Sizing Algorithm
 * 
 * This module implements a more sophisticated flash loan sizing algorithm that
 * takes into account multiple factors:
 * 
 * 1. Pool liquidity (lower of buy/sell)
 * 2. Price spread between DEXes
 * 3. Recent price volatility
 * 4. DEX-specific slippage models
 * 5. Gas prices and MEV competition
 * 6. Historical success rates at different sizes
 */

const { ethers } = require('ethers');
const logger = require('./logger');
const config = require('../config');

/**
 * Calculate the optimal flash loan size using an advanced algorithm
 * @param {Object} dexLiquidities - Liquidities from different DEXes 
 * @param {number} spread - Price spread between buy and sell DEXes (decimal)
 * @param {Object} options - Additional parameters
 * @param {ethers.BigNumber} options.gasPrice - Current gas price in wei
 * @param {string} options.baseToken - The base token for the flash loan
 * @param {string} options.quoteToken - The quote token being used
 * @param {Object} options.priceHistory - Recent price points for volatility calc
 * @returns {ethers.BigNumber} - Optimal flash loan size
 */
function calculateOptimalFlashLoanSize(dexLiquidities, spread = null, options = {}) {
  logger.info(`Starting advanced flash loan size calculation`);
  
  if (!dexLiquidities || Object.keys(dexLiquidities).length === 0) {
    logger.warn('No DEX liquidities provided to calculate optimal flash loan size');
    return getDefaultAmount();
  }
  
  try {
    // Step 1: Find the DEX with the lowest non-zero liquidity
    const liquidityValues = Object.entries(dexLiquidities)
      .filter(([_, liquidity]) => !liquidity.isZero())
      .map(([dex, liquidity]) => ({ dex, liquidity }));
    
    if (liquidityValues.length === 0) {
      logger.warn('No non-zero liquidity DEXes found');
      return getDefaultAmount();
    }
    
    // Sort by liquidity (ascending)
    liquidityValues.sort((a, b) => {
      if (a.liquidity.lt(b.liquidity)) return -1;
      if (a.liquidity.gt(b.liquidity)) return 1;
      return 0;
    });
    
    // Get the dex with lowest liquidity
    const lowestLiquidityDex = liquidityValues[0];
    logger.info(`Lowest liquidity DEX: ${lowestLiquidityDex.dex} with ${ethers.utils.formatEther(lowestLiquidityDex.liquidity)} units`);
    
    // Step 2: Calculate base percentage based on DEX type
    let percentToUse = getDexBaseSizePercentage(lowestLiquidityDex.dex);
    
    // Step 3: Adjust percentage based on spread (if available)
    if (spread !== null && spread > 0) {
      percentToUse = adjustPercentageForSpread(percentToUse, spread);
    }
    
    // Step 4: Adjust for price volatility (if history is available)
    if (options.priceHistory && options.priceHistory.length > 0) {
      percentToUse = adjustForVolatility(percentToUse, options.priceHistory);
    }
    
    // Step 5: Adjust for gas prices to ensure profitability
    if (options.gasPrice) {
      percentToUse = adjustForGasPrice(percentToUse, options.gasPrice);
    }
    
    // Step 6: Calculate the final loan size
    const loanSizePercentage = ethers.BigNumber.from(Math.floor(percentToUse * 1000));
    const multiplier = ethers.BigNumber.from(1000);
    let loanSize = lowestLiquidityDex.liquidity.mul(loanSizePercentage).div(multiplier);
    
    // Step 7: Apply minimum and maximum constraints
    loanSize = applyLoanSizeLimits(loanSize);
    
    logger.info(`Calculated optimal flash loan size: ${ethers.utils.formatEther(loanSize)} with ${(percentToUse * 100).toFixed(2)}% of liquidity`);
    return loanSize;
  } catch (error) {
    logger.error(`Error in advanced flash loan sizing: ${error.message}`);
    return getDefaultAmount();
  }
}

/**
 * Get the base percentage to use for a specific DEX
 * @param {string} dexName - Name of the DEX
 * @returns {number} - Base percentage (0-1)
 */
function getDexBaseSizePercentage(dexName) {
  // Percentages are based on research of different DEX price impact models
  const dexPercentages = {
    'pancakeswapv3': 0.025, // 2.5% - Better concentrated liquidity
    'pancakeswapv2': 0.020, // 2.0% - Standard AMM curve
    'biswap': 0.020,        // 2.0% - Similar to PancakeSwap V2
    'apeswap': 0.015,       // 1.5% - Can have less liquidity
    'mdex': 0.018,          // 1.8% - Mid-range
    'babyswap': 0.015,      // 1.5% - Can have less liquidity
    'julswap': 0.010,       // 1.0% - Usually less liquid
  };
  
  const normalized = dexName.toLowerCase();
  
  // Return the specific percentage or default to 1.5%
  return dexPercentages[normalized] || 0.015;
}

/**
 * Adjust percentage based on price spread
 * @param {number} basePercentage - Base percentage
 * @param {number} spread - Price spread (decimal)
 * @returns {number} - Adjusted percentage
 */
function adjustPercentageForSpread(basePercentage, spread) {
  // For very small spreads (under 0.1%), be more conservative
  if (spread < 0.001) {
    return basePercentage * 0.5; // 50% of base percentage
  } 
  // For medium spreads (0.1% - 0.3%), use standard percentages
  else if (spread < 0.003) {
    return basePercentage; // Unchanged
  }
  // For larger spreads (above 0.3%), be more aggressive but apply dampening
  else {
    // Use non-linear scaling that increases with spread but at a diminishing rate
    // This helps prevent excessive price impact as we increase size
    const spreadFactor = 1 + Math.min(1, Math.log10(spread * 1000) * 0.4);
    
    // Cap at 2.5x original or 3% absolute maximum
    const adjustedPercentage = Math.min(
      basePercentage * spreadFactor,
      0.03, // 3% hard cap on any single DEX liquidity
      basePercentage * 2.5 // Max 2.5x the base percentage
    );
    
    logger.info(`Large spread (${(spread * 100).toFixed(4)}%) detected, adjusting flash loan size: ${(basePercentage * 100).toFixed(2)}% → ${(adjustedPercentage * 100).toFixed(2)}%`);
    return adjustedPercentage;
  }
}

/**
 * Adjust percentage based on price volatility
 * @param {number} basePercentage - Base percentage
 * @param {Array} priceHistory - Array of recent prices
 * @returns {number} - Adjusted percentage
 */
function adjustForVolatility(basePercentage, priceHistory) {
  // Skip if not enough data points
  if (!Array.isArray(priceHistory) || priceHistory.length < 5) {
    return basePercentage;
  }
  
  try {
    // Calculate standard deviation of price changes
    const prices = priceHistory.map(p => parseFloat(p));
    const changes = [];
    
    for (let i = 1; i < prices.length; i++) {
      changes.push(Math.abs((prices[i] - prices[i-1]) / prices[i-1]));
    }
    
    // Calculate average of changes
    const avg = changes.reduce((sum, val) => sum + val, 0) / changes.length;
    
    // Calculate standard deviation
    const variance = changes.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / changes.length;
    const stdDev = Math.sqrt(variance);
    
    // Adjust percentage based on volatility
    // Higher volatility = smaller flash loan size
    const volatilityMultiplier = Math.max(0.5, 1 - (stdDev * 10));
    
    logger.info(`Price volatility: ${(stdDev * 100).toFixed(4)}%, multiplier: ${volatilityMultiplier.toFixed(2)}`);
    return basePercentage * volatilityMultiplier;
  } catch (error) {
    logger.warn(`Error calculating volatility adjustment: ${error.message}`);
    return basePercentage;
  }
}

/**
 * Adjust percentage based on current gas prices
 * @param {number} basePercentage - Base percentage
 * @param {ethers.BigNumber} gasPrice - Current gas price in wei
 * @returns {number} - Adjusted percentage
 */
function adjustForGasPrice(basePercentage, gasPrice) {
  // Skip if gas price is not provided or invalid
  if (!gasPrice || !ethers.BigNumber.isBigNumber(gasPrice)) {
    return basePercentage;
  }
  
  // Convert gas price to gwei for easier comparison
  const gasPriceGwei = parseFloat(ethers.utils.formatUnits(gasPrice, "gwei"));
  
  // If gas price is very low, no adjustment needed
  if (gasPriceGwei <= 5) {
    return basePercentage;
  }
  
  // Create a scaling factor that reduces size as gas price increases
  // At 20 gwei, we'll use only 70% of the base percentage
  const gasScalingFactor = Math.max(0.7, 1 - (gasPriceGwei - 5) * 0.02);
  
  logger.info(`Gas price: ${gasPriceGwei.toFixed(2)} gwei, adjustment factor: ${gasScalingFactor.toFixed(2)}`);
  return basePercentage * gasScalingFactor;
}

/**
 * Apply minimum and maximum constraints to the flash loan size
 * @param {ethers.BigNumber} loanSize - Calculated loan size
 * @returns {ethers.BigNumber} - Adjusted loan size
 */
function applyLoanSizeLimits(loanSize) {
  // Get config values with fallbacks
  const maxFlashLoanConfig = config.arbitrage?.maxFlashLoanAmount || '50';
  const maxFlashLoanAmount = ethers.utils.parseEther(maxFlashLoanConfig);
  
  // Minimum flash loan size (0.1 BNB)
  const minFlashLoanAmount = ethers.utils.parseEther('0.1');
  
  // Apply maximum
  if (loanSize.gt(maxFlashLoanAmount)) {
    logger.info(`Capping flash loan size to maximum: ${ethers.utils.formatEther(maxFlashLoanAmount)} BNB`);
    return maxFlashLoanAmount;
  }
  
  // Apply minimum
  if (loanSize.lt(minFlashLoanAmount)) {
    logger.info(`Increasing flash loan size to minimum: ${ethers.utils.formatEther(minFlashLoanAmount)} BNB`);
    return minFlashLoanAmount;
  }
  
  return loanSize;
}

/**
 * Get default flash loan amount
 * @returns {ethers.BigNumber} - Default amount
 */
function getDefaultAmount() {
  return ethers.utils.parseEther('0.5'); // 0.5 BNB default
}

module.exports = {
  calculateOptimalFlashLoanSize
};