const { ethers } = require('ethers');
const { 
  getSafeGasPrice, 
  calculateGasCost, 
  calculateMaxFlashLoanAmount,
  applyDynamicSlippage,
  determineOptimalFlashLoanSize,
  formatEther
} = require('../utils/helpers');
const { calculateOptimalFlashLoanSize } = require('../utils/advancedSizing');
const config = require('../config');
const logger = require('../utils/logger');
const PancakeswapV3 = require('../dex/pancakeswapV3');

/**
 * Private helper method for calculating optimal flash loan size 
 * Note: This is a local implementation that is being deprecated
 * in favor of the more advanced algorithm in utils/helpers.js
 * @private
 */
function _calculateOptimalSize(dexLiquidities) {
  try {
    // Find the lowest liquidity among all DEXes
    let lowestLiquidity = null;
    
    for (const [dex, liquidity] of Object.entries(dexLiquidities)) {
      if (lowestLiquidity === null || liquidity.lt(lowestLiquidity)) {
        lowestLiquidity = liquidity;
      }
    }
    
    // Default to a very small amount if we couldn't find any DEX liquidity
    if (!lowestLiquidity || lowestLiquidity.isZero()) {
      return ethers.utils.parseEther('0.05');
    }
    
    // Calculate a safe percentage (3%) of the lowest liquidity
    // This helps us avoid excessive price impact
    const safePercentage = ethers.BigNumber.from(3); // 3%
    const multiplier = ethers.BigNumber.from(100);
    
    const optimalSize = lowestLiquidity.mul(safePercentage).div(multiplier);
    
    // Apply caps based on config
    const maxFlashLoanConfig = config.arbitrage?.maxFlashLoanAmount || '50';
    const maxFlashLoanAmount = ethers.utils.parseEther(maxFlashLoanConfig);
    
    if (optimalSize.gt(maxFlashLoanAmount)) {
      return maxFlashLoanAmount;
    }
    
    // Ensure we're not using too small of an amount (minimum 0.05 BNB)
    const minAmount = ethers.utils.parseEther('0.05');
    if (optimalSize.lt(minAmount)) {
      return minAmount;
    }
    
    return optimalSize;
  } catch (error) {
    logger.error(`Error determining optimal flash loan size: ${error.message}`);
    // Default to a conservative amount
    return ethers.utils.parseEther('0.1');
  }
}

// calculateMaxFlashLoanAmount is now imported from helpers.js

// applyDynamicSlippage is now imported from helpers.js

// getSafeGasPrice is now imported from helpers.js

// calculateGasCost is now imported from helpers.js

class ArbitrageCalculator {
  constructor(provider) {
    this.provider = provider;
    this.pancakeV3 = new PancakeswapV3(provider);
    
    // Minimum profit threshold in BNB (default: 0.005 BNB ~= $3 USD)
    const minProfitBNB = config.ARBITRAGE?.MIN_PROFIT_BNB || config.arbitrage?.minProfitUsd ? (config.arbitrage.minProfitUsd / 600).toString() : '0.005';
    this.minProfitBNB = ethers.utils.parseEther(minProfitBNB);
    
    // Profit threshold multiplier (profit must be X times the cost)
    // Convert the multiplier to basis points (e.g., 1.5 -> 150) to avoid using floating point with BigNumber
    const profitThresholdMultiplier = config.ARBITRAGE?.PROFIT_THRESHOLD_MULTIPLIER || 
                                      config.arbitrage?.minProfitPercentage || 1.5;
    this.profitThresholdMultiplier = ethers.BigNumber.from(
      Math.floor(profitThresholdMultiplier * 100)
    );
  }
  
