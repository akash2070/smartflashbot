/**
 * Quick script to fetch all token pair prices from the dashboard API
 */
const axios = require('axios');
const { ethers } = require('ethers');
const logger = require('./src/utils/logger');
require('dotenv').config();

// The dashboard API endpoint
const API_URL = 'http://localhost:5000/api/prices';

/**
 * Format price data for display
 * @param {Object} priceData - Price data from the API
 */
function formatPriceData(priceData) {
  if (!priceData || !priceData.prices) {
    logger.error('No valid price data received');
    return;
  }

  const prices = priceData.prices;
  
  // For each token pair
  Object.keys(prices).forEach(pairName => {
    const pair = prices[pairName];
    logger.info(`\n===== ${pairName} =====`);
    
    if (pair.pancakeswapV2 && pair.pancakeswapV2.price !== 'N/A') {
      logger.info(`PancakeSwap V2: ${pair.pancakeswapV2.price} (Fee: ${pair.pancakeswapV2.swapFee}%)`);
    } else {
      logger.info('PancakeSwap V2: N/A');
    }
    
    if (pair.pancakeswapV3 && pair.pancakeswapV3.price !== 'N/A') {
      logger.info(`PancakeSwap V3: ${pair.pancakeswapV3.price} (Fee: ${pair.pancakeswapV3.swapFee}%)`);
    } else {
      logger.info('PancakeSwap V3: N/A');
    }
    
    if (pair.apeswap && pair.apeswap.price !== 'N/A') {
      logger.info(`ApeSwap: ${pair.apeswap.price} (Fee: ${pair.apeswap.swapFee}%)`);
    } else {
      logger.info('ApeSwap: N/A');
    }
    
    if (pair.biswap && pair.biswap.price !== 'N/A') {
      logger.info(`BiSwap: ${pair.biswap.price} (Fee: ${pair.biswap.swapFee}%)`);
    } else {
      logger.info('BiSwap: N/A');
    }
  });
  
  // Display arbitrage opportunities
  const opportunities = priceData.opportunities || [];
  if (opportunities.length > 0) {
    logger.info('\n===== Arbitrage Opportunities =====');
    opportunities.forEach((opp, index) => {
      logger.info(`Opportunity #${index + 1}: ${opp.pair}`);
      logger.info(`Buy on ${opp.buyDex} at ${opp.startAmount / opp.midAmount}`);
      logger.info(`Sell on ${opp.sellDex} at ${opp.endAmount / opp.midAmount}`);
      logger.info(`Profit: ${opp.profitPercent.toFixed(2)}% (Est. ${opp.estimatedProfit.toFixed(4)} BNB)`);
      logger.info(`Gas Cost: ${opp.gasCost.toFixed(4)} BNB`);
      logger.info('-----------------------------------');
    });
  } else {
    logger.info('\nNo arbitrage opportunities found');
  }
  
  // Display any real-time data received
  if (priceData.realPrices) {
    logger.info('\n===== Raw Real-Time Price Data =====');
    logger.info(JSON.stringify(priceData.realPrices, null, 2));
  }
}

/**
 * Fetch all token pair prices
 */
async function getAllPrices() {
  try {
    logger.info('Fetching all token pair prices from dashboard API...');
    const response = await axios.get(API_URL);
    
    if (response.status === 200 && response.data) {
      logger.info(`Data retrieved successfully at ${response.data.timestamp || 'unknown time'}`);
      formatPriceData(response.data);
    } else {
      logger.error(`Failed to get price data. Status: ${response.status}`);
    }
  } catch (error) {
    logger.error(`Error fetching price data: ${error.message}`);
    
    // If the error is that the server isn't running, give a helpful message
    if (error.code === 'ECONNREFUSED') {
      logger.error('Make sure the dashboard server is running on port 5000');
    }
  }
}

// Run the script
getAllPrices();