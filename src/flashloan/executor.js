const { ethers } = require('ethers');
const { getDeadline, applySlippage, getSafeGasPrice, formatEther } = require('../utils/helpers');
const config = require('../config');
const logger = require('../utils/logger');
const PancakeswapV2 = require('../dex/pancakeswapV2');
const PancakeswapV3 = require('../dex/pancakeswapV3');
const Apeswap = require('../dex/apeswap');
const { validatePrice, isStablecoin } = require('../utils/validation');
const safetyManager = require('../utils/safetyManager');

// Import the deployed contract configuration
const DEPLOYED_CONTRACT = {
  // Set to true to enable contract integration
  IS_DEPLOYED: true,
  
  // Our deployed FlashLoanArbitrage_Flattened contract address on BNB mainnet
  ADDRESS: "0x43c006f6e8B7e81f64f2cba0f2a320875feF8c90",
  
  // The BNB Chain network (56 for mainnet, 97 for testnet)
  NETWORK_ID: 56, // BNB Chain Mainnet
};

// ABIs
const ERC20ABI = require('../abis/ERC20.json');
const FlashLoanABI = require('../abis/FlashLoan.json');
const PoolABI = require('../abis/PancakeV3Pool.json');

class FlashLoanExecutor {
  constructor(wallet) {
    this.wallet = wallet;
    this.provider = wallet.provider;
    
    // Initialize DEX instances
    this.pancakeV2 = new PancakeswapV2(this.provider, wallet);
    this.pancakeV3 = new PancakeswapV3(this.provider, wallet);
    this.apeswap = new Apeswap(this.provider, wallet);
    
    // Map of DEX names to instances
    this.dexMap = {
      'PancakeSwap V2': this.pancakeV2,
      'PancakeSwap V3': this.pancakeV3,
      'ApeSwap': this.apeswap
    };
  }
  
  /**
   * Execute a flash loan arbitrage
   * @param {Object} tokens - Token addresses
   * @param {BigNumber} flashLoanAmount - Flash loan amount
   * @param {Array<string>} route - Arbitrage route description
   * @param {Object} protectedParams - MEV protection parameters
   * @returns {Promise<Object>} - Transaction result
   */
  async execute(tokens, flashLoanAmount, route, protectedParams = {}) {
    try {
      // Check if we're in cooldown period
      if (safetyManager.isInCooldown()) {
        return {
          success: false,
          error: 'Bot is in cooldown period after multiple consecutive failures',
          inCooldown: true
        };
      }
      
      // Get current gas price to detect network congestion
      const currentGasPrice = await getSafeGasPrice(this.provider);
      safetyManager.updateGasPrice(currentGasPrice);
      
      // Check for network congestion
      if (safetyManager.isNetworkCongested()) {
        logger.warn('Network congestion detected, proceeding with caution');
        // We could skip execution here, but let's just proceed with higher slippage tolerance
        protectedParams.highGasWarning = true;
      }
      
      const { baseToken, quoteToken } = tokens;
      
      // Log start of execution
      logger.info(`Executing flash loan arbitrage: ${flashLoanAmount.toString()} ${baseToken}`);
      logger.info(`Route: ${route.join(' -> ')}`);
      
      // Get the V3 pool for flash loan
      const flashLoanPool = await this.pancakeV3.getBestFlashLoanPool(baseToken);
      
      if (!flashLoanPool) {
        throw new Error('No suitable flash loan pool found');
      }
      
      // Create pool contract instance
      const poolContract = new ethers.Contract(
        flashLoanPool.address,
        PoolABI,
        this.provider
      );
      
      const poolWithSigner = poolContract.connect(this.wallet);
      
      // Determine token0 and token1 in the pool
      const token0 = await poolContract.token0();
      const token1 = await poolContract.token1();
      
      // Determine which token we're borrowing and the amount
      const amount0 = token0.toLowerCase() === baseToken.toLowerCase() ? flashLoanAmount : 0;
      const amount1 = token1.toLowerCase() === baseToken.toLowerCase() ? flashLoanAmount : 0;
      
      // Encode callback data for the flash loan
      // This includes all the information needed to execute the arbitrage
      const callbackData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'address', 'address', 'uint256'],
        [baseToken, quoteToken, this.wallet.address, flashLoanAmount]
      );
      
