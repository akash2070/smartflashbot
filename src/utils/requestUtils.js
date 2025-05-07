/**
 * Utility functions for managing HTTP requests and blockchain calls
 */

const { ethers } = require('ethers');
const logger = require('./logger');
const config = require('../config');

// Track RPC endpoint status across the application
const rpcEndpointStatus = {
  endpoints: [],
  currentIndex: 0,
  limitExceededTimestamps: {},
  forbiddenEndpoints: new Set(), // Track endpoints that returned 403 errors
  
  // Initialize the endpoints from config
  init() {
    if (this.endpoints.length === 0) {
      // Use RPC URLs from config (primary and fallbacks)
      this.endpoints = [
        ...config.BLOCKCHAIN.RPC_URLS
      ];
      
      // Add additional RPCs if available
      if (config.network && config.network.alternativeRpcUrls) {
        this.endpoints = [...this.endpoints, ...config.network.alternativeRpcUrls];
      }
      
      // Remove duplicates
      this.endpoints = [...new Set(this.endpoints)];
      
      logger.info(`Initialized RPC endpoint manager with ${this.endpoints.length} endpoints`);
    }
  },
  
  // Get the next available endpoint
  getNextEndpoint() {
    this.init(); // Ensure endpoints are initialized
    
    // First try: iterate through all endpoints
    const startIndex = this.currentIndex;
    const now = Date.now();
    
    // Go through all endpoints starting from current
    for (let i = 0; i < this.endpoints.length; i++) {
      const idx = (startIndex + i) % this.endpoints.length;
      const endpoint = this.endpoints[idx];
      
      // Skip forbidden endpoints
      if (this.forbiddenEndpoints.has(endpoint)) {
        continue;
      }
      
      // Check if this endpoint has exceeded its limit recently
      const limitExceededTime = this.limitExceededTimestamps[endpoint];
      if (limitExceededTime && now - limitExceededTime < 5000) { // 5 second cooldown
        logger.debug(`Skipping endpoint ${endpoint.substring(0, 20)}... (rate limited, cooling down)`);
        continue;
      }
      
      // We found a usable endpoint, update the current index
      this.currentIndex = (idx + 1) % this.endpoints.length;
      return endpoint;
    }
    
    // If we get here, all endpoints are rate limited, use the oldest one
    let oldestTimestamp = Infinity;
    let oldestEndpoint = this.endpoints[0];
    
    for (const endpoint of this.endpoints) {
      if (!this.forbiddenEndpoints.has(endpoint)) {
        const timestamp = this.limitExceededTimestamps[endpoint] || 0;
        if (timestamp < oldestTimestamp) {
          oldestTimestamp = timestamp;
          oldestEndpoint = endpoint;
        }
      }
    }
    
    // Update current index to point after the oldest endpoint
    const oldestIdx = this.endpoints.indexOf(oldestEndpoint);
    this.currentIndex = (oldestIdx + 1) % this.endpoints.length;
    
    logger.warn(`All endpoints rate limited, using oldest: ${oldestEndpoint.substring(0, 20)}...`);
    return oldestEndpoint;
  },
  
  // Mark an endpoint as rate limited
  markRateLimited(endpoint) {
    this.limitExceededTimestamps[endpoint] = Date.now();
    logger.warn(`Marked endpoint as rate limited: ${endpoint.substring(0, 20)}...`);
  },
  
  // Mark an endpoint as forbidden (403)
  markForbidden(endpoint) {
    this.forbiddenEndpoints.add(endpoint);
    logger.error(`Marked endpoint as forbidden (403): ${endpoint.substring(0, 20)}...`);
  },
  
  // Reset a specific endpoint's rate limit status
  resetEndpoint(endpoint) {
    delete this.limitExceededTimestamps[endpoint];
    this.forbiddenEndpoints.delete(endpoint);
    logger.info(`Reset endpoint status: ${endpoint.substring(0, 20)}...`);
  },
  
  // Clear all rate limit flags (used periodically)
  resetAllRateLimits() {
    this.limitExceededTimestamps = {};
    logger.info('Reset all RPC endpoint rate limit statuses');
  }
};

// Periodically reset rate limit status (every 30 seconds)
setInterval(() => {
  rpcEndpointStatus.resetAllRateLimits();
}, 30000);