  /**
   * Calculate potential profit for an arbitrage opportunity
   * @param {Object} opportunity - Arbitrage opportunity
   * @returns {Promise<Object>} - Profit calculation result
   */
  async calculateProfit(opportunity) {
    try {
      const { pair, buy, sell } = opportunity;
      const { token1, token2 } = pair;
      
      // Determine which token to flash loan (usually the base token)
      const baseToken = token1; // For simplicity, use token1 as base
      const quoteToken = token2;
      
      // Find the best pool for flash loan
      const flashLoanPool = await this.pancakeV3.getBestFlashLoanPool(baseToken);
      
      if (!flashLoanPool) {
        logger.warn(`No suitable flash loan pool found for ${baseToken}`);
        return {
          isProfitable: false,
          reason: 'No suitable flash loan pool'
        };
      }
      
      // Gather liquidity information from all DEXes involved
      const dexLiquidities = {};
      
      // Get liquidity info from both DEXes in the arbitrage route
      try {
        if (buy.adapter && typeof buy.adapter.getLiquidity === 'function') {
          const buyLiquidityInfo = await buy.adapter.getLiquidity(baseToken, quoteToken);
          if (buyLiquidityInfo && buyLiquidityInfo.exists) {
            dexLiquidities[buy.dex.toLowerCase()] = buyLiquidityInfo.liquidity;
            logger.debug(`${buy.dex} liquidity: ${formatEther(buyLiquidityInfo.liquidity)} BNB`);
          }
        }
        
        if (sell.adapter && typeof sell.adapter.getLiquidity === 'function') {
          const sellLiquidityInfo = await sell.adapter.getLiquidity(quoteToken, baseToken);
          if (sellLiquidityInfo && sellLiquidityInfo.exists) {
            dexLiquidities[sell.dex.toLowerCase()] = sellLiquidityInfo.liquidity;
            logger.debug(`${sell.dex} liquidity: ${formatEther(sellLiquidityInfo.liquidity)} BNB`);
          }
        }
      } catch (error) {
        logger.warn(`Error fetching DEX liquidity: ${error.message}`);
      }
      
      // Calculate maximum flash loan amount based on pool liquidity
      const tokenBalance = baseToken === flashLoanPool.token0 
        ? flashLoanPool.balance0 
        : flashLoanPool.balance1;
      
      // Add flash loan pool liquidity to DEX liquidities
      dexLiquidities['pancakeswapv3'] = tokenBalance;
      
      // Calculate optimal flash loan amount based on DEX liquidities using the advanced model
      // This considers liquidity, spread, volatility, and gas price
      let flashLoanAmount;
      try {
        // Calculate the price spread for use in sizing algorithm
        const buyPrice = 1 / parseFloat(buy.price);
        const sellPrice = parseFloat(sell.price);
        const spread = Math.abs((sellPrice - buyPrice) / buyPrice);
        
        // Get current gas price
        const gasPrice = await getSafeGasPrice(this.provider);
        
        // Use the advanced sizing algorithm
        flashLoanAmount = calculateOptimalFlashLoanSize(dexLiquidities, spread, {
          gasPrice,
          baseToken,
          quoteToken,
          // Include recent price history if available
          priceHistory: opportunity.priceHistory || []
        });
        
        logger.info(`Using advanced optimal flash loan size of ${formatEther(flashLoanAmount)} BNB based on comprehensive analysis (spread: ${(spread * 100).toFixed(4)}%)`);
      } catch (error) {
        // If there's an error with the advanced calculation, fall back to legacy approach
        try {
          flashLoanAmount = determineOptimalFlashLoanSize(dexLiquidities);
          logger.warn(`Falling back to legacy optimal sizing: ${formatEther(flashLoanAmount)} BNB (error with advanced sizing: ${error.message})`);
        } catch (fallbackError) {
          // If even the legacy approach fails, use a very conservative size
          const maxFlashLoanAmount = calculateMaxFlashLoanAmount(tokenBalance);
          flashLoanAmount = maxFlashLoanAmount.div(100);
          logger.warn(`Falling back to ultra-conservative flash loan size: ${formatEther(flashLoanAmount)} BNB (multiple sizing errors)`);
        }
      }
      
      // Calculate flash loan fee
      const flashLoanFee = this.pancakeV3.calculateFlashLoanFee(
        flashLoanAmount,
        flashLoanPool.fee
      );
      
      // Calculate expected output from first swap (buy)
      const buyAmount = flashLoanAmount;
      let buyOutput;
      
      // Apply dynamic slippage based on pool liquidity
      let adjustedBuyAmount = buyAmount;
      if (buy.dex && buy.dex.toLowerCase() in dexLiquidities) {
        let buyDexLiquidity = dexLiquidities[buy.dex.toLowerCase()];
        if (!buyDexLiquidity.isZero()) {
          // Use dynamic slippage calculation for buy transactions
          adjustedBuyAmount = applyDynamicSlippage(
            buyAmount,
            buyDexLiquidity,
            buy.dex,
            false // false = increase amount for slippage on buy
          );
          
          logger.debug(`Applied dynamic buy slippage for ${buy.dex}: ${formatEther(buyAmount)} → ${formatEther(adjustedBuyAmount)}`);
        }
      }

      if (buy.type === 'v2') {
        // For ApeSwap, we have a consistent 0.3% fee for all pairs
        // For PancakeSwap V2, the fee is also 0.3%
        buyOutput = await buy.instance.getAmountOut(adjustedBuyAmount, baseToken, quoteToken);
      } else if (buy.type === 'v3') {
        // For V3, we need to include the fee
        const bestPool = await this.pancakeV3.getBestPool(baseToken, quoteToken);
        buyOutput = await this.pancakeV3.getAmountOut(
          adjustedBuyAmount,
          baseToken,
          quoteToken,
          bestPool.fee
        );
      }
      
      // Calculate expected output from second swap (sell)
      let sellOutput;
      
      // Apply dynamic slippage for sell transaction
      let minAcceptedOutput = buyOutput;
      if (sell.dex && sell.dex.toLowerCase() in dexLiquidities) {
        let sellDexLiquidity = dexLiquidities[sell.dex.toLowerCase()];
        if (!sellDexLiquidity.isZero()) {
          // Apply slippage to the minimum output we'll accept (true = reduce for minimum out)
          minAcceptedOutput = applyDynamicSlippage(
            buyOutput,
            sellDexLiquidity,
            sell.dex,
            true // true means we reduce the amount for slippage on sell
          );
          
          logger.debug(`Applied dynamic sell slippage for ${sell.dex}: expect at least ${formatEther(minAcceptedOutput)} output from ${formatEther(buyOutput)} input`);
        }
      }
      
      if (sell.type === 'v2') {
        // For ApeSwap, we have a consistent 0.3% fee for all pairs
        // For PancakeSwap V2, the fee is also 0.3%
        sellOutput = await sell.instance.getAmountOut(buyOutput, quoteToken, baseToken);
      } else if (sell.type === 'v3') {
        // For V3, we need to include the fee
        const bestPool = await this.pancakeV3.getBestPool(quoteToken, baseToken);
        sellOutput = await this.pancakeV3.getAmountOut(
          buyOutput,
          quoteToken,
          baseToken,
          bestPool.fee
        );
      }
      
      // Check if sell output meets our minimum expectations
      if (sellOutput.lt(minAcceptedOutput) && sell.dex && sell.dex.toLowerCase() in dexLiquidities) {
        logger.debug(`Expected output ${formatEther(sellOutput)} is lower than minimum accepted ${formatEther(minAcceptedOutput)}`);
        // Adjust the expected output to account for slippage in real execution
        sellOutput = minAcceptedOutput;
      }
      
      // Calculate gross profit (before gas)
      const grossProfit = sellOutput.sub(flashLoanAmount).sub(flashLoanFee);
      
      // Estimate gas costs
      const gasPrice = await getSafeGasPrice(this.provider);
      
      // Estimate gas for the entire transaction
      // Flash loan + 2 swaps + approvals + buffer
      const estimatedGas = ethers.BigNumber.from(700000); // Conservative estimate
      
      const gasCost = calculateGasCost(gasPrice, estimatedGas);
      
      // Calculate net profit
      const netProfit = grossProfit.sub(gasCost);
      
      // Calculate break-even threshold
      const breakEvenThreshold = gasCost.mul(this.profitThresholdMultiplier);
      
      // Determine if profitable
      const isProfitable = netProfit.gt(this.minProfitBNB) && netProfit.gt(breakEvenThreshold);
      
      // If not profitable, try to adjust flash loan amount
      if (!isProfitable && grossProfit.gt(0)) {
        // If we have gross profit but not enough net profit, try with larger amount
        // This is a simplified approach - in a full implementation, we would use binary search
        // to find the optimal flash loan amount
        
        // Try with a stepped-up amount (3x the initial amount)
        const largerAmount = flashLoanAmount.mul(3);
        
        // Calculate maximum flash loan amount if not already done
        const maxFlashLoanAmount = calculateMaxFlashLoanAmount(tokenBalance);
        
        // Check if the larger amount is within limits
        if (largerAmount.lte(maxFlashLoanAmount)) {
          logger.debug(`Retrying with larger flash loan amount: ${ethers.utils.formatEther(largerAmount)} ${baseToken}`);
          
          // Recalculate with larger amount and pass the liquidity data
          const largerResult = await this.recalculateWithAmount(
            opportunity,
            largerAmount,
            flashLoanPool,
            gasPrice,
            { liquidityData: dexLiquidities }
          );
          
          // If profitable with larger amount, return that result
          if (largerResult.isProfitable) {
            return largerResult;
          }
        }
      }
      
      // Prepare the result
      const route = [
        `Flash loan ${ethers.utils.formatEther(flashLoanAmount)} from ${this.pancakeV3.name}`,
        `Buy ${ethers.utils.formatEther(buyOutput)} ${quoteToken} on ${buy.dex}`,
        `Sell for ${ethers.utils.formatEther(sellOutput)} ${baseToken} on ${sell.dex}`,
        `Repay ${ethers.utils.formatEther(flashLoanAmount.add(flashLoanFee))} to flash loan`
      ];
      
      // Log profitable opportunities with detailed information
      if (isProfitable) {
        logger.info(`💰 PROFITABLE ARBITRAGE FOUND for ${pair.name}:`);
        logger.info(`   Route: ${buy.dex} -> ${sell.dex}`);
        logger.info(`   Flash loan: ${ethers.utils.formatEther(flashLoanAmount)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Expected profit: ${ethers.utils.formatEther(netProfit)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Gross profit: ${ethers.utils.formatEther(grossProfit)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Gas cost: ${ethers.utils.formatEther(gasCost)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Flash loan fee: ${ethers.utils.formatEther(flashLoanFee)} ${config.NETWORK.NATIVE_SYMBOL}`);
      }
      
      return {
        isProfitable,
        profit: netProfit,
        grossProfit,
        flashLoanAmount,
        flashLoanFee,
        gasCost,
        route,
        buy: {
          dex: buy.dex,
          amount: buyAmount,
          output: buyOutput
        },
        sell: {
          dex: sell.dex,
          amount: buyOutput,
          output: sellOutput
        },
        flashLoanPool: flashLoanPool.address,
        tokens: {
          baseToken,
          quoteToken
        }
      };
    } catch (error) {
      logger.error(`Error calculating profit: ${error.message}`);
      return {
        isProfitable: false,
        reason: `Calculation error: ${error.message}`
      };
    }
  }
  
