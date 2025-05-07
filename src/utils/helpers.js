const { ethers } = require('ethers');
const config = require('../config');
const logger = require('./logger');

/**
 * Sleep for a specified time
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Resolves after timeout
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Format ether value to 6 decimal places
 * @param {BigNumber|string} value - Value in wei
 * @returns {string} - Formatted ether value
 */
const formatEther = (value) => {
  const etherValue = ethers.utils.formatEther(value);
  return parseFloat(etherValue).toFixed(6);
};

/**
 * Determine the optimal flash loan size based on DEX liquidity
 * @param {Object} dexLiquidities - Liquidity data for each DEX
 * @returns {ethers.BigNumber} - Optimal flash loan size
 */
function determineOptimalFlashLoanSizeOriginal(dexLiquidities) {
  try {
    // Find the lowest liquidity among all DEXes
    let lowestLiquidity = null;
    
    for (const [dex, liquidity] of Object.entries(dexLiquidities)) {
      if (lowestLiquidity === null || liquidity.lt(lowestLiquidity)) {
        lowestLiquidity = liquidity;
      }
    }
    
    // Default to a very small amount if we couldn't find any DEX liquidity
    if (!lowestLiquidity || lowestLiquidity.isZero()) {
      return ethers.utils.parseEther('0.05');
    }
    
    // Calculate a safe percentage (3%) of the lowest liquidity
    // This helps us avoid excessive price impact
    const safePercentage = ethers.BigNumber.from(3); // 3%
    const multiplier = ethers.BigNumber.from(100);
    
    const optimalSize = lowestLiquidity.mul(safePercentage).div(multiplier);
    
    // Apply caps based on config
    const maxFlashLoanConfig = config.arbitrage?.maxFlashLoanAmount || '50';
    const maxFlashLoanAmount = ethers.utils.parseEther(maxFlashLoanConfig);
    
    if (optimalSize.gt(maxFlashLoanAmount)) {
      return maxFlashLoanAmount;
    }
    
    // Ensure we're not using too small of an amount (minimum 0.05 BNB)
    const minAmount = ethers.utils.parseEther('0.05');
    if (optimalSize.lt(minAmount)) {
      return minAmount;
    }
    
    return optimalSize;
  } catch (error) {
    logger.error(`Error determining optimal flash loan size: ${error.message}`);
    // Default to a conservative amount
    return ethers.utils.parseEther('0.1');
  }
}

/**
 * Calculate the maximum safe flash loan amount based on pool balance
 * @param {ethers.BigNumber} poolBalance - Balance of token in the pool
 * @returns {ethers.BigNumber} - Maximum flash loan amount
 */
function calculateMaxFlashLoanAmount(poolBalance) {
  try {
    // Max flash loan is 80% of pool balance for safety
    const safetyFactor = 80;
    const divisor = 100;
    
    const maxAmount = poolBalance.mul(safetyFactor).div(divisor);
    
    // Cap at configured maximum
    const configMaxAmount = config.arbitrage?.maxFlashLoanAmount 
      ? ethers.utils.parseEther(config.arbitrage.maxFlashLoanAmount)
      : ethers.utils.parseEther('50');
    
    return maxAmount.gt(configMaxAmount) ? configMaxAmount : maxAmount;
  } catch (error) {
    logger.error(`Error calculating max flash loan amount: ${error.message}`);
    // Return a conservative default
    return ethers.utils.parseEther('10');
  }
}

/**
 * Apply dynamic slippage based on DEX liquidity and trade size
 * @param {ethers.BigNumber} amount - Trade amount
 * @param {ethers.BigNumber} dexLiquidity - DEX liquidity
 * @param {string} dexName - Name of the DEX
 * @param {boolean} isMinimumOut - If true, reduce amount for minimum out, otherwise increase for maximum in
 * @returns {ethers.BigNumber} - Adjusted amount with slippage
 */
