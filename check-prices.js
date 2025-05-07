/**
 * Standalone Price Checker for BNB Chain Tokens
 * This utility checks prices across multiple DEXes
 * 
 * Usage: node check-prices.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const PancakeswapV2 = require('./src/dex/pancakeswapV2');
const PancakeswapV3 = require('./src/dex/pancakeswapV3');
const Apeswap = require('./src/dex/apeswap');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { createReliableProvider } = require('./src/utils/rpcUtils');

// Token addresses from config
const TOKENS = config.TOKENS;

// BNB Chain RPC URLs for fallback
const BNB_RPC_URLS = [
  // Premium endpoints from config file
  "https://bsc-mainnet.infura.io/v3/e61e6bfe6bbd410a842f58f7a98f5813",
  "https://bsc-mainnet.core.chainstack.com/452214f8109f496cc2e3a7c61aeaf3af",
  "https://black-damp-model.bsc.quiknode.pro/3050dcae7ae25db594ae3fa5b795ef24ced74c05/",
  // Public endpoints as fallbacks
  "https://bsc.publicnode.com",
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.defibit.io/"
];

// Set up providers with automatic fallback capabilities
// Create a provider for each RPC URL to distribute the load
const providers = BNB_RPC_URLS.map(url => 
  new ethers.providers.JsonRpcProvider(url)
);

// Use first provider as the default
const provider = providers[0];

// Helper function to execute a call with fallback providers
async function executeWithFallback(fn, providerIndex = 0) {
  try {
    // Try with current provider
    return await fn(providers[providerIndex]);
  } catch (error) {
    // If rate limited, try next provider
    if (error.code === 'SERVER_ERROR' || 
        error.message.includes('limit exceeded') || 
        error.message.includes('processing response error')) {
      
      // Move to next provider if available
      const nextIndex = (providerIndex + 1) % providers.length;
      
      // Avoid infinite recursion if we've tried all providers
      if (nextIndex === providerIndex) {
        throw new Error('All providers exhausted: ' + error.message);
      }
      
      console.log(`Provider ${providerIndex} rate limited, trying provider ${nextIndex}...`);
      return executeWithFallback(fn, nextIndex);
    }
    
    // For other errors, just throw
    throw error;
  }
}

// Initialize DEX interfaces
const pancakeV2 = new PancakeswapV2(provider);
const pancakeV3 = new PancakeswapV3(provider);
const apeswap = new Apeswap(provider);

// Get current gas price
async function getCurrentGasPrice() {
  try {
    const gasPrice = await provider.getGasPrice();
    return `${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`;
  } catch (error) {
    return 'Unknown';
  }
}

// Create DEX instances for each provider
function createDexInstances(provider) {
  return {
    pancakeV2: new PancakeswapV2(provider),
    pancakeV3: new PancakeswapV3(provider),
    apeswap: new Apeswap(provider)
  };
}

// Check price for a token pair with fallback support
async function checkPrice(tokenA, tokenB, pairName) {
  console.log(`\n========== ${pairName} ==========`);
  console.log(`TokenA: ${tokenA}`);
  console.log(`TokenB: ${tokenB}`);
  
  // PancakeSwap V2 with fallback
  try {
    const pancakeV2Price = await executeWithFallback(async (provider) => {
      const dex = new PancakeswapV2(provider);
      return await dex.getPrice(tokenA, tokenB);
    });
    
    if (pancakeV2Price) {
      const formattedPrice = ethers.utils.formatEther(pancakeV2Price);
      console.log(`PancakeSwap V2: ${formattedPrice} (Fee: 0.25%)`);
    } else {
      console.log('PancakeSwap V2: N/A');
    }
  } catch (error) {
    console.log(`PancakeSwap V2: Error - ${error.message.substring(0, 60)}...`);
  }
  
  // PancakeSwap V3 with fallback
  try {
    // Try multiple fee tiers for V3
    const feeTiers = [10, 100, 500, 2500, 10000]; // 0.01%, 0.05%, 0.3%, 1%, 5%
    let v3Price = null;
    let usedFeeTier = null;
    
    // Loop through fee tiers with fallback capability
    for (const feeTier of feeTiers) {
      try {
        // Test this fee tier with fallback capability
        const price = await executeWithFallback(async (provider) => {
          const dex = new PancakeswapV3(provider);
          return await dex.getPrice(tokenA, tokenB, feeTier);
        });
        
        if (price && !price.isZero()) {
          v3Price = price;
          usedFeeTier = feeTier;
          break;
        }
      } catch (e) {
        // Continue to next fee tier
        console.log(`  V3 fee tier ${feeTier} not available or errored: ${e.message.substring(0, 40)}...`);
      }
    }
    
    if (v3Price) {
      const formattedPrice = ethers.utils.formatEther(v3Price);
      const feeName = usedFeeTier === 10 ? '0.01%' : 
                     usedFeeTier === 100 ? '0.05%' : 
                     usedFeeTier === 500 ? '0.3%' : 
                     usedFeeTier === 2500 ? '1%' : '5%';
      console.log(`PancakeSwap V3: ${formattedPrice} (Fee: ${feeName})`);
    } else {
      console.log('PancakeSwap V3: N/A - No active pool found');
    }
  } catch (error) {
    console.log(`PancakeSwap V3: Error - ${error.message.substring(0, 60)}...`);
  }
  
  // ApeSwap with fallback
  try {
    const apeswapPrice = await executeWithFallback(async (provider) => {
      const dex = new Apeswap(provider);
      return await dex.getPrice(tokenA, tokenB);
    });
    
    if (apeswapPrice) {
      const formattedPrice = ethers.utils.formatEther(apeswapPrice);
      console.log(`ApeSwap: ${formattedPrice} (Fee: 0.3%)`);
    } else {
      console.log('ApeSwap: N/A');
    }
  } catch (error) {
    console.log(`ApeSwap: Error - ${error.message.substring(0, 60)}...`);
  }
  
  // Price difference calculator
  try {
    // If we have prices from multiple DEXes, calculate differences
    const prices = [];
    
    // Get PancakeSwap V2 price
    try {
      const pancakeV2Price = await executeWithFallback(async (provider) => {
        const dex = new PancakeswapV2(provider);
        return await dex.getPrice(tokenA, tokenB);
      });
      
      if (pancakeV2Price) {
        prices.push({
          dex: 'PancakeSwap V2',
          price: ethers.utils.formatEther(pancakeV2Price),
          fee: 0.25
        });
      }
    } catch (error) {
      // Ignore errors for price diff calculation
    }
    
    // Get ApeSwap price
    try {
      const apeswapPrice = await executeWithFallback(async (provider) => {
        const dex = new Apeswap(provider);
        return await dex.getPrice(tokenA, tokenB);
      });
      
      if (apeswapPrice) {
        prices.push({
          dex: 'ApeSwap',
          price: ethers.utils.formatEther(apeswapPrice),
          fee: 0.3
        });
      }
    } catch (error) {
      // Ignore errors for price diff calculation
    }
    
    // Calculate price differences
    if (prices.length >= 2) {
      console.log('\n📊 Price Differences:');
      
      for (let i = 0; i < prices.length; i++) {
        for (let j = i + 1; j < prices.length; j++) {
          const dex1 = prices[i];
          const dex2 = prices[j];
          
          const price1 = parseFloat(dex1.price);
          const price2 = parseFloat(dex2.price);
          
          // Calculate percentage difference
          const priceDiff = Math.abs(price1 - price2);
          const avgPrice = (price1 + price2) / 2;
          const percentDiff = (priceDiff / avgPrice) * 100;
          
          // Determine buy/sell direction
          const buyDex = price1 < price2 ? dex1.dex : dex2.dex;
          const sellDex = price1 < price2 ? dex2.dex : dex1.dex;
          const buyPrice = price1 < price2 ? price1 : price2;
          const sellPrice = price1 < price2 ? price2 : price1;
          
          console.log(`  ${percentDiff.toFixed(2)}% difference between ${dex1.dex} and ${dex2.dex}`);
          console.log(`  → Buy at ${buyDex} (${buyPrice.toFixed(6)}) and sell at ${sellDex} (${sellPrice.toFixed(6)})`);
          
          // Calculate fees
          const buyFee = price1 < price2 ? dex1.fee : dex2.fee;
          const sellFee = price1 < price2 ? dex2.fee : dex1.fee;
          const totalFeePercent = buyFee + sellFee;
          
          // Calculate profit after fees
          const rawProfitPercent = percentDiff;
          const netProfitPercent = rawProfitPercent - totalFeePercent;
          
          console.log(`  → Total fees: ${totalFeePercent.toFixed(2)}%`);
          console.log(`  → Net profit: ${netProfitPercent > 0 ? '+' : ''}${netProfitPercent.toFixed(2)}%`);
          
          if (netProfitPercent > 0) {
            console.log(`  ✅ PROFITABLE OPPORTUNITY`);
          } else {
            console.log(`  ❌ Not profitable after fees`);
          }
          console.log('');
        }
      }
    }
  } catch (error) {
    // Silently ignore errors in the price difference calculator
  }
  
  console.log('==============================');
}

// Delay function to avoid rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Main function
async function main() {
  console.log('=======================================');
  console.log('  BNB Chain DEX Price Checker Utility  ');
  console.log('=======================================');
  
  try {
    // Try to connect to blockchain with fallback support
    const networkInfo = await executeWithFallback(async (provider) => {
      return await provider.getNetwork();
    });
    
    console.log(`\nConnected to BNB Chain: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);
    
    // Get current gas price with fallback support
    const gasPrice = await executeWithFallback(async (provider) => {
      return await provider.getGasPrice();
    });
    
    console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
    
    // Get current block with fallback support
    const blockNumber = await executeWithFallback(async (provider) => {
      return await provider.getBlockNumber();
    });
    
    console.log(`Current block: ${blockNumber}`);
    
    // Define pairs to check
    const pairsToCheck = [
      { tokenA: TOKENS.CAKE, tokenB: TOKENS.WBNB, name: 'CAKE/WBNB' },    // CAKE/BNB is known to work well
      { tokenA: TOKENS.WBNB, tokenB: TOKENS.BUSD, name: 'WBNB/BUSD' },
      { tokenA: TOKENS.WBNB, tokenB: TOKENS.USDT, name: 'WBNB/USDT' },
      { tokenA: TOKENS.BUSD, tokenB: TOKENS.USDT, name: 'BUSD/USDT' }
    ];
    
    // Check prices for each pair with delay between checks
    for (const pair of pairsToCheck) {
      await checkPrice(pair.tokenA, pair.tokenB, pair.name);
      // Add 2-second delay between pairs to avoid rate limiting
      await delay(2000);
    }
    
    console.log('\nPrice check completed successfully!');
  } catch (error) {
    console.error(`\nError connecting to blockchain: ${error.message}`);
    console.error('Make sure BNB_RPC_URL_KEY environment variable is set correctly.');
    
    // Try all available RPC endpoints
    console.log('\nAttempting to use alternative RPC endpoints...');
    
    for (let i = 0; i < providers.length; i++) {
      try {
        const network = await providers[i].getNetwork();
        console.log(`\nRPC endpoint ${i+1} connected successfully to ${network.name} (Chain ID: ${network.chainId})`);
        break;
      } catch (err) {
        console.error(`RPC endpoint ${i+1} failed: ${err.message}`);
      }
    }
  }
}

// Execute main function
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`Error in main execution: ${error.message}`);
    process.exit(1);
  });