/**
 * Exponential backoff retry for blockchain calls with intelligent RPC rotation
 * @param {Function} fn - The function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in ms
 * @param {Function} shouldRetry - Function to determine if error should be retried
 * @param {ethers.providers.Provider|null} provider - Optional provider to swap if needed
 * @returns {Promise<any>} - Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 10, initialDelay = 1000, shouldRetry = null, provider = null) {
  let retries = 0;
  let currentRpc = null;
  
  // Default retry condition handles common blockchain errors
  if (!shouldRetry) {
    shouldRetry = (error) => {
      // Retry on rate limit errors
      if (error.code === 'SERVER_ERROR' && 
          error.error && 
          error.error.code === -32005) {
        
        // Mark the current RPC as rate limited if we know which one it is
        if (currentRpc) {
          rpcEndpointStatus.markRateLimited(currentRpc);
        }
        
        logger.warn('Rate limit exceeded, will retry with different RPC endpoint');
        return true;
      }
      
      // Check for 403 Forbidden errors
      if (error.code === 'SERVER_ERROR' && 
          error.status === 403) {
        
        // Mark the endpoint as forbidden
        if (currentRpc) {
          rpcEndpointStatus.markForbidden(currentRpc);
        }
        
        logger.warn('Endpoint returned 403 Forbidden, will retry with different RPC endpoint');
        return true;
      }
      
      // Retry on network errors
      if (error.code === 'NETWORK_ERROR' || 
          error.code === 'TIMEOUT' || 
          error.code === 'CONNECTION_ERROR') {
        logger.warn(`Network error: ${error.code}, will retry with different RPC after delay`);
        return true;
      }
      
      // Retry on ethers.js provider errors that are transient
      if (error.code === 'CALL_EXCEPTION' && 
          error.error && 
          (error.error.code === -32005 || error.error.message === 'limit exceeded')) {
        
        // Mark the current RPC as rate limited if we know which one it is
        if (currentRpc) {
          rpcEndpointStatus.markRateLimited(currentRpc);
        }
        
        logger.warn('Provider call exception (rate limit), will retry with different RPC');
        return true;
      }
      
      return false;
    };
  }
  
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (retries >= maxRetries || !shouldRetry(error)) {
        logger.error(`Failed after ${retries} retries: ${error.message}`);
        throw error;
      }
      
      // If we have a provider and the error is rate limit related, switch its RPC endpoint
      if (provider && 
          (error.code === 'SERVER_ERROR' && error.error && error.error.code === -32005) ||
          (error.code === 'CALL_EXCEPTION' && error.error && 
           (error.error.code === -32005 || error.error.message === 'limit exceeded'))) {
        
        try {
          // Get a different RPC endpoint
          const newRpcUrl = rpcEndpointStatus.getNextEndpoint();
          currentRpc = newRpcUrl;
          
          // Try to update the provider's connection
          if (provider.connection && typeof provider.connection.url === 'string') {
            // For JsonRpcProvider
            logger.info(`Switching provider to ${newRpcUrl.substring(0, 20)}...`);
            provider.connection.url = newRpcUrl;
          } else if (provider._nextProvider) {
            // For FallbackProvider, try to influence its decision
            logger.info(`Attempting to influence FallbackProvider to use ${newRpcUrl.substring(0, 20)}...`);
            // This is a bit tricky as FallbackProvider manages providers internally
          }
        } catch (providerError) {
          logger.error(`Failed to switch provider RPC: ${providerError.message}`);
        }
      }
      
      // Calculate exponential backoff delay
      const delay = initialDelay * Math.pow(1.5, retries); // Less aggressive growth
      logger.debug(`Retrying after ${delay}ms (attempt ${retries + 1}/${maxRetries})`);
      
      retries++;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Get gas price with retry logic
 * @param {ethers.providers.Provider} provider - Blockchain provider
 * @returns {Promise<ethers.BigNumber>} - Current gas price
 */
async function getGasPriceWithRetry(provider) {
  return retryWithBackoff(
    async () => provider.getGasPrice(),
    3,
    1000
  );
}

/**
 * Get blockchain transaction with retry logic
 * @param {ethers.providers.Provider} provider - Blockchain provider
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object>} - Transaction data
 */
async function getTransactionWithRetry(provider, txHash) {
  return retryWithBackoff(
    async () => provider.getTransaction(txHash),
    5,
    2000
  );
}

/**
 * Get transaction receipt with retry logic
 * @param {ethers.providers.Provider} provider - Blockchain provider
 * @param {string} txHash - Transaction hash
 * @param {number} maxAttempts - Maximum attempts to get receipt
 * @returns {Promise<Object>} - Transaction receipt
 */
async function getTransactionReceiptWithRetry(provider, txHash, maxAttempts = 30) {
  return retryWithBackoff(
    async () => {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        throw new Error('Receipt not available yet');
      }
      return receipt;
    },
    maxAttempts,
    4000,
    (error) => error.message === 'Receipt not available yet' || error.code === 'SERVER_ERROR'
  );
}

/**
 * Call a contract method with retry logic
 * @param {ethers.Contract} contract - Contract instance
 * @param {string} method - Method name
 * @param {Array} args - Method arguments
 * @returns {Promise<any>} - Method result
 */
async function callContractWithRetry(contract, method, args = []) {
  return retryWithBackoff(
    async () => contract[method](...args),
    4,
    1000
  );
}

module.exports = {
  retryWithBackoff,
  getGasPriceWithRetry,
  getTransactionWithRetry,
  getTransactionReceiptWithRetry,
  callContractWithRetry
};