function applyDynamicSlippage(amount, dexLiquidity, dexName, isMinimumOut = false) {
  try {
    if (amount.isZero() || dexLiquidity.isZero()) {
      return amount;
    }
    
    // Calculate trade as percentage of DEX liquidity (in basis points)
    // 1% = 100 basis points
    const tradePercentage = amount.mul(10000).div(dexLiquidity);
    
    // Base slippage based on DEX configuration
    let baseSlippageBps;
    const dexNameLower = dexName.toLowerCase();
    
    // Get DEX-specific max slippage from config or use default
    if (dexNameLower.includes('pancake') && dexNameLower.includes('v3')) {
      baseSlippageBps = Math.floor(config.maxSlippageByDex?.pancakeV3 * 100) || 50; // 0.5%
    } else if (dexNameLower.includes('pancake')) {
      baseSlippageBps = Math.floor(config.maxSlippageByDex?.pancakeV2 * 100) || 100; // 1.0%
    } else if (dexNameLower.includes('ape')) {
      baseSlippageBps = Math.floor(config.maxSlippageByDex?.apeswap * 100) || 120; // 1.2%
    } else if (dexNameLower.includes('bi')) {
      baseSlippageBps = Math.floor(config.maxSlippageByDex?.biswap * 100) || 70; // 0.7%
    } else {
      baseSlippageBps = 100; // Default 1.0%
    }
    
    // Dynamic component: adjust slippage based on trade size relative to liquidity
    // Scale from baseBps to 5x baseBps as trade approaches 5% of liquidity
    const scaleFactor = Math.min(tradePercentage.toNumber(), 500) / 100;
    const dynamicSlippageBps = baseSlippageBps * (1 + scaleFactor);
    
    // Apply slippage to amount
    if (isMinimumOut) {
      // For minimum output (selling), reduce the expected amount
      const slippageFactor = 10000 - dynamicSlippageBps;
      return amount.mul(slippageFactor).div(10000);
    } else {
      // For maximum input (buying), increase the input amount
      const slippageFactor = 10000 + dynamicSlippageBps;
      return amount.mul(slippageFactor).div(10000);
    }
  } catch (error) {
    logger.warn(`Error applying dynamic slippage: ${error.message}`);
    // Fallback: apply fixed slippage from config
    const slippagePercentage = config.arbitrage?.slippageTolerance || 0.5;
    const slippageBps = Math.floor(slippagePercentage * 100);
    
    if (isMinimumOut) {
      const slippageFactor = 10000 - slippageBps;
      return amount.mul(slippageFactor).div(10000);
    } else {
      const slippageFactor = 10000 + slippageBps;
      return amount.mul(slippageFactor).div(10000);
    }
  }
}

/**
 * Calculate gas cost based on gas price and estimated gas
 * @param {ethers.BigNumber} gasPrice - Gas price in wei
 * @param {ethers.BigNumber} estimatedGas - Estimated gas usage
 * @returns {ethers.BigNumber} - Gas cost in wei
 */
function calculateGasCost(gasPrice, estimatedGas) {
  if (!gasPrice || !estimatedGas) {
    return ethers.BigNumber.from(0);
  }
  return gasPrice.mul(estimatedGas);
}

/**
 * Format token amount to readable form based on decimals
 * @param {BigNumber} amount - Token amount
 * @param {number} decimals - Token decimals
 * @returns {string} - Formatted amount
 */
const formatTokenAmount = (amount, decimals = 18) => {
  return ethers.utils.formatUnits(amount, decimals);
};

// The calculateGasCost function has been implemented above

/**
 * Get gas price with safety limits
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {Promise<ethers.BigNumber>} - Gas price in wei
 */
const getSafeGasPrice = async (provider) => {
  try {
    // Get current gas price
    const gasPrice = await provider.getGasPrice();
    
    // Apply safety limits
    const minGasPrice = ethers.utils.parseUnits("1", "gwei"); // Minimum 1 Gwei
    const maxGasPrice = ethers.utils.parseUnits("10", "gwei"); // Maximum 10 Gwei
    
    if (gasPrice.lt(minGasPrice)) {
      return minGasPrice;
    }
    
    if (gasPrice.gt(maxGasPrice)) {
      return maxGasPrice;
    }
    
    return gasPrice;
  } catch (error) {
    logger.error(`Error getting safe gas price: ${error.message}`);
    // Return a conservative default
    return ethers.utils.parseUnits("5", "gwei");
  }
};

