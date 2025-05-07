const { ethers } = require('ethers');
const PancakeswapV2 = require('../dex/pancakeswapV2');
const PancakeswapV3 = require('../dex/pancakeswapV3');
const Apeswap = require('../dex/apeswap');
const config = require('../config');
const logger = require('../utils/logger');
const { formatEther } = require('../utils/helpers');
const { safeDivide, calculatePercentageDifference } = require('../utils/numericUtils');
const { validatePrice } = require('../utils/validation');

class OpportunityFinder {
  constructor(provider) {
    this.provider = provider;
    
    // Initialize DEX interfaces
    this.pancakeV2 = new PancakeswapV2(provider);
    this.pancakeV3 = new PancakeswapV3(provider);
    this.apeswap = new Apeswap(provider);
    
    // Token pairs to monitor
    this.tokenPairs = [
      {
        token1: config.TOKENS.CAKE,
        token2: config.TOKENS.WBNB,
        name: 'CAKE/BNB'
      },
      {
        token1: config.TOKENS.WBNB,
        token2: config.TOKENS.USDT,
        name: 'BNB/USDT'
      },
      {
        token1: config.TOKENS.WBNB,
        token2: config.TOKENS.BUSD,
        name: 'BNB/BUSD'
      },
      {
        token1: config.TOKENS.BUSD,
        token2: config.TOKENS.USDT,
        name: 'BUSD/USDT'
      }
    ];
    
    // DEXes to compare
    this.dexes = [
      {
        name: 'PancakeSwap V2',
        instance: this.pancakeV2,
        type: 'v2'
      },
      {
        name: 'PancakeSwap V3',
        instance: this.pancakeV3,
        type: 'v3'
      },
      {
        name: 'ApeSwap',
        instance: this.apeswap,
        type: 'v2'
      }
    ];
    
    // Historical price tracking for volatility analysis
    this.priceHistory = {
      // Initialize with empty arrays for each token pair
      'CAKE/BNB': [],
      'BNB/USDT': [],
      'BNB/BUSD': [],
      'BUSD/USDT': []
    };
    
    // Maximum price history points to keep (30 minutes worth at 1 data point per minute)
    this.maxHistoryLength = 30;
    
    // Interval between price updates (in milliseconds)
    this.priceUpdateInterval = 60 * 1000; // 1 minute
    
    // Timestamp of the last price update for each pair
    this.lastPriceUpdate = {};
  }
  
  /**
   * Find all potential arbitrage opportunities
   * @returns {Promise<Array<Object>>} - List of arbitrage opportunities
   */
  async findOpportunities() {
    const opportunities = [];
    
    for (const pair of this.tokenPairs) {
      try {
        // Get prices from all DEXes for this pair
        const priceData = await this.getPricesForPair(pair.token1, pair.token2);
        
        // Find arbitrage opportunities between DEXes
        const pairOpportunities = this.findArbitrageForPair(priceData, pair);
        
        if (pairOpportunities.length > 0) {
          opportunities.push(...pairOpportunities);
        }
      } catch (error) {
        logger.error(`Error finding opportunities for ${pair.name}: ${error.message}`);
      }
    }
    
    return opportunities;
  }
  
  /**
   * Get prices for a token pair from all DEXes
   * @param {string} token1 - First token address
   * @param {string} token2 - Second token address
   * @returns {Promise<Array<Object>>} - Price data from all DEXes
   */
  async getPricesForPair(token1, token2) {
    // Determine the token pair name
    const pairName = this.getPairName(token1, token2);
    
    const pricesPromises = this.dexes.map(async (dex) => {
      try {
        let price;
        let liquidity;
        
        if (dex.type === 'v2') {
          price = await dex.instance.getPrice(token1, token2);
          liquidity = await dex.instance.getLiquidity(token1, token2);
        } else if (dex.type === 'v3') {
          // For V3, try to get the best pool
          const bestPool = await dex.instance.getBestPool(token1, token2);
          price = await dex.instance.getPrice(token1, token2, bestPool.fee);
          liquidity = await dex.instance.getPoolLiquidity(bestPool.address);
        }
        
        // Validate the price before using it
        const priceValue = parseFloat(ethers.utils.formatEther(price));
        if (!validatePrice(token1, token2, priceValue)) {
          logger.warn(`Calculated ${dex.name} price ${priceValue} for ${token1}/${token2} failed validation, skipping`);
          return null;
        }
        
        return {
          dex: dex.name,
          type: dex.type,
          instance: dex.instance,
          price,
          liquidity
        };
      } catch (error) {
        logger.debug(`Could not get price from ${dex.name} for ${token1}/${token2}: ${error.message}`);
        return null;
      }
    });
    
    // Filter out failed requests
    const prices = (await Promise.all(pricesPromises)).filter(price => price !== null);
    
    // Log prices for debugging
    prices.forEach(price => {
      logger.debug(`${price.dex} ${token1}/${token2} price: ${formatEther(price.price)}`);
    });
    
    // Update price history if we have enough data
    if (prices.length > 0 && pairName) {
      this.updatePriceHistory(pairName, prices);
    }
    
    return {
      token1,
      token2,
      prices,
      priceHistory: this.getPriceHistoryForPair(pairName)
    };
  }
  
