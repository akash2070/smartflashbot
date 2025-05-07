/**
 * Pair-specific RPC provider implementation
 * Directs token pair operations to designated RPC endpoints
 * to distribute load and optimize API usage
 */

const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');

// Cache for providers to avoid creating new instances
const providerCache = new Map();

/**
 * Get the appropriate provider for the given token pair
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @returns {ethers.providers.Provider} - Appropriate provider for this token pair
 */
function getProviderForPair(tokenA, tokenB) {
  // Normalize token addresses to lowercase for consistent comparison
  const normalizedTokenA = tokenA.toLowerCase();
  const normalizedTokenB = tokenB.toLowerCase();
  
  // Check if we have a specific provider for this token pair
  const pairSpecificRpc = config.BLOCKCHAIN.PAIR_SPECIFIC_RPC;
  
  for (const [pairKey, pairConfig] of Object.entries(pairSpecificRpc)) {
    const pairTokens = pairConfig.tokens.map(t => t.toLowerCase());
    
    // Check if tokens match the pair (in either order)
    if (
      (pairTokens[0] === normalizedTokenA && pairTokens[1] === normalizedTokenB) ||
      (pairTokens[0] === normalizedTokenB && pairTokens[1] === normalizedTokenA)
    ) {
      // Use cached provider or create a new one
      if (!providerCache.has(pairConfig.rpcUrl)) {
        logger.info(`Creating dedicated provider for ${pairKey} pair using ${pairConfig.rpcUrl}`);
        
        // Create a provider with this URL
        const provider = new ethers.providers.JsonRpcProvider({
          url: pairConfig.rpcUrl,
          timeout: config.BLOCKCHAIN.PROVIDER_TIMEOUT,
          allowGzip: true,
          polling: true,
          pollingInterval: 4000
        }, { chainId: config.BLOCKCHAIN.CHAIN_ID });
        
        providerCache.set(pairConfig.rpcUrl, provider);
      }
      
      return providerCache.get(pairConfig.rpcUrl);
    }
  }
  
  // Use a secondary RPC endpoint for any other token pair
  const secondaryRpcUrl = config.BLOCKCHAIN.SECONDARY_RPC_URL;
  
  if (!providerCache.has(secondaryRpcUrl)) {
    logger.info(`Using secondary provider ${secondaryRpcUrl} for token pair ${tokenA}/${tokenB}`);
    
    // Create a provider with this URL
    const provider = new ethers.providers.JsonRpcProvider({
      url: secondaryRpcUrl,
      timeout: config.BLOCKCHAIN.PROVIDER_TIMEOUT,
      allowGzip: true,
      polling: true,
      pollingInterval: 4000
    }, { chainId: config.BLOCKCHAIN.CHAIN_ID });
    
    providerCache.set(secondaryRpcUrl, provider);
  }
  
  return providerCache.get(secondaryRpcUrl);
}

/**
 * Clear the provider cache
 * Useful for testing or when reconfiguring RPC endpoints
 */
function clearProviderCache() {
  providerCache.clear();
  logger.info('Cleared provider cache');
}

module.exports = {
  getProviderForPair,
  clearProviderCache
};