  /**
   * Recalculate profit with a different flash loan amount
   * @param {Object} opportunity - Arbitrage opportunity
   * @param {BigNumber} amount - Flash loan amount
   * @param {Object} flashLoanPool - Flash loan pool
   * @param {BigNumber} gasPrice - Current gas price
   * @returns {Promise<Object>} - Profit calculation result
   */
  async recalculateWithAmount(opportunity, amount, flashLoanPool, gasPrice, options = {}) {
    try {
      const { pair, buy, sell } = opportunity;
      const { token1, token2 } = pair;
      
      const baseToken = token1;
      const quoteToken = token2;
      
      // Check if liquidity data is provided in options
      const liquidityData = options.liquidityData || {};
      
      // Calculate flash loan fee
      const flashLoanFee = this.pancakeV3.calculateFlashLoanFee(
        amount,
        flashLoanPool.fee
      );
      
      // Calculate expected output from first swap (buy)
      const buyAmount = amount;
      let buyOutput;
      
      // Apply dynamic slippage based on pool liquidity if we have the data
      let buyLiquidity = null;
      if (liquidityData && liquidityData[buy.dex.toLowerCase()]) {
        buyLiquidity = liquidityData[buy.dex.toLowerCase()];
        // Log the liquidity being used for slippage calculation
        logger.debug(`Using ${formatEther(buyLiquidity)} BNB liquidity for ${buy.dex} slippage calculation`);
      }

      // Calculate the buy amount with appropriate slippage
      let adjustedBuyAmount = buyAmount;
      if (buyLiquidity && !buyLiquidity.isZero()) {
        // Use dynamic slippage calculation based on pool liquidity
        adjustedBuyAmount = applyDynamicSlippage(
          buyAmount, 
          buyLiquidity, 
          buy.dex,
          false // false means we increase the amount for slippage on buy
        );
        
        logger.debug(`Applied dynamic slippage for ${buy.dex} buy: ${formatEther(buyAmount)} → ${formatEther(adjustedBuyAmount)}`);
      }

      if (buy.type === 'v2') {
        // For ApeSwap, we have a consistent 0.3% fee for all pairs
        // For PancakeSwap V2, the fee is also 0.3%
        buyOutput = await buy.instance.getAmountOut(adjustedBuyAmount, baseToken, quoteToken);
      } else if (buy.type === 'v3') {
        const bestPool = await this.pancakeV3.getBestPool(baseToken, quoteToken);
        buyOutput = await this.pancakeV3.getAmountOut(
          adjustedBuyAmount,
          baseToken,
          quoteToken,
          bestPool.fee
        );
      }
      
      // Calculate expected output from second swap (sell)
      let sellOutput;
      
      // Apply dynamic slippage for sell transaction based on pool liquidity
      let sellLiquidity = null;
      if (liquidityData && liquidityData[sell.dex.toLowerCase()]) {
        sellLiquidity = liquidityData[sell.dex.toLowerCase()];
        logger.debug(`Using ${formatEther(sellLiquidity)} BNB liquidity for ${sell.dex} slippage calculation`);
      }
      
      // Get the "minimum accepted" output with slippage applied
      let minAcceptedOutput = buyOutput;
      if (sellLiquidity && !sellLiquidity.isZero()) {
        // Apply slippage to the minimum output we'll accept (true = reduce for minimum out)
        minAcceptedOutput = applyDynamicSlippage(
          buyOutput,
          sellLiquidity,
          sell.dex,
          true // true means we decrease the amount for slippage on sell
        );
        
        logger.debug(`Applied dynamic slippage for ${sell.dex} sell: expect at least ${formatEther(minAcceptedOutput)} output from ${formatEther(buyOutput)} input`);
      }
      
      if (sell.type === 'v2') {
        // For ApeSwap, we have a consistent 0.3% fee for all pairs
        // For PancakeSwap V2, the fee is also 0.3%
        sellOutput = await sell.instance.getAmountOut(buyOutput, quoteToken, baseToken);
      } else if (sell.type === 'v3') {
        const bestPool = await this.pancakeV3.getBestPool(quoteToken, baseToken);
        sellOutput = await this.pancakeV3.getAmountOut(
          buyOutput,
          quoteToken,
          baseToken,
          bestPool.fee
        );
      }
      
      // Check if sell output meets our minimum expectations
      if (sellOutput.lt(minAcceptedOutput) && sellLiquidity && !sellLiquidity.isZero()) {
        logger.debug(`Expected output ${formatEther(sellOutput)} is lower than minimum accepted ${formatEther(minAcceptedOutput)}`);
        // Adjust the expected output down to account for slippage in real execution
        sellOutput = minAcceptedOutput;
      }
      
      // Calculate gross profit (before gas)
      const grossProfit = sellOutput.sub(amount).sub(flashLoanFee);
      
      // Estimate gas for the entire transaction
      const estimatedGas = ethers.BigNumber.from(700000); // Conservative estimate
      
      const gasCost = calculateGasCost(gasPrice, estimatedGas);
      
      // Calculate net profit
      const netProfit = grossProfit.sub(gasCost);
      
      // Calculate break-even threshold
      const breakEvenThreshold = gasCost.mul(this.profitThresholdMultiplier);
      
      // Determine if profitable
      const isProfitable = netProfit.gt(this.minProfitBNB) && netProfit.gt(breakEvenThreshold);
      
      // Prepare the route
      const route = [
        `Flash loan ${ethers.utils.formatEther(amount)} from ${this.pancakeV3.name}`,
        `Buy ${ethers.utils.formatEther(buyOutput)} ${quoteToken} on ${buy.dex}`,
        `Sell for ${ethers.utils.formatEther(sellOutput)} ${baseToken} on ${sell.dex}`,
        `Repay ${ethers.utils.formatEther(amount.add(flashLoanFee))} to flash loan`
      ];
      
      // Log profitable opportunities with detailed information
      if (isProfitable) {
        logger.info(`💰 PROFITABLE ARBITRAGE FOUND with recalculated amount for ${pair.name}:`);
        logger.info(`   Route: ${buy.dex} -> ${sell.dex}`);
        logger.info(`   Flash loan: ${ethers.utils.formatEther(amount)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Expected profit: ${ethers.utils.formatEther(netProfit)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Gross profit: ${ethers.utils.formatEther(grossProfit)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Gas cost: ${ethers.utils.formatEther(gasCost)} ${config.NETWORK.NATIVE_SYMBOL}`);
        logger.info(`   Flash loan fee: ${ethers.utils.formatEther(flashLoanFee)} ${config.NETWORK.NATIVE_SYMBOL}`);
      }
      
      return {
        isProfitable,
        profit: netProfit,
        grossProfit,
        flashLoanAmount: amount,
        flashLoanFee,
        gasCost,
        route,
        buy: {
          dex: buy.dex,
          amount: buyAmount,
          output: buyOutput
        },
        sell: {
          dex: sell.dex,
          amount: buyOutput,
          output: sellOutput
        },
        flashLoanPool: flashLoanPool.address,
        tokens: {
          baseToken,
          quoteToken
        }
      };
    } catch (error) {
      logger.error(`Error recalculating profit: ${error.message}`);
      return {
        isProfitable: false,
        reason: `Recalculation error: ${error.message}`
      };
    }
  }
}

module.exports = ArbitrageCalculator;