  /**
   * Update price history for a token pair
   * @param {string} pairName - Name of the token pair (e.g., 'CAKE/BNB')
   * @param {Array<Object>} prices - Current prices from different DEXes
   */
  updatePriceHistory(pairName, prices) {
    try {
      // Calculate average price across all DEXes for a more stable value
      const totalPrices = prices.map(p => parseFloat(ethers.utils.formatEther(p.price)));
      const avgPrice = totalPrices.reduce((sum, price) => sum + price, 0) / totalPrices.length;
      
      // Skip if the price is invalid
      if (isNaN(avgPrice) || avgPrice === 0) {
        return;
      }
      
      // Only update once per interval to avoid too many data points
      const now = Date.now();
      if (this.lastPriceUpdate[pairName] && now - this.lastPriceUpdate[pairName] < this.priceUpdateInterval) {
        return;
      }
      
      // Update the last update timestamp
      this.lastPriceUpdate[pairName] = now;
      
      // Ensure we have an array for this pair
      if (!this.priceHistory[pairName]) {
        this.priceHistory[pairName] = [];
      }
      
      // Add the new price datapoint with timestamp
      this.priceHistory[pairName].push({
        price: avgPrice,
        timestamp: now
      });
      
      // Trim the history to keep only the latest maxHistoryLength points
      if (this.priceHistory[pairName].length > this.maxHistoryLength) {
        this.priceHistory[pairName] = this.priceHistory[pairName].slice(-this.maxHistoryLength);
      }
      
      logger.debug(`Updated price history for ${pairName}, now have ${this.priceHistory[pairName].length} data points`);
    } catch (error) {
      logger.warn(`Error updating price history for ${pairName}: ${error.message}`);
    }
  }
  
  /**
   * Get formatted price history for a token pair, suitable for volatility calculations
   * @param {string} pairName - Name of the token pair
   * @returns {Array<number>} - Array of recent prices (most recent last)
   */
  getPriceHistoryForPair(pairName) {
    if (!this.priceHistory[pairName] || this.priceHistory[pairName].length === 0) {
      return [];
    }
    
    // Return just the price values in chronological order (oldest first)
    return this.priceHistory[pairName].map(item => item.price);
  }
  
  /**
   * Get the name of a token pair based on addresses
   * @param {string} token1 - First token address
   * @param {string} token2 - Second token address
   * @returns {string|null} - Pair name or null if not found
   */
  getPairName(token1, token2) {
    const pair = this.tokenPairs.find(p => 
      (p.token1.toLowerCase() === token1.toLowerCase() && p.token2.toLowerCase() === token2.toLowerCase()) ||
      (p.token1.toLowerCase() === token2.toLowerCase() && p.token2.toLowerCase() === token1.toLowerCase())
    );
    
    return pair ? pair.name : null;
  }
  