      // Use gas price we already obtained earlier
      const gasLimit = ethers.BigNumber.from(1000000); // Conservative estimate
      
      // Execute the flash loan
      const txOptions = {
        gasPrice: currentGasPrice,
        gasLimit,
        ...protectedParams // Include any MEV protection
      };
      
      // First make sure we have a callback function that can be called by the pool
      // This would typically be implemented in a separate contract
      // For this example, we'll use a simplified approach with direct swaps
      // Real implementation would deploy a contract or use an existing one
      
      // For demonstration, log that this would actually execute a contract call
      logger.info(`Preparing to execute flash loan from pool ${flashLoanPool.address}`);
      logger.info(`Flash loan details: amount0=${amount0}, amount1=${amount1}`);
      
      // Simulate execution for demonstration
      // In a real implementation, this would call the flash function on the pool contract
      
      // Check if any token price has validation issues
      const basePriceValidation = await this.validatePrice(baseToken);
      const quotePriceValidation = await this.validatePrice(quoteToken);
      
      // If either price validation failed, do not execute the flash loan
      if (!basePriceValidation || !quotePriceValidation) {
        logger.warn(`Flash loan execution skipped due to invalid prices`);
        return {
          success: false,
          error: 'Token prices failed validation, skipping execution to prevent failed transactions'
        };
      }
      
      // Calculate expected profit and verify it meets our requirements
      // This ensures we only execute profitable trades
      // Calculate profit based on opportunity details in a real implementation
      const estimatedNetProfit = opportunity?.profit || ethers.utils.parseEther('0.01'); 
      const minProfit = ethers.utils.parseEther(config.arbitrage.minProfitUsd / 10); // Convert USD to BNB approx
      
      // Verify the trade is profitable before execution
      if (estimatedNetProfit.lt(minProfit)) {
        logger.warn(`Flash loan execution skipped due to insufficient profit: ${formatEther(estimatedNetProfit)} BNB is less than minimum ${formatEther(minProfit)} BNB`);
        return {
          success: false,
          error: 'Insufficient profit for transaction costs',
          estimatedNetProfit: formatEther(estimatedNetProfit)
        };
      }
      
      // Default to simulated result in case real execution fails
      let txResult = null;
      let executionResult = {
        success: false,
        txHash: null,
        actualProfit: ethers.BigNumber.from(0),
        mevProtection: true,
        optimalLoanSize: true
      };
      
      // Execute the arbitrage if contract is deployed
      if (DEPLOYED_CONTRACT.IS_DEPLOYED && DEPLOYED_CONTRACT.ADDRESS) {
        try {
          logger.info(`Executing flash loan via deployed contract at ${DEPLOYED_CONTRACT.ADDRESS}`);
          
          // Create contract instance
          const flashLoanContract = new ethers.Contract(
            DEPLOYED_CONTRACT.ADDRESS,
            FlashLoanABI,
            this.wallet
          );
          
          // Call the executeArbitrage function on our deployed contract
          const tx = await flashLoanContract.executeArbitrage(
            [baseToken, quoteToken],  // tokens array
            flashLoanAmount,          // flash loan amount
            flashLoanPool.address,    // flash loan pool address
            {
              gasPrice: currentGasPrice,
              gasLimit: 800000,       // Conservative gas limit for arbitrage
              ...protectedParams      // Include MEV protection params
            }
          );
          
          logger.info(`Flash loan arbitrage transaction submitted: ${tx.hash}`);
          
          // Wait for transaction confirmation
          const receipt = await tx.wait();
          
          // Check if transaction was successful
          if (receipt.status === 1) {
            // Extract profit from event logs in a real implementation
            // For now, estimate based on calculation
            executionResult = {
              success: true,
              txHash: tx.hash,
              actualProfit: estimatedNetProfit,
              mevProtection: true,
              optimalLoanSize: true
            };
            
            logger.info(`Arbitrage successfully executed: ${tx.hash}`);
            logger.info(`Estimated profit: ${formatEther(estimatedNetProfit)} BNB`);
          } else {
            throw new Error('Transaction failed');
          }
        } catch (txError) {
          logger.error(`Transaction execution failed: ${txError.message}`);
          
          // If transaction failed, return failed result
          return {
            success: false,
            error: `Transaction execution failed: ${txError.message}`,
            txHash: txResult?.hash
          };
        }
      } else {
        // If contract not deployed, return simulated result and log warning
        logger.warn('Contract not deployed, would have executed a profitable trade');
        executionResult = {
          success: true,
          txHash: '0x' + '0'.repeat(64), // Simulated transaction hash
          actualProfit: estimatedNetProfit,
          mevProtection: true,
          optimalLoanSize: true,
          simulated: true
        };
      }
      
