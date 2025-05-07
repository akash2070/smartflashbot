const { ethers } = require('ethers');
const logger = require('../utils/logger');
const config = require('../config');
const { createEnhancedProvider } = require('./enhancedProvider');

/**
 * Creates enhanced provider for a specific token pair with automatic RPC rotation
 * Uses premium endpoints with fallbacks to handle high rate limits
 * @param {string} pairKey - The pair key (e.g., 'WBNB_BUSD')
 * @param {string} dexName - The DEX name (e.g., 'PancakeSwap V3')
 * @returns {ethers.providers.JsonRpcProvider} - Dedicated provider for this pair/DEX
 */
function createPairSpecificProvider(pairKey, dexName) {
  // Find the corresponding pair config
  const pairConfig = config.BLOCKCHAIN.PAIR_SPECIFIC_RPC && config.BLOCKCHAIN.PAIR_SPECIFIC_RPC[pairKey];
  
  // Create enhanced provider options
  const providerOptions = {
    timeout: 30000,
    maxRetries: 5,
    initialDelay: 1000
  };
  
  // Configure pair-specific RPC endpoints if available
  if (pairConfig) {
    // Store the pair-specific RPC URLs in config for our enhanced provider to use
    config.BLOCKCHAIN.PRIMARY_RPC_URL = pairConfig.rpcUrl;
    
    if (pairConfig.backupRpcUrl) {
      config.BLOCKCHAIN.SECONDARY_RPC_URL = pairConfig.backupRpcUrl;
    }
    
    logger.debug(`Using pair-specific RPCs for ${pairKey} (${dexName})`);
  } else {
    logger.warn(`No specific RPC config found for pair ${pairKey}, using global RPCs`);
  }
  
  // Get API key if available
  const apiKey = process.env.BNB_RPC_URL_KEY || '';
  if (apiKey) {
    providerOptions.apiKey = apiKey;
  }
  
  try {
    // Create enhanced provider with automatic RPC rotation
    logger.debug(`Creating enhanced ${dexName} provider for ${pairKey}`);
    return createEnhancedProvider(providerOptions);
  } catch (error) {
    logger.error(`Failed to create enhanced provider for ${pairKey}: ${error.message}`);
    
    // Fallback to basic provider if enhanced provider fails
    logger.warn(`Falling back to basic provider for ${pairKey}`);
    return new ethers.providers.JsonRpcProvider({
      url: config.BLOCKCHAIN.RPC_URLS[0],
      timeout: 30000,
      allowGzip: true
    }, { chainId: 56 });
  }
}

/**
 * Get token pair key from token addresses
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @returns {string|null} - Pair key or null if not found
 */
function getPairKey(tokenA, tokenB) {
  // Convert to lowercase for case-insensitive comparison
  const normalizedTokenA = tokenA.toLowerCase();
  const normalizedTokenB = tokenB.toLowerCase();
  
  // Check each pair config
  for (const [key, pairConfig] of Object.entries(config.BLOCKCHAIN.PAIR_SPECIFIC_RPC)) {
    const pairTokens = pairConfig.tokens.map(t => t.toLowerCase());
    
    // Check if tokens match in any order
    if ((normalizedTokenA === pairTokens[0] && normalizedTokenB === pairTokens[1]) || 
        (normalizedTokenA === pairTokens[1] && normalizedTokenB === pairTokens[0])) {
      return key;
    }
  }
  
  // Handle known tokens even if not explicitly mapped
  const wbnb = config.TOKENS.WBNB.toLowerCase();
  const busd = config.TOKENS.BUSD.toLowerCase();
  const usdt = config.TOKENS.USDT.toLowerCase();
  const cake = config.TOKENS.CAKE.toLowerCase();
  
  if ((normalizedTokenA === wbnb && normalizedTokenB === busd) || 
      (normalizedTokenA === busd && normalizedTokenB === wbnb)) {
    return 'WBNB_BUSD';
  }
  
  if ((normalizedTokenA === wbnb && normalizedTokenB === usdt) || 
      (normalizedTokenA === usdt && normalizedTokenB === wbnb)) {
    return 'WBNB_USDT';
  }
  
  if ((normalizedTokenA === cake && normalizedTokenB === wbnb) || 
      (normalizedTokenA === wbnb && normalizedTokenB === cake)) {
    return 'CAKE_WBNB';
  }
  
  if ((normalizedTokenA === busd && normalizedTokenB === usdt) || 
      (normalizedTokenA === usdt && normalizedTokenB === busd)) {
    return 'BUSD_USDT';
  }
  
  return null;
}

module.exports = { createPairSpecificProvider, getPairKey };