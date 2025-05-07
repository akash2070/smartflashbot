/**
 * Utility for validating price data to avoid using unrealistic or incorrect values
 */

// Set of stablecoin addresses (typically pegged to $1)
const STABLECOIN_ADDRESSES = new Set([
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'.toLowerCase(), // BUSD
  '0x55d398326f99059fF775485246999027B3197955'.toLowerCase(), // USDT
  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'.toLowerCase(), // USDC
  '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3'.toLowerCase(), // DAI
  '0x14016E85a25aeb13065688cAFB43044C2ef86784'.toLowerCase(), // TrueUSD
]);

/**
 * Check if a token address is a known stablecoin
 * @param {string} tokenAddress - The token address to check
 * @returns {boolean} - True if the token is a stablecoin
 */
function isStablecoin(tokenAddress) {
  return STABLECOIN_ADDRESSES.has(tokenAddress.toLowerCase());
}

/**
 * Validate price value to detect obviously wrong values
 * @param {string} tokenA - First token address
 * @param {string} tokenB - Second token address
 * @param {number|object} price - Price to validate (number or BigNumber)
 * @returns {boolean} - True if the price seems valid
 */
function validatePrice(tokenA, tokenB, price) {
  // Convert the price to a number if it's not already
  const priceValue = typeof price === 'object' && price.toString ? 
    parseFloat(price.toString()) : 
    parseFloat(price);

  // Basic validation checks first
  // Don't allow zero or negative prices
  if (priceValue <= 0) {
    return false;
  }

  // Validate against unrealistically high values
  // For any pair, reject extremely high values (above 1 million)
  if (priceValue > 1000000) {
    return false;
  }

  // Both tokens are stablecoins (should be close to 1:1)
  if (isStablecoin(tokenA) && isStablecoin(tokenB)) {
    // For stablecoin pairs, price should be around 1.0 with very tight range
    // Most stablecoin pairs never deviate more than 2% from peg in normal markets
    const lowerBound = 0.98;
    const upperBound = 1.02;
    
    // If the price is exactly 1.0, it's likely a default value and should be validated more carefully
    // This catches cases where the price is artificially set to 1.0 without actual market data
    if (priceValue === 1.0) {
      // We'll be more suspicious of exact 1.0 values unless they're from a trusted source
      // This will be handled by the caller with context information
      return true; // Allow it, but caller should check the source
    }
    
    // For all other values, use the tight range
    return priceValue >= lowerBound && priceValue <= upperBound;
  }

  // If one token is a stablecoin and the other is a major token (like WBNB),
  // we can apply some reasonable constraints based on market reality
  if (isStablecoin(tokenA) || isStablecoin(tokenB)) {
    // No stablecoin should be worth more than 10,000 WBNB or less than 0.00001 WBNB
    // This is an extremely wide range but catches obvious errors
    if (priceValue > 10000 || priceValue < 0.00001) {
      return false;
    }
  }
  
  // All other validation passed
  return true;
}

module.exports = {
  isStablecoin,
  validatePrice
};