/**
 * Get current gas price with safety buffer (legacy version)
 * @param {Object} provider - Ethers provider
 * @returns {Promise<BigNumber>} - Gas price with buffer
 */
const getSafeGasPriceWithBuffer = async (provider) => {
  // For backward compatibility, use the main implementation
  return getSafeGasPrice(provider);
};

/**
 * Get token symbol and decimals
 * @param {string} tokenAddress - Token contract address
 * @param {Object} provider - Ethers provider
 * @returns {Promise<{symbol: string, decimals: number}>} - Token info
 */
const getTokenInfo = async (tokenAddress, provider) => {
  const ERC20_ABI = require('../abis/ERC20.json');
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  
  const [symbol, decimals] = await Promise.all([
    token.symbol(),
    token.decimals()
  ]);
  
  return { symbol, decimals };
};

/**
 * Legacy version of calculateMaxFlashLoanAmount - kept for compatibility
 * but will delegate to the primary implementation
 * @param {BigNumber} poolLiquidity - Liquidity in the pool
 * @returns {BigNumber} - Maximum flash loan amount
 */
const calculateMaxFlashLoanAmountLegacy = (poolLiquidity) => {
  // Delegate to the primary implementation
  return calculateMaxFlashLoanAmount(poolLiquidity);
};

/**
 * Calculate slippage based on trade size relative to pool liquidity
 * This implements the slippage formula from the research: slippage = L/(R_A+L)
 * Where L is the loan size and R_A is the reserve of token A
 * 
 * @param {BigNumber} tradeAmount - Amount being traded
 * @param {BigNumber} poolLiquidity - Total liquidity in the pool
 * @param {number} baseSlippage - Base slippage in decimal (e.g., 0.001 for 0.1%)
 * @param {string} dexName - Name of the DEX for logging
 * @returns {number} - Calculated slippage in decimal
 */
const calculateDynamicSlippage = (tradeAmount, poolLiquidity, baseSlippage, dexName) => {
  if (!poolLiquidity || poolLiquidity.isZero()) {
    logger.warn(`Cannot calculate dynamic slippage for ${dexName} - pool liquidity is zero`);
    return baseSlippage; // Fallback to base slippage
  }

  // Convert to actual numbers for easier math
  const tradeAmountFloat = parseFloat(ethers.utils.formatEther(tradeAmount));
  const liquidityFloat = parseFloat(ethers.utils.formatEther(poolLiquidity));
  
  // Use the slippage formula from the research: slippage = L/(R_A+L)
  // This directly calculates expected price impact based on AMM invariant
  let theoreticalSlippage = tradeAmountFloat / (liquidityFloat + tradeAmountFloat);
  
  // Apply DEX-specific coefficient to account for different AMM designs
  const dexCoefficient = {
    'pancakeswapv3': 0.5,  // PancakeSwap V3 has concentrated liquidity, so slippage is lower
    'pancakeswapv2': 1.0,  // Standard coefficient for v2 AMMs
    'biswap': 0.8,         // BiSwap has lower fees and generally better liquidity distribution
    'apeswap': 1.2         // ApeSwap might have less liquidity and higher impact
  }[dexName.toLowerCase()] || 1.0;
  
  // Calculate final slippage with DEX coefficient and add base slippage
  let calculatedSlippage = (theoreticalSlippage * dexCoefficient) + baseSlippage;
  
  // Cap maximum slippage based on DEX
  const maxSlippage = {
    'pancakeswapv3': 0.005, // 0.5%
    'pancakeswapv2': 0.01,  // 1.0%
    'biswap': 0.007,        // 0.7%
    'apeswap': 0.012        // 1.2%
  }[dexName.toLowerCase()] || 0.01;
  
  // Ensure slippage is within bounds
  if (calculatedSlippage < baseSlippage) calculatedSlippage = baseSlippage;
  if (calculatedSlippage > maxSlippage) calculatedSlippage = maxSlippage;
  
  logger.debug(`Dynamic slippage for ${dexName}: ${(calculatedSlippage * 100).toFixed(4)}% (trade: ${tradeAmountFloat.toFixed(4)} BNB, liquidity: ${liquidityFloat.toFixed(4)} BNB)`);
  
  return calculatedSlippage;
};

