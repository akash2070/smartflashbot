const { ethers } = require('ethers');
const config = require('../config');
const logger = require('../utils/logger');
const createMultiProvider = require('./multiProvider');
const { createEnhancedProvider, createMultiEnhancedProvider } = require('./enhancedProvider');

/**
 * Create a WebSocket provider for real-time mempool monitoring
 * This is essential for MEV strategy detection and competitive bot monitoring
 * @returns {ethers.providers.WebSocketProvider|null} WebSocket provider or null if connection fails
 */
function createWebSocketProvider() {
  // Premium WebSocket endpoints with authentication provided by the user
  // These are required for proper MEV detection capabilities
  
  // Extract all available WebSocket URLs from the config
  const urls = [];
  
  // First add the premium endpoints
  if (config.BNB_WSS_URLS) {
    if (config.BNB_WSS_URLS.PRIMARY) urls.push(config.BNB_WSS_URLS.PRIMARY);
    if (config.BNB_WSS_URLS.INFURA1) urls.push(config.BNB_WSS_URLS.INFURA1);
    if (config.BNB_WSS_URLS.CHAINSTACK) urls.push(config.BNB_WSS_URLS.CHAINSTACK);
    if (config.BNB_WSS_URLS.INFURA2) urls.push(config.BNB_WSS_URLS.INFURA2);
  }
  
  // If no URLs are available, return null
  if (urls.length === 0) {
    logger.warn('No WebSocket URLs configured for mempool monitoring');
    return null;
  }
  
  // Try each WebSocket URL until one works
  for (const url of urls) {
    try {
      logger.info(`Creating WebSocket provider with URL: ${url.substring(0, 25)}...`);
      
      // Create the WebSocket provider
      const provider = new ethers.providers.WebSocketProvider(url, {
        name: 'bnb',
        chainId: 56
      });
      
      // Set up event listeners
      provider._websocket.onopen = () => {
        logger.info(`WebSocket connection established with: ${url.substring(0, 25)}...`);
      };
      
      provider._websocket.onerror = (error) => {
        logger.error(`WebSocket error: ${error.message || 'Unknown error'}`);
      };
      
      provider._websocket.onclose = () => {
        logger.warn(`WebSocket connection closed with: ${url.substring(0, 25)}...`);
      };
      
      return provider;
    } catch (error) {
      logger.error(`Error creating WebSocket provider with ${url.substring(0, 25)}...: ${error.message}`);
    }
  }
  
  // If all attempts failed, return null
  logger.error('Failed to create WebSocket provider with any URL');
  return null;
}

/**
 * Create provider and wallet for BNB Chain
 * Uses enhanced provider with auto-rotation for rate limit errors
 * @returns {Promise<{provider: ethers.providers.Provider, wallet: ethers.Wallet}>} Provider and wallet
 */
