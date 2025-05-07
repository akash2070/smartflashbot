/**
 * Utility functions for contract interactions with retry logic
 */

const { ethers } = require('ethers');
const { retryWithBackoff } = require('./requestUtils');
const logger = require('./logger');

/**
 * Creates a contract instance with built-in retry logic for all calls
 * @param {string} address - Contract address
 * @param {Array|Object} abi - Contract ABI
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {ethers.Signer} [signer] - Optional signer for write operations
 * @returns {ethers.Contract} - Enhanced contract instance
 */
function createContractWithRetry(address, abi, provider, signer = null) {
  // Create the base contract instance
  const contract = new ethers.Contract(
    address,
    abi,
    signer || provider
  );
  
  // Instead of using a Proxy which can cause issues with class structure,
  // let's enhance the contract instance directly by wrapping only the specific methods we want
  
  // Get all function methods (ignoring special ethers.js methods)
  const methodNames = Object.keys(contract.functions || {});
  
  // Wrap each method with retry logic
  methodNames.forEach(methodName => {
    // Skip methods that are already properties or special ethers methods
    if (methodName.includes('(') || methodName === 'constructor' || 
        methodName === 'connect' || methodName === 'attach' || 
        methodName === 'deployed' || methodName === 'provider' || 
        methodName === 'signer' || methodName === 'interface') {
      return;
    }
    
    // Save the original method
    const originalMethod = contract[methodName].bind(contract);
    
    // Replace with wrapped method
    contract[methodName] = async (...args) => {
      return retryWithBackoff(
        async () => originalMethod(...args),
        5, // 5 retries
        1000, // 1 second initial delay
        (error) => {
          // Retry on rate limit errors
          if (error.code === 'SERVER_ERROR' && 
              error.error && 
              error.error.code === -32005) {
            logger.warn(`Rate limit hit calling ${methodName}, retrying after delay`);
            return true;
          }
          
          // Retry on CALL_EXCEPTION with rate limit
          if (error.code === 'CALL_EXCEPTION' && 
              error.error && 
              error.error.code === -32005) {
            logger.warn(`Call exception with rate limit on ${methodName}, retrying after delay`);
            return true;
          }
          
          // Retry on network errors
          if (error.code === 'NETWORK_ERROR' || 
              error.code === 'TIMEOUT' || 
              error.code === 'CONNECTION_ERROR') {
            logger.warn(`Network error: ${error.code}, retrying ${methodName} after delay`);
            return true;
          }
          
          return false;
        }
      );
    };
  });
  
  // Return the enhanced contract
  return contract;
}

/**
 * Wraps an ERC20 token contract with retry logic
 * @param {string} tokenAddress - Token contract address
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @param {ethers.Signer} [signer] - Optional signer for transactions
 * @returns {ethers.Contract} - ERC20 contract with retry
 */
function createERC20WithRetry(tokenAddress, provider, signer = null) {
  // Basic ERC20 ABI with common functions
  const erc20Abi = [
    // Read-only functions
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    // Write functions
    "function transfer(address to, uint amount) returns (bool)",
    "function approve(address spender, uint amount) returns (bool)",
    "function transferFrom(address from, address to, uint amount) returns (bool)",
    // Events
    "event Transfer(address indexed from, address indexed to, uint amount)",
    "event Approval(address indexed owner, address indexed spender, uint amount)"
  ];
  
  return createContractWithRetry(tokenAddress, erc20Abi, provider, signer);
}

/**
 * Creates a DEX pair contract with retry logic
 * @param {string} pairAddress - Pair contract address
 * @param {ethers.providers.Provider} provider - Ethereum provider
 * @returns {ethers.Contract} - Pair contract with retry
 */
function createPairContractWithRetry(pairAddress, provider) {
  // Basic pair ABI with common functions for DEX pairs
  const pairAbi = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function price0CumulativeLast() view returns (uint)",
    "function price1CumulativeLast() view returns (uint)"
  ];
  
  return createContractWithRetry(pairAddress, pairAbi, provider);
}

module.exports = {
  createContractWithRetry,
  createERC20WithRetry,
  createPairContractWithRetry
};