/**
 * Determine the optimal flash loan size based on pool liquidity and price spread
 * This implementation is based on the advanced algorithm described in the research document:
 * "Dynamically decide the optimal flash-loan size for two-token AMM arbitrage"
 * @param {Object} dexLiquidities - Object mapping DEX names to liquidity values
 * @param {number} spread - Price spread between DEXes (as a decimal, e.g., 0.01 for 1%)
 * @param {Object} options - Additional options for calculation
 * @returns {BigNumber} - Optimal flash loan amount
 */
const determineOptimalFlashLoanSizeV2 = (dexLiquidities, spread = null, options = {}) => {
  if (!dexLiquidities || Object.keys(dexLiquidities).length === 0) {
    logger.warn('No DEX liquidities provided to determine optimal flash loan size');
    return ethers.utils.parseEther('0.5'); // Default fallback amount
  }
  
  // Find the DEX with the lowest liquidity (excluding zero liquidity)
  const liquidityValues = Object.entries(dexLiquidities)
    .filter(([_, liquidity]) => !liquidity.isZero())
    .map(([dex, liquidity]) => {
      return { dex, liquidity };
    });
  
  if (liquidityValues.length === 0) {
    logger.warn('No non-zero liquidity DEXes found');
    return ethers.utils.parseEther('0.5'); // Default fallback
  }
  
  // Sort by liquidity ascending
  liquidityValues.sort((a, b) => {
    if (a.liquidity.lt(b.liquidity)) return -1;
    if (a.liquidity.gt(b.liquidity)) return 1;
    return 0;
  });
  
  // Take the lowest liquidity DEX
  const lowestLiquidityDex = liquidityValues[0];
  
  // Calculate optimal size based on DEX type (max 3% of the lowest liquidity)
  let percentToUse = {
    'pancakeswapv3': 0.025, // 2.5%
    'pancakeswapv2': 0.02, // 2%
    'biswap': 0.02, // 2%
    'apeswap': 0.015 // 1.5%
  }[lowestLiquidityDex.dex.toLowerCase()] || 0.015; // Default to 1.5%
  
  // If we have spread information, adjust the flash loan size based on it
  if (spread !== null && spread > 0) {
    // Calculate spread adjustment factor based on the research algorithm
    
    // For very small spreads (under 0.1%), be more conservative
    if (spread < 0.001) {
      percentToUse = percentToUse * 0.5;
      logger.info(`Small spread (${(spread * 100).toFixed(4)}%) detected, reducing flash loan size by 50%`);
    } 
    // For medium spreads (0.1% - 0.3%), use standard size
    else if (spread < 0.003) {
      // Use the default percentage
      logger.debug(`Medium spread (${(spread * 100).toFixed(4)}%) detected, using standard flash loan size`);
    }
    // For larger spreads (above 0.3%), be more aggressive but apply dampening
    else {
      // Apply dampening factor to avoid excessive slippage - as spread increases, we increase size
      // but at a decreasing rate to avoid price impact overwhelming the spread advantage
      const spreadMultiplier = Math.min(10, 5 + (1 / spread)); // Dynamic multiplier that decreases as spread increases
      const increaseFactor = Math.min(1 + (spread * spreadMultiplier * 0.5), 2.5);
      percentToUse = Math.min(percentToUse * increaseFactor, 0.03); // Cap at 3% maximum
      
      logger.info(`Large spread (${(spread * 100).toFixed(4)}%) detected, increasing flash loan size to ${(percentToUse * 100).toFixed(2)}%`);
    }
  }
  
  // If gas prices are high, reduce the loan size to ensure profitability
  if (options.gasPrice && options.gasPrice.gt(ethers.utils.parseUnits("20", "gwei"))) {
    const gasAdjustment = Math.max(0.7, 1 - (options.gasPrice.div(ethers.utils.parseUnits("20", "gwei")).toNumber() - 1) * 0.1);
    percentToUse = percentToUse * gasAdjustment;
    logger.info(`High gas price detected, adjusting loan size by factor of ${gasAdjustment.toFixed(2)}`);
  }
  
  const optimalAmount = lowestLiquidityDex.liquidity.mul(Math.floor(percentToUse * 10000)).div(10000);
  
  logger.info(`Optimal flash loan size: ${formatEther(optimalAmount)} BNB (${(percentToUse * 100).toFixed(2)}% of ${lowestLiquidityDex.dex} liquidity)`);
  
  return optimalAmount;
};