async function createProviderAndWallet() {
  // Check if we're using real blockchain or simulation
  const useRealBlockchain = process.env.USE_REAL_BLOCKCHAIN === 'true';
  const devMode = process.env.DEV_MODE === 'true';
  
  logger.info(`Creating blockchain provider with USE_REAL_BLOCKCHAIN=${useRealBlockchain}, DEV_MODE=${devMode}`);
  
  // If in simulation mode, use a very simplified provider setup
  if (!useRealBlockchain || devMode) {
    logger.info('Using simulation mode with simplified provider');
    
    // Create a simple JSON-RPC provider
    const provider = new ethers.providers.JsonRpcProvider({
      url: 'https://bsc-dataseed1.binance.org/',
      timeout: 30000,
      allowGzip: true
    }, {
      name: 'bnb',
      chainId: 56
    });
    
    // Create wallet from environment private key or random one
    let wallet;
    const privateKey = process.env.PRIVATE_KEY;
    
    if (privateKey) {
      // Create wallet from private key
      try {
        // Remove '0x' prefix if present
        const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
        wallet = new ethers.Wallet(cleanPrivateKey, provider);
        logger.info('Successfully initialized wallet from private key');
      } catch (error) {
        logger.error(`Failed to create wallet from private key: ${error.message}`);
        wallet = ethers.Wallet.createRandom().connect(provider);
        logger.warn('Using random wallet for simulation');
      }
    } else {
      // Create a random wallet for simulation
      logger.warn('Using random wallet for simulation. DO NOT USE IN PRODUCTION!');
      wallet = ethers.Wallet.createRandom().connect(provider);
    }
    
    logger.info(`Using wallet address: ${wallet.address}`);
    return { provider, wallet };
  } else {
    // For real blockchain connectivity, use our enhanced provider with automatic rotation
    
    // Get the API key from environment (if available)
    const apiKey = process.env.BNB_RPC_URL_KEY || '';
    
    // Configure and expose the primary, secondary, and tertiary RPC URLs in config
    config.BLOCKCHAIN.PRIMARY_RPC_URL = process.env.BNB_RPC_URL || "https://bsc-dataseed1.binance.org/";
    config.BLOCKCHAIN.SECONDARY_RPC_URL = process.env.BNB_RPC_URL_BACKUP1 || "https://bsc-dataseed2.binance.org/";
    config.BLOCKCHAIN.TERTIARY_RPC_URL = process.env.BNB_RPC_URL_BACKUP2 || "https://rpc.ankr.com/bsc/";
    
    // Make sure the config has the RPC_URLS array
    if (!config.BLOCKCHAIN.RPC_URLS) {
      config.BLOCKCHAIN.RPC_URLS = [
        "https://bsc-dataseed1.binance.org/",
        "https://bsc-dataseed2.binance.org/",
        "https://bsc-dataseed3.binance.org/",
        "https://bsc-dataseed4.binance.org/",
        "https://rpc.ankr.com/bsc/"
      ];
    }
    
    logger.info('Using enhanced provider with automatic RPC rotation for rate limit handling');
    
    try {
      // First try the multi-provider approach for best reliability
      logger.info('Creating multi-enhanced provider with automatic rotation...');
      
      const provider = createMultiEnhancedProvider({
        apiKey,
        timeout: 30000,
        maxRetries: 5,
        initialDelay: 1000,
        providerCount: 3 // Create 3 providers in the fallback chain
      });
      
      // Test the connection
      try {
        logger.info('Testing connection to blockchain...');
        const network = await provider.getNetwork();
        logger.info(`Successfully connected to network: ${network.name} (Chain ID: ${network.chainId})`);
        
        // Create wallet from private key
        const privateKey = process.env.PRIVATE_KEY;
        
        if (!privateKey) {
          throw new Error('PRIVATE_KEY environment variable not set');
        }
        
        // Create wallet
        const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
        const wallet = new ethers.Wallet(cleanPrivateKey, provider);
        
        logger.info(`Using wallet address: ${wallet.address}`);
        return { provider, wallet };
      } catch (error) {
        logger.error(`Multi-provider connection failed: ${error.message}`);
        // Fall back to a single enhanced provider
        logger.warn('Falling back to single enhanced provider...');
      }
      
      // Fallback to single enhanced provider
      const singleProvider = createEnhancedProvider({
        apiKey,
        timeout: 30000,
        maxRetries: 7, // More retries for the single provider
        initialDelay: 1000
      });
      
      // Test connection with single provider
      logger.info('Testing connection with single enhanced provider...');
      const network = await singleProvider.getNetwork();
      logger.info(`Successfully connected to network: ${network.name} (Chain ID: ${network.chainId})`);
      
      // Create wallet from private key
      const privateKey = process.env.PRIVATE_KEY;
      
      if (!privateKey) {
        throw new Error('PRIVATE_KEY environment variable not set');
      }
      
      // Create wallet
      const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
      const wallet = new ethers.Wallet(cleanPrivateKey, singleProvider);
      
      logger.info(`Using wallet address: ${wallet.address}`);
      return { provider: singleProvider, wallet };
      
    } catch (providerError) {
      // Last resort: try to establish connection the old way with individual RPC URLs
      logger.error(`Enhanced provider creation failed: ${providerError.message}`);
      logger.warn('Falling back to old connection method with individual RPC URLs');
      
      // Get RPC URLs from environment or config
      const rpcUrls = [
        process.env.BNB_RPC_URL_KEY,
        process.env.BNB_RPC_URL,
        process.env.BNB_RPC_URL_BACKUP1,
        process.env.BNB_RPC_URL_BACKUP2,
        config.network?.rpcUrl,
        "https://bsc-dataseed1.binance.org/",
        "https://bsc-dataseed2.binance.org/",
        "https://bsc-dataseed3.binance.org/",
        "https://bsc-dataseed4.binance.org/",
        "https://rpc.ankr.com/bsc/"
      ].filter(Boolean); // Remove any undefined or null values
      
      if (rpcUrls.length === 0) {
        throw new Error('No RPC URLs available for blockchain connection');
      }
      
      // Try each RPC URL directly
      for (const url of rpcUrls) {
        try {
          logger.info(`Trying direct connection to: ${url.substring(0, 20)}...`);
          
          // Create provider
          const provider = new ethers.providers.JsonRpcProvider({
            url,
            timeout: 30000,
            allowGzip: true
          }, { chainId: 56 });
          
          // Test the connection
          const network = await provider.getNetwork();
          logger.info(`Successfully connected to network: ${network.name} (Chain ID: ${network.chainId})`);
          
          // Create wallet
          const privateKey = process.env.PRIVATE_KEY;
          
          if (!privateKey) {
            throw new Error('PRIVATE_KEY environment variable not set');
          }
          
          const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
          const wallet = new ethers.Wallet(cleanPrivateKey, provider);
          
          logger.info(`Using wallet address: ${wallet.address}`);
          return { provider, wallet };
        } catch (error) {
          logger.error(`Failed to connect to ${url.substring(0, 20)}...: ${error.message}`);
          continue;
        }
      }
      
      // If we get here, all connection attempts failed initially, but we'll keep trying
      logger.error('Failed to connect to any RPC endpoint on initial attempt');
      logger.warn('Creating a minimal provider that will continue retrying connections');
      
      // Create a minimal provider that will retry connections
      const fallbackProvider = new ethers.providers.JsonRpcProvider(
        'https://bsc-dataseed1.binance.org/',
        { name: 'bnb', chainId: 56 }
      );
      
      // Create wallet with minimal functionality
      const privateKey = process.env.PRIVATE_KEY;
      if (!privateKey) {
        logger.error('PRIVATE_KEY environment variable not set');
        const wallet = ethers.Wallet.createRandom().connect(fallbackProvider);
        logger.warn(`Using random wallet for recovery mode: ${wallet.address}`);
        return { provider: fallbackProvider, wallet };
      }
      
      // Create wallet
      const cleanPrivateKey = privateKey.startsWith('0x') ? privateKey.substring(2) : privateKey;
      const wallet = new ethers.Wallet(cleanPrivateKey, fallbackProvider);
      
      logger.warn(`Using recovery mode with address: ${wallet.address}`);
      return { provider: fallbackProvider, wallet };
    }
  }
}

/**
 * Create wallet and provider for testnet
 * @returns {Promise<{provider: ethers.providers.Provider, wallet: ethers.Wallet}>} Provider and wallet
 */
async function createTestnetProviderAndWallet() {
  // Create a new testnet provider
  const provider = createEnhancedProvider({
    timeout: 30000,
    apiKey: process.env.BNB_TESTNET_API_KEY,
    maxRetries: 5, 
    initialDelay: 1000
  });
  
  // Create a new random wallet and connect to the provider
  const wallet = new ethers.Wallet.createRandom().connect(provider);
  
  return { provider, wallet };
}

module.exports = {
  createProviderAndWallet,
  createWebSocketProvider,
  createTestnetProviderAndWallet
};