  /**
   * Find arbitrage opportunities for a token pair
   * @param {Object} priceData - Price data for a token pair
   * @param {Object} pair - Token pair info
   * @returns {Array<Object>} - List of arbitrage opportunities
   */
  findArbitrageForPair(priceData, pair) {
    try {
      const opportunities = [];
      const { token1, token2, prices } = priceData;
      
      // We need at least 2 DEXes to compare
      if (prices.length < 2) {
        return opportunities;
      }
      
      // Compare prices between DEXes
      for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
          try {
            const dex1 = prices[i];
            const dex2 = prices[j];
            
            // Skip if either DEX has no liquidity
            if (!dex1.liquidity.exists || !dex2.liquidity.exists) {
              continue;
            }
            
            // Validate both prices before calculating arbitrage
            const price1Value = parseFloat(ethers.utils.formatEther(dex1.price));
            const price2Value = parseFloat(ethers.utils.formatEther(dex2.price));
            
            // Skip if either price is invalid (0, too high, stablecoin validation, etc.)
            if (!validatePrice(token1, token2, price1Value) || !validatePrice(token1, token2, price2Value)) {
              logger.debug(`Skipping arbitrage calculation between ${dex1.dex} and ${dex2.dex} due to invalid price values: ${price1Value}, ${price2Value}`);
              continue;
            }
            
            // Skip if either price is zero or extremely close to zero (below 0.000001)
            if (price1Value < 0.000001 || price2Value < 0.000001) {
              logger.debug(`Skipping arbitrage calculation between ${dex1.dex} and ${dex2.dex} due to near-zero price: ${price1Value}, ${price2Value}`);
              continue;
            }
            
            // Calculate price difference
            const priceDifference = dex1.price.gt(dex2.price)
              ? dex1.price.sub(dex2.price)
              : dex2.price.sub(dex1.price);
            
            // Calculate percentage difference using safe numeric operations
            const basePrice = dex1.price.gt(dex2.price) ? dex2.price : dex1.price;
            
            // Use our safe calculation utility to avoid div-by-zero and overflow errors
            let percentageDifference;
            try {
              // Try to use our custom utility first
              percentageDifference = calculatePercentageDifference(dex1.price, dex2.price);
            } catch (error) {
              // Fallback to manual calculation with safeDivide if the utility fails
              const scaledDifference = priceDifference.mul(10000); // Scale for better precision
              const safeResult = safeDivide(scaledDifference, basePrice, ethers.BigNumber.from(0));
              
              // Default to 0 if we get a division error
              percentageDifference = safeResult.isZero() ? 0 : safeResult.toNumber() / 100;
            }
            
            // If difference is greater than 0.1% but less than MAX_PRICE_DIVERGENCE (5%), it's a potential opportunity
            if (percentageDifference > 0.1) {
              const buy = dex1.price.lt(dex2.price) ? dex1 : dex2;
              const sell = buy === dex1 ? dex2 : dex1;
              
              // Get the price history for this pair
              const pairHistory = this.getPriceHistoryForPair(pair.name);
                
              // Create opportunity object with price history for volatility analysis
              const opportunity = {
                pair: {
                  token1,
                  token2,
                  name: pair.name
                },
                buy: {
                  dex: buy.dex,
                  type: buy.type,
                  instance: buy.instance,
                  price: buy.price,
                  liquidity: buy.liquidity
                },
                sell: {
                  dex: sell.dex,
                  type: sell.type,
                  instance: sell.instance,
                  price: sell.price,
                  liquidity: sell.liquidity
                },
                priceDifference: percentageDifference,
                timestamp: Date.now(),
                priceHistory: pairHistory
              };
              
              // Log if we have price history data for volatility calculations
              if (pairHistory.length > 0) {
                logger.debug(`Including ${pairHistory.length} price history points for volatility analysis of ${pair.name}`);
              }
              
              // Check if the price difference is significant enough
              logger.info(`🔍 Found ${percentageDifference.toFixed(2)}% price difference for ${pair.name} between ${buy.dex} and ${sell.dex}`);
              logger.info(`   Buy price: ${formatEther(buy.price)} | Sell price: ${formatEther(sell.price)}`);
              
              // Skip opportunities where price difference exceeds MAX_PRICE_DIVERGENCE (5%)
              if (percentageDifference > config.SAFETY.MAX_PRICE_DIVERGENCE) {
                logger.warn(`⚠️ Price difference of ${percentageDifference.toFixed(2)}% exceeds maximum threshold of ${config.SAFETY.MAX_PRICE_DIVERGENCE}%. Skipping arbitrage for safety.`);
                continue;
              }
              
              opportunities.push(opportunity);
            }
          } catch (error) {
            // Catch errors for individual DEX pair comparisons
            logger.debug(`Error comparing ${prices[i]?.dex} and ${prices[j]?.dex}: ${error.message}`);
            continue;
          }
        }
      }
      
      return opportunities;
    } catch (error) {
      // Catch errors for the entire arbitrage process
      logger.error(`Error in findArbitrageForPair: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Get a list of possible arbitrage routes for a token pair
   * @param {string} token1 - First token address
   * @param {string} token2 - Second token address
   * @returns {Promise<Array<Object>>} - List of possible routes
   */
  async getArbitrageRoutes(token1, token2) {
    const routes = [];
    
    // Simple routes (direct swap)
    const simpleRoute = {
      path: [token1, token2],
      dexes: []
    };
    
    // For each DEX, check if the pair exists
    for (const dex of this.dexes) {
      try {
        let exists = false;
        
        if (dex.type === 'v2') {
          const pairAddress = await dex.instance.getPairAddress(token1, token2);
          exists = pairAddress !== ethers.constants.AddressZero;
        } else if (dex.type === 'v3') {
          const pools = await dex.instance.getAllPools(token1, token2);
          exists = pools.length > 0;
        }
        
        if (exists) {
          routes.push({
            ...simpleRoute,
            dexes: [dex.name]
          });
        }
      } catch (error) {
        logger.debug(`Error checking route for ${dex.name}: ${error.message}`);
      }
    }
    
    // TODO: Add more complex routes with intermediate tokens if needed
    
    return routes;
  }
}

module.exports = OpportunityFinder;
