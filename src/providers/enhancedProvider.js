/**
 * Enhanced provider with sequential RPC rotation on rate limit errors
 * When primary RPC URL hits rate limit, switches to secondary, then tertiary
 */

const { ethers } = require('ethers');
const logger = require('../utils/logger');
const config = require('../config');
const { retryWithBackoff } = require('../utils/requestUtils');

// Track RPC endpoint status
const rpcEndpointStatus = {
  // The three main RPC endpoints
  primaryRpcUrl: null,
  secondaryRpcUrl: null,
  tertiaryRpcUrl: null,
  
  // Current active RPC URL (one of the three above)
  currentRpcUrl: null,
  
  // Initialize the endpoints from config
  init() {
    // Set up primary, secondary, and tertiary RPC URLs
    this.primaryRpcUrl = config.BLOCKCHAIN.PRIMARY_RPC_URL || 'https://bsc-dataseed1.binance.org/';
    this.secondaryRpcUrl = config.BLOCKCHAIN.SECONDARY_RPC_URL || 'https://bsc-dataseed2.binance.org/';
    this.tertiaryRpcUrl = config.BLOCKCHAIN.TERTIARY_RPC_URL || 'https://bsc-dataseed3.binance.org/';
    
    // Start with primary RPC URL
    this.currentRpcUrl = this.primaryRpcUrl;
    
    logger.info(`Initialized sequential RPC endpoint manager with 3 endpoints`);
    logger.info(`Primary: ${this.primaryRpcUrl.substring(0, 20)}...`);
    logger.info(`Secondary: ${this.secondaryRpcUrl.substring(0, 20)}...`);
    logger.info(`Tertiary: ${this.tertiaryRpcUrl.substring(0, 20)}...`);
  },
  
  // Get the current RPC URL
  getCurrentRpcUrl() {
    if (!this.currentRpcUrl) {
      this.init();
    }
    return this.currentRpcUrl;
  },
  
  // Handle "limit exceeded" error by rotating to next RPC URL
  handleLimitExceeded() {
    if (!this.currentRpcUrl) {
      this.init();
    }
    
    // Sequential rotation:
    // Primary -> Secondary -> Tertiary -> Primary
    
    if (this.currentRpcUrl === this.primaryRpcUrl) {
      // Primary hit limit, switch to secondary
      this.currentRpcUrl = this.secondaryRpcUrl;
      logger.info(`Primary RPC hit rate limit, switching to secondary: ${this.secondaryRpcUrl.substring(0, 20)}...`);
    }
    else if (this.currentRpcUrl === this.secondaryRpcUrl) {
      // Secondary hit limit, switch to tertiary
      this.currentRpcUrl = this.tertiaryRpcUrl;
      logger.info(`Secondary RPC hit rate limit, switching to tertiary: ${this.tertiaryRpcUrl.substring(0, 20)}...`);
    }
    else {
      // Tertiary hit limit, switch back to primary
      this.currentRpcUrl = this.primaryRpcUrl;
      logger.info(`Tertiary RPC hit rate limit, switching back to primary: ${this.primaryRpcUrl.substring(0, 20)}...`);
    }
    
    return this.currentRpcUrl;
  }
};

/**
 * Build an authenticated RPC URL with the API key if needed
 * @param {string} baseUrl - Base RPC URL
 * @param {string} apiKey - API Key for the RPC service
 * @returns {string} - Complete authenticated RPC URL
 */
function buildAuthenticatedRpcUrl(baseUrl, apiKey) {
  // If no API key or URL already contains the key, return as is
  if (!apiKey || apiKey.trim() === '' || baseUrl.includes(apiKey)) {
    return baseUrl;
  }
  
  try {
    // Different services have different URL formats for API keys
    if (baseUrl.includes('ankr.com')) {
      // Ankr format: https://rpc.ankr.com/bsc/{apiKey}
      return baseUrl.endsWith('/') ? `${baseUrl}${apiKey}` : `${baseUrl}/${apiKey}`;
    } 
    else if (baseUrl.includes('getblock.io')) {
      // GetBlock format: Various formats depending on endpoint
      if (baseUrl.includes('/mainnet/')) {
        // This needs an authorization header, but since we can't set headers directly,
        // we append it as a query param and the provider will handle it
        return baseUrl.endsWith('/') 
          ? `${baseUrl}?api_key=${apiKey}` 
          : `${baseUrl}/?api_key=${apiKey}`;
      }
      
      // For standard endpoints
      if (baseUrl.endsWith('/')) {
        return `${baseUrl}${apiKey}/`;
      } else {
        return `${baseUrl}/${apiKey}/`;
      }
    }
    else if (baseUrl.includes('nodereal')) {
      // For NodeReal, check if it already contains a key in the v1/ part
      if (baseUrl.includes('/v1/')) {
        return baseUrl.replace('/v1/', `/v1/${apiKey}/`);
      }
      return baseUrl;
    }
    
    // For other services, append as a query parameter as default
    if (baseUrl.includes('?')) {
      return `${baseUrl}&apiKey=${apiKey}`;
    } else {
      return `${baseUrl}?apiKey=${apiKey}`;
    }
  } catch (error) {
    logger.error(`Error building authenticated URL: ${error.message}`);
    // Return the original URL if any error occurs
    return baseUrl;
  }
}

/**
 * Create a provider that performs sequential RPC rotation on rate limits
 * @param {Object} options - Provider options
 * @returns {ethers.providers.Provider} - Enhanced provider instance
 */
