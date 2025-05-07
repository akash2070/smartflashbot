const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { retryWithBackoff } = require('../utils/requestUtils');

/**
 * Build an authenticated RPC URL with the API key if needed
 * @param {string} baseUrl - Base RPC URL
 * @param {string} apiKey - API Key for the RPC service
 * @returns {string} - Complete authenticated RPC URL
 */
function buildAuthenticatedRpcUrl(baseUrl, apiKey) {
  // Log the attempt to authenticate URL (without showing the API key)
  logger.debug(`Preparing RPC URL: ${baseUrl.substring(0, 30)}...`);
  
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
      // For JSON-RPC over HTTPS: https://bsc.getblock.io/mainnet/
      if (baseUrl.includes('/mainnet/')) {
        logger.debug('Using GetBlock mainnet endpoint with API key');
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
    else if (baseUrl.includes('pokt.network')) {
      // Pocket Network format: Replace /lb/ with /lb/{apiKey}/
      return baseUrl.replace('/lb/', `/lb/${apiKey}/`);
    }
    else if (baseUrl.includes('moralis.io')) {
      // Moralis format: Add ?apiKey={apiKey}
      return `${baseUrl}?apiKey=${apiKey}`;
    }
    else if (baseUrl.includes('nodereal')) {
      // For NodeReal, check if it already contains a key in the v1/ part
      if (baseUrl.includes('/v1/') && !baseUrl.includes('/v1/YOUR-API-KEY')) {
        return baseUrl;
      }
      // Otherwise, append the key
      return baseUrl.replace('/v1/', `/v1/${apiKey}/`);
    }
    else if (baseUrl.includes('alchemy')) {
      // Alchemy typically has the key in the URL already, but if not, append it
      if (baseUrl.includes('/YOUR-API-KEY')) {
        return baseUrl.replace('/YOUR-API-KEY', `/${apiKey}`);
      }
      return baseUrl;
    }
    else if (baseUrl.includes('infura.io')) {
      // Infura format: https://bsc-mainnet.infura.io/v3/{apiKey}
      if (!baseUrl.includes('/v3/')) {
        // Add v3/ path and API key if not present
        if (baseUrl.endsWith('/')) {
          return `${baseUrl}v3/${apiKey}`;
        }
        return `${baseUrl}/v3/${apiKey}`;
      } 
      // If already has /v3/ but not the key
      else if (baseUrl.includes('/v3/YOUR-API-KEY')) {
        return baseUrl.replace('/v3/YOUR-API-KEY', `/v3/${apiKey}`);
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
 * Create a MultiProvider with failover capabilities using ethers FallbackProvider
 * @param {Array<string>} urls - Array of RPC URLs
 * @param {number} timeout - Timeout in milliseconds
 * @param {string} apiKey - Optional API key for authenticated access
 * @returns {ethers.providers.Provider} - Provider instance
 */
function createMultiProvider(urls, timeout = 15000, apiKey = null) {
  if (!urls || urls.length === 0) {
    throw new Error('No RPC URLs provided');
  }

  // If we have an API key from environment, use it
  const rpcKey = apiKey || process.env.BNB_RPC_URL_KEY || '';
  
  // Test if we have a real blockchain connection enabled
  const useRealBlockchain = process.env.USE_REAL_BLOCKCHAIN === 'true';
  logger.info(`Creating blockchain provider with USE_REAL_BLOCKCHAIN=${useRealBlockchain}`);
  
  try {
    // Process URLs to ensure they have API keys if needed
    const authenticatedUrls = urls.map(url => buildAuthenticatedRpcUrl(url, rpcKey));
    
    // Log number of URLs (not the actual URLs for security)
    logger.info(`Processed ${authenticatedUrls.length} RPC URLs for authentication`);
    
    const providers = authenticatedUrls.map((url, index) => {
      try {
        // Only log the base part of the URL without the API key for security
        const urlForLogging = url.split('?')[0];
        const baseUrlForLogging = urlForLogging.substring(0, Math.min(20, urlForLogging.length)) + 
                                 (urlForLogging.length > 20 ? '...' : '');
        logger.info(`Configuring provider ${index + 1}: ${baseUrlForLogging}`);
        
        // Special handling for GetBlock which may need auth headers
        let providerConfig = {
          url: url,
          timeout: timeout,
          allowGzip: true,
          polling: true,
          pollingInterval: 5000,
          retry: 3,  // Number of retries per request
          batchStallTime: 50, // ms wait when a batch provider hasn't responded
        };
        
        // If using GetBlock, they require auth headers for some endpoints
        if (url.includes('getblock.io') && rpcKey) {
          logger.debug('Using GetBlock with authentication headers');
          providerConfig.headers = {
            "x-api-key": rpcKey,
            "Content-Type": "application/json"
          };
        }
        
        // Create provider with explicitly specified chain ID for BNB Chain
        const provider = new ethers.providers.JsonRpcProvider(
          providerConfig,
          {
            name: 'bnb',
            chainId: 56
          }
        );
        
        // Add custom middleware to enhance the provider with our retry logic
        // Monkey-patch the provider's perform method
        const originalPerform = provider.perform.bind(provider);
        provider.perform = async (method, params) => {
          return retryWithBackoff(
            async () => originalPerform(method, params),
            5,  // max retries
            1000, // initial delay in ms
            (error) => {
              // Only retry on rate limit errors
              if (error.code === 'SERVER_ERROR' && 
                  error.error && 
                  error.error.code === -32005) {
                logger.warn(`Rate limit hit on provider ${baseUrlForLogging}, retrying after delay`);
                return true;
              }
              // Retry on common network errors
              if (error.code === 'NETWORK_ERROR' || 
                  error.code === 'TIMEOUT' || 
                  error.code === 'CONNECTION_ERROR') {
                logger.warn(`Network error: ${error.code}, retrying after delay`);
                return true;
              }
              return false;
            }
          );
        };
        
        // Return provider config for FallbackProvider
        return {
          provider: provider,
          priority: index + 1,  // Lower index = higher priority
          stallTimeout: 3000,   // Wait 3s before trying next provider
          weight: 1,            // Equal weight for all providers
        };
      } catch (providerError) {
        logger.error(`Error configuring provider ${index + 1}: ${providerError.message}`);
        return null;
      }
    }).filter(Boolean); // Remove any providers that failed to initialize
    
    // If we have no valid providers
    if (providers.length === 0) {
      throw new Error('No valid providers could be created from the URLs');
    }

    logger.info(`Creating FallbackProvider with ${providers.length} RPC endpoints`);
    
    // Create FallbackProvider with all providers
    const fallbackProvider = new ethers.providers.FallbackProvider(providers, {
      quorum: 1, // Only require one provider to respond successfully
    });

    // Set polling interval
    fallbackProvider.pollingInterval = 5000;
    
    // Add debugging listeners for connection issues
    fallbackProvider.on('debug', info => {
      if (info.action === 'request') {
        logger.debug(`Provider request: ${info.request.method}`);
      } else if (info.action === 'response') {
        if (info.error) {
          logger.error(`Provider response error: ${info.error.message}`);
        }
      }
    });

    return fallbackProvider;
  } catch (error) {
    logger.error(`Error creating MultiProvider: ${error.message}`);
    
    if (!useRealBlockchain) {
      // If we're in development mode, create a more resilient fallback
      logger.warn(`Using development mode with robust fallback provider`);
      
      try {
        // Try to create a basic provider for the first URL
        const fallbackUrl = buildAuthenticatedRpcUrl(urls[0], rpcKey);
        logger.info(`Attempting connection with fallback URL: ${fallbackUrl.substring(0, 20)}...`);
        
        // Create provider with explicitly specified chain ID for BNB Chain
        const simpleProvider = new ethers.providers.JsonRpcProvider({
          url: fallbackUrl,
          timeout: timeout * 2, // Double timeout for fallback
          allowGzip: true,
          throttleSlotInterval: 1000, // Wait 1s between requests
          throttleCallback: function(attempt, url) {
            logger.debug(`Throttling request attempt ${attempt} to ${url.substring(0, 20)}...`);
            return true;
          }
        }, {
          name: 'bnb',
          chainId: 56
        });
        
        logger.info('Created fallback provider for development mode');
        return simpleProvider;
      } catch (fallbackError) {
        logger.error(`Failed to create fallback provider: ${fallbackError.message}`);
      }
    }
    
    // Create a very basic provider as last resort
    logger.warn(`Creating basic provider as last resort`);
    const lastResortProvider = new ethers.providers.JsonRpcProvider({
      url: urls[0],
      timeout: timeout * 2, // Double timeout for last resort
      throttleSlotInterval: 2000 // Add substantial throttling
    }, {
      name: 'bnb',
      chainId: 56
    });
    
    // Add retry logic to last resort provider too
    const originalPerform = lastResortProvider.perform.bind(lastResortProvider);
    lastResortProvider.perform = async (method, params) => {
      return retryWithBackoff(
        async () => originalPerform(method, params),
        7,  // More retries for last resort
        2000, // Higher initial delay
        (error) => {
          // Retry on rate limits and common network errors
          if ((error.code === 'SERVER_ERROR' && error.error && error.error.code === -32005) ||
              error.code === 'NETWORK_ERROR' || 
              error.code === 'TIMEOUT' || 
              error.code === 'CONNECTION_ERROR') {
            logger.warn(`Error in last resort provider: ${error.code}, retrying after delay`);
            return true;
          }
          return false;
        }
      );
    };
    
    return lastResortProvider;
  }
}

module.exports = createMultiProvider;