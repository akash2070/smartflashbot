/**
 * RPC utility functions for improved blockchain connectivity
 */
const { ethers } = require('ethers');
const logger = require('./logger');

// Premium RPC endpoints with API keys
const PREMIUM_RPC_ENDPOINTS = [
  'https://bsc-mainnet.infura.io/v3/e61e6bfe6bbd410a842f58f7a98f5813',
  'https://bsc-mainnet.core.chainstack.com/452214f8109f496cc2e3a7c61aeaf3af',
  'https://bsc-mainnet.infura.io/v3/540be088222846879dde5408235eadbe',
  'https://black-damp-model.bsc.quiknode.pro/3050dcae7ae25db594ae3fa5b795ef24ced74c05/'
];

// Backup public RPC endpoints
const BACKUP_RPC_ENDPOINTS = [
  'https://bsc-dataseed1.binance.org/',
  'https://bsc-dataseed2.binance.org/',
  'https://bsc-dataseed3.binance.org/',
  'https://bsc-dataseed4.binance.org/',
  'https://rpc.ankr.com/bsc',
  'https://bsc.publicnode.com',
  'https://binance.llamarpc.com'
];

/**
 * Creates a provider with retry and fallback logic
 * @param {string} preferredEndpoint - Primary endpoint to try first
 * @param {number} timeout - Request timeout in ms
 * @param {number} retries - Number of retries before moving to next endpoint
 * @returns {ethers.providers.Provider} Provider with retry logic
 */
function createReliableProvider(preferredEndpoint = null, timeout = 10000, retries = 2) {
  // Organize endpoints with preferred one first
  let endpoints = [...PREMIUM_RPC_ENDPOINTS];
  
  // If preferred endpoint is provided, put it first
  if (preferredEndpoint && !endpoints.includes(preferredEndpoint)) {
    endpoints.unshift(preferredEndpoint);
  }
  
  // Add backup endpoints at the end
  endpoints = [...endpoints, ...BACKUP_RPC_ENDPOINTS];
  
  // Remove duplicates
  endpoints = [...new Set(endpoints)];
  
  // Create provider configuration for each endpoint
  const providerConfigs = endpoints.map((url, i) => ({
    provider: new ethers.providers.JsonRpcProvider({
      url,
      timeout,
      allowGzip: true,
      polling: true,
      pollingInterval: 4000
    }),
    priority: i + 1,
    weight: i === 0 ? 2 : 1, // Give preferred endpoint higher weight
    stallTimeout: 5000 // Wait 5 seconds before trying next provider
  }));
  
  // Create FallbackProvider for automatic failover
  return new ethers.providers.FallbackProvider(providerConfigs);
}

/**
 * Creates a provider specifically for a token pair
 * @param {string} pairName - Name of token pair (e.g., 'WBNB/BUSD')
 * @param {Object} pairConfig - Configuration for the pair
 * @returns {ethers.providers.Provider} Provider optimized for the pair
 */
function createPairProvider(pairName, pairConfig = {}) {
  // Get pair-specific RPC endpoint if available
  const pairEndpoint = pairConfig.rpcUrl || null;
  
  return createReliableProvider(pairEndpoint, 15000, 3);
}

/**
 * Makes a blockchain call with retries and fallback mechanism
 * @param {Function} callFn - Function to call that returns a Promise
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Delay between retries in ms
 * @returns {Promise<any>} Result of the call or error if all retries fail
 */
async function makeReliableCall(callFn, maxRetries = 3, delay = 1000) {
  let lastError = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callFn();
    } catch (error) {
      lastError = error;
      
      // Log the error but not on the final attempt
      if (i < maxRetries - 1) {
        logger.warn(`Call failed (attempt ${i+1}/${maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  throw lastError;
}

module.exports = {
  createReliableProvider,
  createPairProvider,
  makeReliableCall,
  PREMIUM_RPC_ENDPOINTS,
  BACKUP_RPC_ENDPOINTS
};