function createEnhancedProvider(options = {}) {
  // Initialize RPC endpoint manager
  rpcEndpointStatus.init();
  
  // Get current RPC endpoint
  const initialEndpoint = rpcEndpointStatus.getCurrentRpcUrl();
  
  // Build authenticated URL if API key is provided
  const apiKey = options.apiKey || process.env.BNB_RPC_URL_KEY || '';
  const authenticatedUrl = buildAuthenticatedRpcUrl(initialEndpoint, apiKey);
  
  // Create provider
  const provider = new ethers.providers.JsonRpcProvider({
    url: authenticatedUrl,
    timeout: options.timeout || 15000,
    allowGzip: true,
    polling: true,
    pollingInterval: 5000,
    retry: 3,
  }, {
    name: 'bnb',
    chainId: 56
  });
  
  // Store the current RPC URL to check if we need to update it
  provider._currentRpcUrl = authenticatedUrl;
  
  // Add custom middleware to enhance the provider with our retry logic
  const originalPerform = provider.perform.bind(provider);
  provider.perform = async (method, params) => {
    return retryWithBackoff(
      async () => {
        // Check if we need to update the RPC URL due to rotation
        if (provider.connection && 
            provider.connection.url !== provider._currentRpcUrl) {
          provider.connection.url = provider._currentRpcUrl;
          logger.debug(`Updated provider connection URL to: ${provider._currentRpcUrl.substring(0, 20)}...`);
        }
        
        try {
          return await originalPerform(method, params);
        } catch (error) {
          // Check for rate limit errors - error code -32005 or "limit exceeded"
          if (error.code === 'SERVER_ERROR' && 
              error.error && 
              (error.error.code === -32005 || 
              (error.error.message && error.error.message.includes('limit exceeded')))) {
            
            // Rotate to the next RPC URL in the sequence
            const newEndpoint = rpcEndpointStatus.handleLimitExceeded();
            const newAuthUrl = buildAuthenticatedRpcUrl(newEndpoint, apiKey);
            
            // Update the provider URL
            provider._currentRpcUrl = newAuthUrl;
            if (provider.connection) {
              provider.connection.url = newAuthUrl;
            }
          }
          
          throw error; // Rethrow for the retry logic to handle
        }
      },
      options.maxRetries || 5,
      options.initialDelay || 1000,
      (error) => {
        // Handle rate limit errors
        if (error.code === 'SERVER_ERROR' && 
            error.error && 
            (error.error.code === -32005 || 
             (error.error.message && error.error.message.includes('limit exceeded')))) {
          
          logger.warn('Rate limit exceeded, will retry with next RPC in sequence');
          return true;
        }
        
        // Handle network errors
        if (error.code === 'NETWORK_ERROR' || 
            error.code === 'TIMEOUT' || 
            error.code === 'CONNECTION_ERROR') {
          logger.warn(`Network error: ${error.code}, will retry with next RPC in sequence`);
          
          // Rotate to next RPC on network errors too
          const newEndpoint = rpcEndpointStatus.handleLimitExceeded();
          const newAuthUrl = buildAuthenticatedRpcUrl(newEndpoint, apiKey);
          
          // Update the provider URL
          provider._currentRpcUrl = newAuthUrl;
          if (provider.connection) {
            provider.connection.url = newAuthUrl;
          }
          
          return true;
        }
        
        return false;
      }
    );
  };
  
  return provider;
}

/**
 * Create multiple enhanced providers as a fallback collection
 * Each provider uses the sequential rotation internally
 * @param {Object} options - Provider options
 * @returns {ethers.providers.FallbackProvider} - FallbackProvider with enhanced providers
 */
function createMultiEnhancedProvider(options = {}) {
  // Initialize RPC endpoint manager
  rpcEndpointStatus.init();
  
  // Create 3 providers with the same sequential rotation
  const providers = [];
  
  try {
    // Primary provider (highest priority)
    const primaryProvider = createEnhancedProvider({
      ...options,
      priority: 1
    });
    
    providers.push({
      provider: primaryProvider,
      priority: 1,
      stallTimeout: 3000,
      weight: 1
    });
    
    logger.info('Created primary enhanced provider');
    
    // Add backup providers if requested
    if (options.providerCount && options.providerCount > 1) {
      // Secondary provider
      const secondaryProvider = createEnhancedProvider({
        ...options,
        priority: 2
      });
      
      providers.push({
        provider: secondaryProvider,
        priority: 2,
        stallTimeout: 4000,
        weight: 1
      });
      
      logger.info('Created secondary enhanced provider');
    }
    
    if (options.providerCount && options.providerCount > 2) {
      // Tertiary provider
      const tertiaryProvider = createEnhancedProvider({
        ...options,
        priority: 3
      });
      
      providers.push({
        provider: tertiaryProvider,
        priority: 3,
        stallTimeout: 5000,
        weight: 1
      });
      
      logger.info('Created tertiary enhanced provider');
    }
  } catch (error) {
    logger.error(`Failed to create providers: ${error.message}`);
  }
  
  // If we have no valid providers
  if (providers.length === 0) {
    throw new Error('No valid providers could be created');
  }
  
  // Create FallbackProvider with all providers
  const fallbackProvider = new ethers.providers.FallbackProvider(providers, {
    quorum: 1 // Only require one provider to respond successfully
  });
  
  // Set polling interval
  fallbackProvider.pollingInterval = 5000;
  
  return fallbackProvider;
}

module.exports = {
  createEnhancedProvider,
  createMultiEnhancedProvider,
  rpcEndpointStatus
};