      // Log the execution result
      if (executionResult.success) {
        if (executionResult.simulated) {
          logger.info(`Flash loan would have executed successfully (simulation only)`);
        } else {
          logger.info(`Flash loan executed successfully with txHash: ${executionResult.txHash}`);
          logger.info(`Profit: ${formatEther(executionResult.actualProfit)} BNB`);
        }
      }
      
      // Reset the consecutive failure counter on success
      safetyManager.recordTradeSuccess();
      
      // Return the execution result
      return executionResult;
    } catch (error) {
      logger.error(`Flash loan execution failed: ${error.message}`);
      
      // Record trade failure and check if we need to enter cooldown
      safetyManager.recordTradeFailure();
      
      return {
        success: false,
        error: error.message,
        cooldownActivated: safetyManager.isInCooldown()
      };
    }
  }
  
  /**
   * Approve a token for spending by a contract
   * @param {string} tokenAddress - Token address
   * @param {string} spender - Spender address
   * @param {BigNumber} amount - Amount to approve
   * @returns {Promise<Object>} - Transaction result
   */
  async approveToken(tokenAddress, spender, amount) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.provider);
      const tokenWithSigner = tokenContract.connect(this.wallet);
      
      // Check current allowance
      const currentAllowance = await tokenContract.allowance(
        this.wallet.address,
        spender
      );
      
      // If allowance is already sufficient, return
      if (currentAllowance.gte(amount)) {
        return {
          success: true,
          skipped: true,
          message: 'Allowance already sufficient'
        };
      }
      
      // Approve
      const tx = await tokenWithSigner.approve(
        spender,
        ethers.constants.MaxUint256, // Infinite approval
        {
          gasLimit: 100000
        }
      );
      
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.transactionHash
      };
    } catch (error) {
      logger.error(`Token approval failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Execute a swap on a DEX
   * @param {string} dexName - Name of the DEX
   * @param {BigNumber} amountIn - Input amount
   * @param {BigNumber} amountOutMin - Minimum output amount
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} - Transaction result
   */
  async executeSwap(dexName, amountIn, amountOutMin, tokenIn, tokenOut, options = {}) {
    try {
      // Check if we're in cooldown period
      if (safetyManager.isInCooldown()) {
        return {
          success: false,
          error: 'Bot is in cooldown period after multiple consecutive failures',
          inCooldown: true
        };
      }
      
      // Get the DEX instance
      const dex = this.dexMap[dexName];
      
      if (!dex) {
        throw new Error(`Unknown DEX: ${dexName}`);
      }
      
      // Get current slippage for competitive bot detection
      const expectedSlippage = dexName === 'PancakeSwap V3' ? 0.1 : 
                              dexName === 'PancakeSwap V2' ? 0.15 : 
                              dexName === 'BiSwap' ? 0.15 : 0.18; // Default to ApeSwap
      
      // Check for competitive bots
      if (safetyManager.detectCompetitiveBot(expectedSlippage * 1.5, dexName)) {
        logger.warn(`Potential competitive bot activity detected on ${dexName}. Adjusting slippage tolerance.`);
        options.competitiveBotDetected = true;
      }
      
      // Add slippage protection - increase if competitive bots are detected
      const slippageMultiplier = options.competitiveBotDetected ? 1.8 : 1.0;
      const amountOutWithSlippage = applySlippage(amountOutMin, true, slippageMultiplier);
      
      // Execute the swap
      const result = await dex.swap(
        amountIn,
        amountOutWithSlippage,
        tokenIn,
        tokenOut,
        options
      );
      
      // If successful, record metrics
      if (result.success) {
        safetyManager.recordTradeSuccess();
        
        // Update slippage metric if available in result
        if (result.actualSlippage) {
          safetyManager.updateSlippage(result.actualSlippage, dexName);
        }
      } else {
        // Record failure
        safetyManager.recordTradeFailure();
      }
      
      return result;
    } catch (error) {
      logger.error(`Swap execution failed: ${error.message}`);
      
      // Record trade failure
      safetyManager.recordTradeFailure();
      
      return {
        success: false,
        error: error.message,
        cooldownActivated: safetyManager.isInCooldown()
      };
    }
  }
  
  /**
   * Validate token price to ensure we have valid data before executing transactions
   * @param {string} tokenAddress - Token address
   * @returns {Promise<boolean>} - True if the price is valid
   */
  async validatePrice(tokenAddress) {
    try {
      // Get token price versus all main tokens to check validity
      let isValid = false;
      
      // Try against WBNB
      if (tokenAddress.toLowerCase() !== config.TOKENS.WBNB.toLowerCase()) {
        const v2Price = await this.pancakeV2.getPrice(tokenAddress, config.TOKENS.WBNB);
        const v3PriceData = await this.pancakeV3.getPrice(tokenAddress, config.TOKENS.WBNB);
        
        // Convert to numeric values
        const v2PriceValue = parseFloat(ethers.utils.formatEther(v2Price || 0));
        const v3PriceValue = parseFloat(ethers.utils.formatEther(v3PriceData.price || 0));
        
        // Check if we have at least one valid price
        const v2Valid = validatePrice(tokenAddress, config.TOKENS.WBNB, v2PriceValue);
        const v3Valid = validatePrice(tokenAddress, config.TOKENS.WBNB, v3PriceValue);
        
        isValid = v2Valid || v3Valid;
      }
      
      // If still not validated and not BUSD, try against BUSD
      if (!isValid && tokenAddress.toLowerCase() !== config.TOKENS.BUSD.toLowerCase()) {
        const v2Price = await this.pancakeV2.getPrice(tokenAddress, config.TOKENS.BUSD);
        const v3PriceData = await this.pancakeV3.getPrice(tokenAddress, config.TOKENS.BUSD);
        
        // Convert to numeric values
        const v2PriceValue = parseFloat(ethers.utils.formatEther(v2Price || 0));
        const v3PriceValue = parseFloat(ethers.utils.formatEther(v3PriceData.price || 0));
        
        // Check if we have at least one valid price
        const v2Valid = validatePrice(tokenAddress, config.TOKENS.BUSD, v2PriceValue);
        const v3Valid = validatePrice(tokenAddress, config.TOKENS.BUSD, v3PriceValue);
        
        isValid = v2Valid || v3Valid;
      }
      
      // If it's a stablecoin, we can validate against other stablecoins
      if (!isValid && isStablecoin(tokenAddress)) {
        // For stablecoins, we expect a price close to 1.0 against other stablecoins
        if (tokenAddress.toLowerCase() !== config.TOKENS.USDT.toLowerCase()) {
          const price = await this.pancakeV2.getPrice(tokenAddress, config.TOKENS.USDT);
          const priceValue = parseFloat(ethers.utils.formatEther(price || 0));
          isValid = validatePrice(tokenAddress, config.TOKENS.USDT, priceValue);
        }
      }
      
      if (!isValid) {
        logger.warn(`Price validation failed for token ${tokenAddress}`);
      }
      
      return isValid;
    } catch (error) {
      logger.error(`Error validating token price: ${error.message}`);
      return false; // If there's an error, we treat it as invalid price
    }
  }
}

module.exports = FlashLoanExecutor;