/**
 * Add slippage protection to an amount based on dynamic slippage calculation (v2 implementation)
 * @param {BigNumber} amount - Token amount
 * @param {BigNumber} poolLiquidity - Liquidity in the pool
 * @param {string} dexName - Name of the DEX
 * @param {boolean} isMinimum - If true, apply negative slippage (minimum out)
 * @returns {BigNumber} - Amount with slippage applied
 */
const applyDynamicSlippageV2 = (amount, poolLiquidity, dexName, isMinimum = true) => {
  // Base slippage values by DEX
  const baseSlippageByDex = {
    'pancakeswapv3': 0.001, // 0.1%
    'pancakeswapv2': 0.0015, // 0.15%
    'biswap': 0.0015, // 0.15%
    'apeswap': 0.0018 // 0.18%
  };
  
  const baseSlippage = baseSlippageByDex[dexName.toLowerCase()] || 0.0015;
  
  // Calculate dynamic slippage based on amount relative to pool liquidity
  const dynamicSlippage = calculateDynamicSlippage(amount, poolLiquidity, baseSlippage, dexName);
  
  // Convert slippage to basis points for BigNumber math (multiply by 10000)
  const slippageBps = Math.floor(dynamicSlippage * 10000);
  
  if (isMinimum) {
    // For minimum out, reduce the amount by slippage percentage
    return amount.mul(10000 - slippageBps).div(10000);
  } else {
    // For maximum in, increase the amount by slippage percentage
    return amount.mul(10000 + slippageBps).div(10000);
  }
};

/**
 * Add slippage protection to an amount (legacy method, kept for compatibility)
 * @param {BigNumber} amount - Token amount
 * @param {boolean} isMinimum - If true, apply negative slippage (minimum out)
 * @param {number} multiplier - Optional multiplier for slippage (for competitive bot detection)
 * @returns {BigNumber} - Amount with slippage applied
 */
const applySlippage = (amount, isMinimum = true, multiplier = 1.0) => {
  // Apply multiplier to base slippage tolerance (useful during network congestion or bot competition)
  const baseSlippage = config.ARBITRAGE.SLIPPAGE_TOLERANCE;
  const adjustedSlippage = baseSlippage * multiplier;
  const slippageBps = Math.floor(adjustedSlippage * 100);
  
  if (multiplier > 1.0) {
    logger.info(`Applying increased slippage: ${(adjustedSlippage * 100).toFixed(2)}% (${multiplier.toFixed(1)}x normal)`);
  }
  
  if (isMinimum) {
    // For minimum out, reduce the amount by slippage percentage
    return amount.mul(10000 - slippageBps).div(10000);
  } else {
    // For maximum in, increase the amount by slippage percentage
    return amount.mul(10000 + slippageBps).div(10000);
  }
};

/**
 * Generate a deadline timestamp for transactions
 * @param {number} minutes - Minutes from now for deadline
 * @returns {number} - Unix timestamp
 */
const getDeadline = (minutes = 20) => {
  return Math.floor(Date.now() / 1000) + minutes * 60;
};

// We already have original implementations for both functions, so we don't need to create aliases

module.exports = {
  sleep,
  formatEther,
  formatTokenAmount,
  calculateGasCost,
  getSafeGasPrice,
  // Add legacy function name for backward compatibility
  getSafeGasPriceWithBuffer,
  getTokenInfo,
  calculateMaxFlashLoanAmount,
  // Add alias for backward compatibility
  calculateMaxFlashLoanAmountLegacy,
  applySlippage,
  // Use V2 implementation as the primary function and keep the original as legacy
  applyDynamicSlippage: applyDynamicSlippageV2,
  applyDynamicSlippageV2,
  calculateDynamicSlippage,
  // Use V2 implementation as the primary function and keep the original as legacy
  determineOptimalFlashLoanSize: determineOptimalFlashLoanSizeV2,
  determineOptimalFlashLoanSizeOriginal,
  determineOptimalFlashLoanSizeV2,
  getDeadline
};
