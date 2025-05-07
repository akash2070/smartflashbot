const { ethers } = require('ethers');
const logger = require('../utils/logger');
const config = require('../config');
const { formatEther, parseEther } = ethers.utils;

// Import utilities
const { sleep } = require('../utils/helpers');

/**
 * Advanced MEV Strategies class implementing backrunning and sandwiching techniques
 */
class MevStrategies {
  /**
   * Constructor for the MEV strategies
   * @param {Object} provider - Ethers provider
   * @param {Object} wallet - Ethers wallet
   * @param {Object} dexes - Map of DEX instances
   */
  constructor(provider, wallet, dexes, performanceTracker = null) {
    this.provider = provider;
    this.wallet = wallet;
    this.dexes = dexes;
    this.isEnabled = config.MEV.ENABLED;
    this.performanceTracker = performanceTracker;
    
    // Pending transactions being monitored for backrun opportunities
    this.pendingTransactions = [];
    
    // History of successful MEV operations
    this.mevHistory = [];
    
    // Maximum number of blocks to wait for backrun opportunity
    this.maxBackrunBlocks = 2;
    
    // Track latest block number
    this.latestBlockNumber = 0;
    
    // Maximum time to wait for sandwich to complete (in ms)
    this.maxSandwichWaitTime = 30000; // 30 seconds
    
    // Initialize stats to track MEV strategies
    this.stats = {
      backrunsDetected: 0,
      backrunsExecuted: 0,
      sandwichesDetected: 0,
      sandwichesExecuted: 0,
      pendingTransactions: 0,
      totalProfit: ethers.BigNumber.from(0),
      hourlyProfit: ethers.BigNumber.from(0)
    };
    
    logger.info('Advanced MEV strategies initialized');
  }
  
  /**
   * Start monitoring for MEV opportunities
   * @returns {boolean} - Success status
   */
  startMonitoring() {
    if (!this.isEnabled) {
      logger.info('MEV is disabled, not starting advanced strategy monitoring');
      return false;
    }
    
    try {
      // Monitor for new pending transactions
      this.provider.on('pending', async (txHash) => {
        try {
          const tx = await this.provider.getTransaction(txHash);
          if (tx) {
            await this.analyzeTransaction(tx);
          }
        } catch (error) {
          logger.debug(`Error processing pending transaction ${txHash}: ${error.message}`);
        }
      });
      
      // Monitor for new blocks to update state and clean up stale opportunities
      this.provider.on('block', async (blockNumber) => {
        this.latestBlockNumber = blockNumber;
        await this.cleanupStalePendingTransactions(blockNumber);
      });
      
      logger.info('Started monitoring for advanced MEV opportunities');
      return true;
    } catch (error) {
      logger.error(`Failed to start MEV strategy monitoring: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Stop monitoring for MEV opportunities
   */
  stopMonitoring() {
    this.provider.removeAllListeners('pending');
    this.provider.removeAllListeners('block');
    logger.info('Stopped MEV strategy monitoring');
  }
  
  /**
   * Analyze transaction for MEV opportunities
   * @param {Object} transaction - Transaction object
   * @returns {Promise<Object>} - Analysis results
   */
  async analyzeTransaction(transaction) {
    if (!transaction || !transaction.data) return null;
    
    try {
      // Get transaction details
      const txData = transaction.data;
      const txFrom = transaction.from.toLowerCase();
      const txGasPrice = transaction.gasPrice;
      const txNonce = transaction.nonce;
      
      // Check if this is a swap transaction on a DEX we're monitoring
      const swapInfo = await this.identifySwapTransaction(transaction);
      
      if (swapInfo) {
        // Found a swap, analyze for backrunning or sandwiching
        logger.debug(`Identified swap transaction ${transaction.hash} from ${txFrom}`);
        
        // Prevent processing our own transactions
        if (txFrom === this.wallet.address.toLowerCase()) {
          logger.debug(`Skipping our own transaction ${transaction.hash}`);
          return null;
        }
        
        // Add to pending transactions for backrunning
        this.pendingTransactions.push({
          hash: transaction.hash,
          from: txFrom,
          gasPrice: txGasPrice,
          nonce: txNonce,
          blockNumber: this.latestBlockNumber,
          swapInfo,
          timestamp: Date.now()
        });
        
        // Check for sandwich opportunity
        const sandwichOpportunity = await this.analyzeSandwichOpportunity(swapInfo);
        if (sandwichOpportunity && sandwichOpportunity.profitable) {
          logger.info(`Found sandwich opportunity for tx ${transaction.hash}`);
          
          // Increment sandwich detected stats counter
          this.stats.sandwichesDetected++;
          
          // Update performance tracker if available
          if (this.performanceTracker) {
            this.performanceTracker.recordMevStrategy({
              type: 'sandwich_detected',
              transaction: transaction.hash,
              timestamp: new Date().toISOString(),
              profit: ethers.BigNumber.from(0), // No profit until executed
              executed: false
            });
          }
          
          return {
            type: 'sandwich',
            transaction: transaction.hash,
            opportunity: sandwichOpportunity
          };
        }
        
        // Check for backrun opportunity
        const backrunOpportunity = await this.analyzeBackrunOpportunity(swapInfo);
        if (backrunOpportunity && backrunOpportunity.profitable) {
          logger.info(`Found backrun opportunity for tx ${transaction.hash}`);
          
          // Increment backrun detected stats counter
          this.stats.backrunsDetected++;
          
          // Update performance tracker if available
          if (this.performanceTracker) {
            this.performanceTracker.recordMevStrategy({
              type: 'backrun_detected',
              transaction: transaction.hash,
              timestamp: new Date().toISOString(),
              profit: ethers.BigNumber.from(0), // No profit until executed
              executed: false
            });
          }
          
          return {
            type: 'backrun',
            transaction: transaction.hash,
            opportunity: backrunOpportunity
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error analyzing transaction for MEV: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Identify swap transactions for MEV opportunities
   * @param {Object} transaction - Transaction object
   * @returns {Promise<Object>} - Swap details if identified
   */
  async identifySwapTransaction(transaction) {
    const txData = transaction.data;
    
    // Common function signatures for swaps
    const swapSignatures = {
      // PancakeSwap/Uniswap V2 style routers
      swapExactETHForTokens: '0x7ff36ab5',
      swapExactTokensForETH: '0x18cbafe5',
      swapExactTokensForTokens: '0x38ed1739',
      swapETHForExactTokens: '0xfb3bdb41',
      swapTokensForExactTokens: '0x5c11d795',
      
      // PancakeSwap V3 style routers
      exactInputSingle: '0x414bf389', 
      exactOutputSingle: '0xdb3e2198',
      exactInput: '0xc04b8d59',
      exactOutput: '0xf28c0498'
    };
    
    // Check if the transaction matches any swap signature
    const signature = txData.slice(0, 10).toLowerCase();
    let swapType = null;
    
    for (const [name, sig] of Object.entries(swapSignatures)) {
      if (signature === sig.toLowerCase()) {
        swapType = name;
        break;
      }
    }
    
    if (!swapType) return null; // Not a swap transaction
    
    try {
      // Decode the transaction data based on swap type
      let swapInfo = { type: swapType };
      
      // Determine which DEX this transaction is targeting
      const dexInfo = await this.identifyDex(transaction);
      if (!dexInfo) {
        logger.debug(`Could not identify DEX for transaction ${transaction.hash}`);
        return null;
      }
      
      swapInfo.dex = dexInfo.name;
      swapInfo.router = dexInfo.router;
      
      // For V2-style swaps, decode the path, amountIn, amountOutMin, etc.
      if (swapType === 'swapExactTokensForTokens' || swapType === 'swapExactTokensForETH') {
        // Example decoding for swapExactTokensForTokens
        // Function signature: swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline)
        const decodedInput = ethers.utils.defaultAbiCoder.decode(
          ['uint256', 'uint256', 'address[]', 'address', 'uint256'],
          ethers.utils.hexDataSlice(txData, 4) // Remove function signature
        );
        
        swapInfo.amountIn = decodedInput[0];
        swapInfo.amountOutMin = decodedInput[1];
        swapInfo.path = decodedInput[2];
        swapInfo.to = decodedInput[3];
        swapInfo.deadline = decodedInput[4];
        
        // Extract tokens from path
        swapInfo.tokenIn = decodedInput[2][0];
        swapInfo.tokenOut = decodedInput[2][decodedInput[2].length - 1];
      } 
      // For V3-style swaps, decode differently
      else if (swapType === 'exactInputSingle') {
        // Example decoding for exactInputSingle
        // struct ExactInputSingleParams {
        //   address tokenIn;
        //   address tokenOut;
        //   uint24 fee;
        //   address recipient;
        //   uint256 deadline;
        //   uint256 amountIn;
        //   uint256 amountOutMinimum;
        //   uint160 sqrtPriceLimitX96;
        // }
        const decodedInput = ethers.utils.defaultAbiCoder.decode(
          ['(address,address,uint24,address,uint256,uint256,uint256,uint160)'],
          ethers.utils.hexDataSlice(txData, 4)
        );
        
        const params = decodedInput[0];
        swapInfo.tokenIn = params[0];
        swapInfo.tokenOut = params[1];
        swapInfo.fee = params[2];
        swapInfo.recipient = params[3];
        swapInfo.deadline = params[4];
        swapInfo.amountIn = params[5];
        swapInfo.amountOutMin = params[6];
      }
      // Add more swap type decoders as needed
      
      // For simulation purposes, if we can't fully decode, add minimal info
      if (!swapInfo.tokenIn || !swapInfo.tokenOut) {
        logger.debug(`Could not fully decode swap parameters for ${transaction.hash}`);
        swapInfo.simulatedTokenIn = config.TOKENS.WBNB;
        swapInfo.simulatedTokenOut = config.TOKENS.BUSD;
        swapInfo.simulatedAmountIn = ethers.utils.parseEther('1');
      }
      
      return swapInfo;
    } catch (error) {
      logger.error(`Error decoding swap transaction: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Identify which DEX a transaction is targeting
   * @param {Object} transaction - Transaction object
   * @returns {Promise<Object>} - DEX information
   */
  async identifyDex(transaction) {
    const to = transaction.to.toLowerCase();
    
    // Check if the transaction is to a known router
    if (to === config.DEX.PANCAKESWAP_V2.ROUTER.toLowerCase()) {
      return { name: 'PancakeSwap V2', router: config.DEX.PANCAKESWAP_V2.ROUTER };
    }
    
    if (to === config.DEX.PANCAKESWAP_V3.ROUTER.toLowerCase()) {
      return { name: 'PancakeSwap V3', router: config.DEX.PANCAKESWAP_V3.ROUTER };
    }
    
    if (to === config.DEX.APESWAP.ROUTER.toLowerCase()) {
      return { name: 'ApeSwap', router: config.DEX.APESWAP.ROUTER };
    }
    
    // Not a known DEX
    return null;
  }
  
  /**
   * Analyze potential backrun opportunity from a swap
   * @param {Object} swapInfo - Information about the swap transaction
   * @returns {Promise<Object>} - Backrun opportunity details
   */
  async analyzeBackrunOpportunity(swapInfo) {
    try {
      // To find a backrun opportunity, we need to:
      // 1. Calculate how the pending swap will affect token prices
      // 2. Determine if there's a profitable arbitrage path after the swap
      
      // For simulation in dev mode, create a synthetic opportunity
      if (config.ENVIRONMENT.DEV_MODE) {
        // Use the DEX instances to calculate simulated price impact
        const tokenIn = swapInfo.tokenIn || swapInfo.simulatedTokenIn;
        const tokenOut = swapInfo.tokenOut || swapInfo.simulatedTokenOut;
        const amountIn = swapInfo.amountIn || swapInfo.simulatedAmountIn;
        
        // Simulate price change due to swap
        const priceImpact = this.simulatePriceImpact(swapInfo.dex, tokenIn, tokenOut, amountIn);
        
        // Find arbitrage path after the swap
        const arbitragePath = await this.findPostSwapArbitragePath(tokenIn, tokenOut, priceImpact);
        
        if (arbitragePath && arbitragePath.profit.gt(0)) {
          return {
            profitable: true,
            estimatedProfit: arbitragePath.profit,
            strategy: 'backrun',
            tokenIn: arbitragePath.tokenIn,
            tokenOut: arbitragePath.tokenOut,
            path: arbitragePath.path,
            amountIn: arbitragePath.amountIn,
            expectedAmountOut: arbitragePath.amountOut,
            confidence: arbitragePath.confidence,
            originalSwap: {
              dex: swapInfo.dex,
              tokenIn,
              tokenOut,
              amountIn
            }
          };
        }
      }
      
      return { profitable: false };
    } catch (error) {
      logger.error(`Error analyzing backrun opportunity: ${error.message}`);
      return { profitable: false, error: error.message };
    }
  }
  
  /**
   * Analyze potential sandwich opportunity from a swap
   * @param {Object} swapInfo - Information about the swap transaction
   * @returns {Promise<Object>} - Sandwich opportunity details
   */
  async analyzeSandwichOpportunity(swapInfo) {
    try {
      // To find a sandwich opportunity, we need to:
      // 1. Calculate how front-running with our own swap would affect prices
      // 2. Estimate how the target swap would execute after our front-run
      // 3. Determine if we can backrun with a profitable swap to complete the sandwich
      
      // For simulation in dev mode, create a synthetic opportunity
      if (config.ENVIRONMENT.DEV_MODE) {
        // Get token details from swap info
        const tokenIn = swapInfo.tokenIn || swapInfo.simulatedTokenIn;
        const tokenOut = swapInfo.tokenOut || swapInfo.simulatedTokenOut;
        const victimAmountIn = swapInfo.amountIn || swapInfo.simulatedAmountIn;
        
        // Calculate optimal front-run amount (typically a fraction of the victim's swap amount)
        const frontRunAmount = victimAmountIn.div(5); // 20% of victim's amount
        
        // Simulate price impact of our front-run
        const frontRunImpact = this.simulatePriceImpact(swapInfo.dex, tokenIn, tokenOut, frontRunAmount);
        
        // Simulate victim's slippage after our front-run
        const victimSlippage = this.simulateVictimSlippage(swapInfo, frontRunImpact);
        
        // Calculate optimal backrun amount
        const backRunAmount = frontRunAmount.mul(11).div(10); // 110% of front-run amount
        
        // Simulate price after victim's transaction
        const postVictimPriceImpact = this.simulatePriceImpact(
          swapInfo.dex, 
          tokenOut, 
          tokenIn, 
          victimAmountIn.mul(frontRunImpact.priceMultiplier).div(ethers.utils.parseEther('1'))
        );
        
        // Calculate profit from the sandwich (front-run + back-run - costs)
        const frontRunTokensOut = frontRunAmount.mul(frontRunImpact.priceMultiplier).div(ethers.utils.parseEther('1'));
        const backRunTokensOut = backRunAmount.mul(postVictimPriceImpact.priceMultiplier).div(ethers.utils.parseEther('1'));
        
        // Calculate net profit (accounting for fees)
        const dexFeePercent = 0.003; // 0.3% fee
        const frontRunFee = frontRunTokensOut.mul(Math.floor(dexFeePercent * 10000)).div(10000);
        const backRunFee = backRunTokensOut.mul(Math.floor(dexFeePercent * 10000)).div(10000);
        
        const totalTokensOut = backRunTokensOut.sub(frontRunFee).sub(backRunFee);
        const profit = totalTokensOut.sub(frontRunAmount);
        
        // Estimate gas costs
        const gasPrice = await this.provider.getGasPrice();
        const estimatedGasCost = gasPrice.mul(500000); // Sandwich typically uses ~500k gas
        const gasCostInTokens = this.convertGasCostToTokens(estimatedGasCost, tokenIn);
        
        const netProfit = profit.sub(gasCostInTokens);
        
        // Check if sandwiching would be profitable
        if (netProfit.gt(0) && victimSlippage.impactPercent > 0.5) {
          // Only sandwich if we can significantly impact victim's slippage (0.5%)
          return {
            profitable: true,
            estimatedProfit: netProfit,
            strategy: 'sandwich',
            frontRun: {
              tokenIn,
              tokenOut,
              amountIn: frontRunAmount,
              expectedAmountOut: frontRunTokensOut
            },
            backRun: {
              tokenIn: tokenOut,
              tokenOut: tokenIn,
              amountIn: backRunAmount,
              expectedAmountOut: backRunTokensOut
            },
            victimImpact: {
              slippagePercent: victimSlippage.impactPercent,
              originalOutput: victimSlippage.originalOutput,
              reducedOutput: victimSlippage.reducedOutput
            },
            gasEstimate: estimatedGasCost,
            confidence: 0.8, // Confidence score
            originalSwap: {
              dex: swapInfo.dex,
              tokenIn,
              tokenOut,
              amountIn: victimAmountIn
            }
          };
        }
      }
      
      return { profitable: false };
    } catch (error) {
      logger.error(`Error analyzing sandwich opportunity: ${error.message}`);
      return { profitable: false, error: error.message };
    }
  }
  
  /**
   * Simulate price impact from a swap
   * @param {string} dex - DEX name
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @param {BigNumber} amountIn - Input amount
   * @returns {Object} - Price impact details
   */
  simulatePriceImpact(dex, tokenIn, tokenOut, amountIn) {
    // In production, this would query the DEX contracts to calculate the exact impact
    // For simulation, we'll use a simplified model
    
    // Simulate non-linear slippage based on input size
    // Small swaps: ~0.3-0.5% impact
    // Medium swaps: ~1-3% impact
    // Large swaps: ~3-10% impact
    
    // Convert amount to ETH equivalent for universal sizing
    let amountInEth;
    if (tokenIn === config.TOKENS.WBNB) {
      amountInEth = amountIn;
    } else if (tokenIn === config.TOKENS.BUSD || tokenIn === config.TOKENS.USDT) {
      // Rough price conversion
      amountInEth = amountIn.div(330);
    } else {
      // Default for unknown tokens
      amountInEth = amountIn.div(100);
    }
    
    // Classify swap size
    const smallSwap = ethers.utils.parseEther('0.1');
    const mediumSwap = ethers.utils.parseEther('1');
    const largeSwap = ethers.utils.parseEther('10');
    
    let impactPercent;
    
    if (amountInEth.lt(smallSwap)) {
      // Small swap: 0.3-0.5%
      impactPercent = 0.3 + (Math.random() * 0.2);
    } else if (amountInEth.lt(mediumSwap)) {
      // Medium swap: 1-3%
      impactPercent = 1 + (Math.random() * 2);
    } else if (amountInEth.lt(largeSwap)) {
      // Large swap: 3-10%
      impactPercent = 3 + (Math.random() * 7);
    } else {
      // Very large swap: 10-20%
      impactPercent = 10 + (Math.random() * 10);
    }
    
    // Adjust impact based on DEX (some DEXes have better liquidity)
    if (dex === 'PancakeSwap V3') {
      impactPercent *= 0.8; // 20% less impact due to concentrated liquidity
    } else if (dex === 'ApeSwap') {
      impactPercent *= 1.2; // 20% more impact due to potentially less liquidity
    }
    
    // Convert impact percentage to multiplier (e.g., 2% impact = 0.98 multiplier)
    const impactMultiplier = ethers.utils.parseEther((1 - (impactPercent / 100)).toString());
    
    return {
      dex,
      tokenIn,
      tokenOut,
      amountIn,
      impactPercent,
      priceMultiplier: impactMultiplier
    };
  }
  
  /**
   * Simulate victim's slippage after a front-run
   * @param {Object} swapInfo - Victim's swap information
   * @param {Object} frontRunImpact - Impact from our front-run
   * @returns {Object} - Victim slippage details
   */
  simulateVictimSlippage(swapInfo, frontRunImpact) {
    // Calculate original expected output
    const originalOutput = swapInfo.amountIn || swapInfo.simulatedAmountIn;
    
    // Calculate reduced output due to our front-run
    const reducedOutput = originalOutput.mul(frontRunImpact.priceMultiplier).div(ethers.utils.parseEther('1'));
    
    // Calculate impact percentage
    const impactAmount = originalOutput.sub(reducedOutput);
    const impactPercent = parseFloat(ethers.utils.formatEther(impactAmount.mul(10000).div(originalOutput))) / 100;
    
    return {
      originalOutput,
      reducedOutput,
      impactAmount,
      impactPercent
    };
  }
  
  /**
   * Find arbitrage path after a swap has affected prices
   * @param {string} tokenIn - Input token from original swap
   * @param {string} tokenOut - Output token from original swap
   * @param {Object} priceImpact - Price impact details
   * @returns {Promise<Object>} - Arbitrage path if found
   */
  async findPostSwapArbitragePath(tokenIn, tokenOut, priceImpact) {
    try {
      // In production, this would:
      // 1. Check prices across different DEXes after simulating the swap
      // 2. Find the most profitable arbitrage route
      
      // For simulation, create synthetic arbitrage path
      if (config.ENVIRONMENT.DEV_MODE) {
        // After a swap, prices should be imbalanced between DEXes
        const sourceDex = priceImpact.dex;
        let targetDex;
        
        // Choose a different DEX for the arbitrage
        if (sourceDex === 'PancakeSwap V2') {
          targetDex = Math.random() > 0.5 ? 'PancakeSwap V3' : 'ApeSwap';
        } else if (sourceDex === 'PancakeSwap V3') {
          targetDex = Math.random() > 0.5 ? 'PancakeSwap V2' : 'ApeSwap';
        } else {
          targetDex = Math.random() > 0.5 ? 'PancakeSwap V2' : 'PancakeSwap V3';
        }
        
        // Calculate synthetic profit potential (0.1-1% of the trade size)
        const profitPercent = 0.1 + (Math.random() * 0.9);
        const tradeSize = ethers.utils.parseEther('1'); // 1 BNB equivalent
        const profit = tradeSize.mul(Math.floor(profitPercent * 100)).div(10000);
        
        // 60% chance of finding a profitable opportunity
        const isProfitable = Math.random() < 0.6;
        
        if (isProfitable) {
          return {
            profit: profit,
            path: [
              {
                dex: sourceDex,
                tokenIn: tokenOut, // Swap direction is reversed for arbitrage
                tokenOut: tokenIn,
                amountIn: tradeSize
              },
              {
                dex: targetDex,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: tradeSize.add(profit)
              }
            ],
            tokenIn: tokenOut,
            tokenOut: tokenIn,
            amountIn: tradeSize,
            amountOut: tradeSize.add(profit),
            confidence: 0.7 + (Math.random() * 0.3) // 70-100% confidence
          };
        }
      }
      
      return null; // No profitable arbitrage found
    } catch (error) {
      logger.error(`Error finding post-swap arbitrage path: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Clean up stale pending transactions
   * @param {number} currentBlockNumber - Current block number
   */
  async cleanupStalePendingTransactions(currentBlockNumber) {
    // Remove transactions that are too old (more than maxBackrunBlocks)
    this.pendingTransactions = this.pendingTransactions.filter(tx => {
      return currentBlockNumber - tx.blockNumber <= this.maxBackrunBlocks;
    });
  }
  
  /**
   * Convert gas cost to token equivalent
   * @param {BigNumber} gasCost - Gas cost in wei
   * @param {string} token - Token address
   * @returns {BigNumber} - Gas cost in token units
   */
  convertGasCostToTokens(gasCost, token) {
    // In production, this would use price oracles
    // For simulation, use rough conversions
    
    if (token === config.TOKENS.WBNB) {
      return gasCost; // Already in BNB
    } else if (token === config.TOKENS.BUSD || token === config.TOKENS.USDT) {
      // Rough BNB/USD price (1 BNB = ~$330)
      return gasCost.mul(330);
    } else if (token === config.TOKENS.CAKE) {
      // Rough BNB/CAKE price (1 BNB = ~180 CAKE)
      return gasCost.mul(180);
    } else {
      // Default conversion
      return gasCost.mul(100);
    }
  }
  
  /**
   * Execute a sandwich attack
   * @param {Object} opportunity - Sandwich opportunity details
   * @returns {Promise<Object>} - Execution result
   */
  async executeSandwich(opportunity) {
    if (!opportunity.profitable || !opportunity.frontRun || !opportunity.backRun) {
      logger.warn('Cannot execute sandwich: invalid opportunity');
      return { success: false, reason: 'Invalid opportunity' };
    }
    
    try {
      if (config.ENVIRONMENT.SIMULATION_ONLY) {
        logger.info('Simulation mode: Would execute sandwich attack');
        logger.info(`Front-run: ${opportunity.frontRun.amountIn} ${opportunity.frontRun.tokenIn} -> ${opportunity.frontRun.tokenOut}`);
        logger.info(`Back-run: ${opportunity.backRun.amountIn} ${opportunity.backRun.tokenIn} -> ${opportunity.backRun.tokenOut}`);
        logger.info(`Estimated profit: ${opportunity.estimatedProfit}`);
        
        // Record in history
        this.mevHistory.push({
          type: 'sandwich',
          timestamp: Date.now(),
          opportunity,
          result: 'simulated',
          profit: opportunity.estimatedProfit
        });
        
        // Increment counter for executed sandwiches
        this.stats.sandwichesExecuted++;
        this.stats.totalProfit = this.stats.totalProfit.add(
          ethers.utils.parseEther(opportunity.estimatedProfit.toString())
        );
        
        // Update performance tracker if available
        if (this.performanceTracker) {
          this.performanceTracker.recordMevStrategy({
            type: 'sandwich',
            transaction: opportunity.victimTx || 'simulated',
            timestamp: new Date().toISOString(),
            profit: ethers.utils.parseEther(opportunity.estimatedProfit.toString()),
            executed: true
          });
        }
        
        return {
          success: true,
          simulated: true,
          profit: opportunity.estimatedProfit
        };
      }
      
      // Production execution of sandwich attack
      if (!config.ENVIRONMENT.SIMULATION_ONLY) {
        logger.info('Production sandwich execution initiated');
        logger.info(`Front-run tx preparation: ${opportunity.frontRun.amountIn} ${opportunity.frontRun.tokenIn} -> ${opportunity.frontRun.tokenOut}`);
        
        try {
          // 1. Execute front-run with high gas price (frontrun the victim's transaction)
          const frontRunParams = {
            tokenIn: opportunity.frontRun.tokenIn,
            tokenOut: opportunity.frontRun.tokenOut,
            amount: opportunity.frontRun.amountIn,
            expectedOutput: opportunity.frontRun.expectedAmountOut,
            slippage: 0.5, // 0.5% slippage for frontrun
            deadline: Math.floor(Date.now() / 1000) + 60 // 1 minute deadline
          };
          
          // Determine appropriate gas price strategy to frontrun the victim transaction
          // We need to pay more gas than the victim's transaction to ensure our tx is mined first
          const victimGasPrice = opportunity.victimTx ? 
            await this.provider.getGasPrice(opportunity.victimTx.hash) : 
            await this.provider.getGasPrice();
          
          // Set higher gas price (20% more than victim tx) to ensure our tx gets mined first
          const frontRunGasPrice = victimGasPrice.mul(120).div(100);
          
          // Get the appropriate DEX for frontrun based on opportunity
          const dexForFrontRun = this.dexes[opportunity.frontRun.dex.toLowerCase()] || 
                                 this.dexes['pancakeswapv2']; // fallback
          
          if (!dexForFrontRun) {
            logger.error(`Could not find DEX for front-run: ${opportunity.frontRun.dex}`);
            return { success: false, reason: 'Invalid DEX for front-run' };
          }
          
          // Prepare the frontrun transaction
          const frontRunTx = await dexForFrontRun.prepareSwapTransaction(
            frontRunParams.tokenIn,
            frontRunParams.tokenOut,
            frontRunParams.amount,
            frontRunParams.slippage,
            frontRunParams.deadline
          );
          
          if (!frontRunTx) {
            logger.error('Failed to prepare front-run transaction');
            return { success: false, reason: 'Front-run transaction preparation failed' };
          }
          
          // Override gas price
          frontRunTx.gasPrice = frontRunGasPrice;
          
          // Send frontrun transaction
          logger.info(`Sending front-run transaction with gas price ${ethers.utils.formatUnits(frontRunGasPrice, 'gwei')} gwei`);
          const frontRunResponse = await this.wallet.sendTransaction(frontRunTx);
          logger.info(`Front-run transaction sent: ${frontRunResponse.hash}`);
          
          // Wait for frontrun transaction to be mined
          logger.info('Waiting for front-run transaction to be mined...');
          const frontRunReceipt = await frontRunResponse.wait(1); // Wait for 1 confirmation
          
          if (frontRunReceipt.status === 0) {
            logger.error('Front-run transaction failed');
            return { success: false, reason: 'Front-run transaction failed on-chain' };
          }
          
          logger.info(`Front-run transaction confirmed in block ${frontRunReceipt.blockNumber}`);
          
          // 2. Wait for victim transaction or timeout
          let victimConfirmed = false;
          let backRunSuccess = false;
          const startTime = Date.now();
          
          // Wait strategy: either the victim tx gets mined or we reach timeout
          while (Date.now() - startTime < this.maxSandwichWaitTime && !victimConfirmed) {
            try {
              // Check if victim transaction was mined
              if (opportunity.victimTx && opportunity.victimTx.hash) {
                const victimReceipt = await this.provider.getTransactionReceipt(opportunity.victimTx.hash);
                if (victimReceipt && victimReceipt.blockNumber > 0) {
                  victimConfirmed = true;
                  logger.info(`Victim transaction confirmed in block ${victimReceipt.blockNumber}`);
                  break;
                }
              }
              
              // If no victim tx hash, we'll wait based on block advancement
              if (!opportunity.victimTx || !opportunity.victimTx.hash) {
                const currentBlock = await this.provider.getBlockNumber();
                if (currentBlock > frontRunReceipt.blockNumber + 1) {
                  // If 2+ blocks have passed since our frontrun, proceed with backrun
                  logger.info(`No specific victim tx to track, proceeding with backrun after ${currentBlock - frontRunReceipt.blockNumber} blocks`);
                  victimConfirmed = true;
                  break;
                }
              }
              
              // Small delay before checking again
              await sleep(1000); // 1 second pause
            } catch (waitError) {
              logger.warn(`Error while waiting for victim transaction: ${waitError.message}`);
              // Continue waiting if there's time left
            }
          }
          
          // 3. Execute back-run transaction
          if (victimConfirmed || Date.now() - startTime >= this.maxSandwichWaitTime) {
            // If victim tx timed out, we still need to execute backrun to complete sandwich
            if (!victimConfirmed) {
              logger.warn('Victim transaction timed out, executing back-run anyway to recover funds');
            }
            
            const backRunParams = {
              tokenIn: opportunity.backRun.tokenIn,
              tokenOut: opportunity.backRun.tokenOut,
              amount: opportunity.backRun.amountIn,
              expectedOutput: opportunity.backRun.expectedAmountOut,
              slippage: 1.0, // 1% slippage for backrun (more tolerant since price may have changed)
              deadline: Math.floor(Date.now() / 1000) + 60 // 1 minute deadline
            };
            
            // Get current gas price for backrun - doesn't need to be as high as frontrun
            const backRunGasPrice = await this.provider.getGasPrice();
            
            // Get appropriate DEX for backrun
            const dexForBackRun = this.dexes[opportunity.backRun.dex.toLowerCase()] || 
                                  this.dexes['pancakeswapv2']; // fallback
            
            if (!dexForBackRun) {
              logger.error(`Could not find DEX for back-run: ${opportunity.backRun.dex}`);
              return { success: false, reason: 'Invalid DEX for back-run', frontRunTxHash: frontRunResponse.hash };
            }
            
            // Prepare the backrun transaction
            const backRunTx = await dexForBackRun.prepareSwapTransaction(
              backRunParams.tokenIn,
              backRunParams.tokenOut,
              backRunParams.amount,
              backRunParams.slippage,
              backRunParams.deadline
            );
            
            if (!backRunTx) {
              logger.error('Failed to prepare back-run transaction');
              return { success: false, reason: 'Back-run transaction preparation failed', frontRunTxHash: frontRunResponse.hash };
            }
            
            // Set gas price for backrun
            backRunTx.gasPrice = backRunGasPrice;
            
            // Send backrun transaction
            logger.info(`Sending back-run transaction with gas price ${ethers.utils.formatUnits(backRunGasPrice, 'gwei')} gwei`);
            const backRunResponse = await this.wallet.sendTransaction(backRunTx);
            logger.info(`Back-run transaction sent: ${backRunResponse.hash}`);
            
            // Wait for backrun transaction to be mined
            logger.info('Waiting for back-run transaction to be mined...');
            const backRunReceipt = await backRunResponse.wait(1); // Wait for 1 confirmation
            
            if (backRunReceipt.status === 0) {
              logger.error('Back-run transaction failed');
              return { success: false, reason: 'Back-run transaction failed on-chain', frontRunTxHash: frontRunResponse.hash };
            }
            
            logger.info(`Back-run transaction confirmed in block ${backRunReceipt.blockNumber}`);
            backRunSuccess = true;
            
            // Record the sandwich in history
            this.mevHistory.push({
              type: 'sandwich',
              timestamp: Date.now(),
              opportunity,
              result: 'executed',
              frontRunTx: frontRunResponse.hash,
              victimTx: opportunity.victimTx ? opportunity.victimTx.hash : 'unknown',
              backRunTx: backRunResponse.hash,
              profitEstimate: opportunity.estimatedProfit
            });
            
            // Update stats
            this.stats.sandwichesExecuted++;
            this.stats.totalProfit = this.stats.totalProfit.add(
              ethers.utils.parseEther(opportunity.estimatedProfit.toString())
            );
            
            // Update performance tracker if available
            if (this.performanceTracker) {
              this.performanceTracker.recordMevStrategy({
                type: 'sandwich_executed',
                frontRunTx: frontRunResponse.hash,
                victimTx: opportunity.victimTx ? opportunity.victimTx.hash : 'unknown',
                backRunTx: backRunResponse.hash,
                timestamp: new Date().toISOString(),
                profit: ethers.utils.parseEther(opportunity.estimatedProfit.toString()),
                executed: true
              });
            }
            
            return {
              success: true,
              sandwichCompleted: backRunSuccess,
              frontRunTxHash: frontRunResponse.hash,
              backRunTxHash: backRunSuccess ? backRunResponse.hash : null,
              victimTxHash: opportunity.victimTx ? opportunity.victimTx.hash : 'unknown',
              profit: opportunity.estimatedProfit
            };
          } else {
            // If we couldn't confirm victim tx and timed out
            logger.warn('Could not confirm victim transaction and timed out');
            return { 
              success: false, 
              reason: 'Victim transaction timeout', 
              frontRunTxHash: frontRunResponse.hash
            };
          }
          
        } catch (error) {
          logger.error(`Error executing sandwich attack: ${error.message}`);
          return { success: false, error: error.message };
        }
      } else {
        logger.warn('Production sandwich execution skipped - simulation only mode');
        return { success: false, reason: 'Simulation only mode' };
      }
    } catch (error) {
      logger.error(`Error executing sandwich: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Execute a backrun
   * @param {Object} opportunity - Backrun opportunity details
   * @returns {Promise<Object>} - Execution result
   */
  async executeBackrun(opportunity) {
    if (!opportunity.profitable) {
      logger.warn('Cannot execute backrun: invalid opportunity');
      return { success: false, reason: 'Invalid opportunity' };
    }
    
    try {
      if (config.ENVIRONMENT.SIMULATION_ONLY) {
        logger.info('Simulation mode: Would execute backrun');
        logger.info(`Path: ${JSON.stringify(opportunity.path)}`);
        logger.info(`Estimated profit: ${opportunity.estimatedProfit}`);
        
        // Record in history
        this.mevHistory.push({
          type: 'backrun',
          timestamp: Date.now(),
          opportunity,
          result: 'simulated',
          profit: opportunity.estimatedProfit
        });
        
        // Increment counter for executed backruns
        this.stats.backrunsExecuted++;
        this.stats.totalProfit = this.stats.totalProfit.add(
          ethers.utils.parseEther(opportunity.estimatedProfit.toString())
        );
        
        // Update performance tracker if available
        if (this.performanceTracker) {
          this.performanceTracker.recordMevStrategy({
            type: 'backrun',
            transaction: opportunity.victimTx || 'simulated',
            timestamp: new Date().toISOString(),
            profit: ethers.utils.parseEther(opportunity.estimatedProfit.toString()), 
            executed: true
          });
        }
        
        return {
          success: true,
          simulated: true,
          profit: opportunity.estimatedProfit
        };
      }
      
      // Production execution of backrun
      if (!config.ENVIRONMENT.SIMULATION_ONLY) {
        logger.info('Production backrun execution initiated');
        logger.info(`Backrun preparation: ${opportunity.tokenIn} to ${opportunity.tokenOut}`);
        
        try {
          // 1. Wait for the target transaction to be mined (if specified)
          let targetTxMined = false;
          let waitTimeout = false;
          const waitStartTime = Date.now();
          const maxWaitTime = 60 * 1000; // 60 seconds max wait time
          
          if (opportunity.originalSwap && opportunity.originalSwap.txHash) {
            logger.info(`Waiting for target transaction ${opportunity.originalSwap.txHash} to be mined...`);
            
            // Wait for the transaction to be mined or timeout
            while (!targetTxMined && !waitTimeout) {
              try {
                // Check if transaction is mined
                const txReceipt = await this.provider.getTransactionReceipt(opportunity.originalSwap.txHash);
                if (txReceipt && txReceipt.blockNumber > 0) {
                  targetTxMined = true;
                  logger.info(`Target transaction mined in block ${txReceipt.blockNumber}`);
                  break;
                }
                
                // Check if we've exceeded wait time
                if (Date.now() - waitStartTime > maxWaitTime) {
                  waitTimeout = true;
                  logger.warn(`Wait timeout exceeded for transaction ${opportunity.originalSwap.txHash}`);
                  break;
                }
                
                // Brief pause before checking again
                await sleep(1000);
              } catch (error) {
                logger.warn(`Error checking transaction receipt: ${error.message}`);
                
                // Check if we've exceeded wait time
                if (Date.now() - waitStartTime > maxWaitTime) {
                  waitTimeout = true;
                  break;
                }
                
                await sleep(1000);
              }
            }
          } else {
            // No specific transaction to wait for
            logger.info('No specific target transaction, executing backrun immediately');
            targetTxMined = true; // Consider it mined to proceed
          }
          
          // 2. Execute our backrun transaction
          if (targetTxMined || waitTimeout) {
            // If we timed out waiting, proceed anyway but with higher slippage tolerance
            const slippageTolerance = waitTimeout ? 1.5 : 0.8; // 1.5% if timed out, 0.8% if target is mined
            
            // Prepare transaction parameters
            const backRunParams = {
              tokenIn: opportunity.tokenIn,
              tokenOut: opportunity.tokenOut,
              amount: opportunity.amountIn,
              expectedOutput: opportunity.expectedAmountOut,
              slippage: slippageTolerance,
              deadline: Math.floor(Date.now() / 1000) + 60 // 1 minute deadline
            };
            
            // Get appropriate DEX for the backrun
            const dexName = opportunity.dex || opportunity.path[0]?.dex || 'pancakeswapv2';
            const dex = this.dexes[dexName.toLowerCase()] || this.dexes['pancakeswapv2']; // fallback
            
            if (!dex) {
              logger.error(`Could not find DEX for backrun: ${dexName}`);
              return { success: false, reason: 'Invalid DEX for backrun' };
            }
            
            // Get current gas price for the backrun
            // Use a slightly higher gas price for faster execution
            const baseGasPrice = await this.provider.getGasPrice();
            const backRunGasPrice = baseGasPrice.mul(110).div(100); // 10% higher than base
            
            // Prepare the transaction
            const backRunTx = await dex.prepareSwapTransaction(
              backRunParams.tokenIn,
              backRunParams.tokenOut,
              backRunParams.amount,
              backRunParams.slippage,
              backRunParams.deadline
            );
            
            if (!backRunTx) {
              logger.error('Failed to prepare backrun transaction');
              return { success: false, reason: 'Backrun transaction preparation failed' };
            }
            
            // Override gas price
            backRunTx.gasPrice = backRunGasPrice;
            
            // Send backrun transaction
            logger.info(`Sending backrun transaction with gas price ${ethers.utils.formatUnits(backRunGasPrice, 'gwei')} gwei`);
            const backRunResponse = await this.wallet.sendTransaction(backRunTx);
            logger.info(`Backrun transaction sent: ${backRunResponse.hash}`);
            
            // Wait for backrun transaction to be mined
            logger.info('Waiting for backrun transaction confirmation...');
            const backRunReceipt = await backRunResponse.wait(1); // Wait for 1 confirmation
            
            if (backRunReceipt.status === 0) {
              logger.error('Backrun transaction failed on-chain');
              return { success: false, reason: 'Backrun transaction failed on-chain' };
            }
            
            logger.info(`Backrun transaction confirmed in block ${backRunReceipt.blockNumber}`);
            
            // Record successful backrun in history
            this.mevHistory.push({
              type: 'backrun',
              timestamp: Date.now(),
              opportunity,
              result: 'executed',
              targetTx: opportunity.originalSwap?.txHash || 'unknown',
              backRunTx: backRunResponse.hash,
              profitEstimate: opportunity.estimatedProfit
            });
            
            // Update stats
            this.stats.backrunsExecuted++;
            this.stats.totalProfit = this.stats.totalProfit.add(
              ethers.utils.parseEther(opportunity.estimatedProfit.toString())
            );
            
            // Update performance tracker
            if (this.performanceTracker) {
              this.performanceTracker.recordMevStrategy({
                type: 'backrun_executed',
                transaction: opportunity.originalSwap?.txHash || 'unknown',
                backRunTx: backRunResponse.hash,
                timestamp: new Date().toISOString(),
                profit: ethers.utils.parseEther(opportunity.estimatedProfit.toString()),
                executed: true
              });
            }
            
            return {
              success: true,
              backRunTxHash: backRunResponse.hash,
              targetTxHash: opportunity.originalSwap?.txHash || 'unknown',
              targetMined: targetTxMined,
              profit: opportunity.estimatedProfit
            };
          } else {
            logger.warn('Target transaction not mined and wait time exceeded');
            return { success: false, reason: 'Target transaction not mined within timeout' };
          }
        } catch (error) {
          logger.error(`Error executing backrun: ${error.message}`);
          return { success: false, error: error.message };
        }
      } else {
        logger.warn('Production backrun execution skipped - simulation only mode');
        return { success: false, reason: 'Simulation only mode' };
      }
    } catch (error) {
      logger.error(`Error executing backrun: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get MEV strategy statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    const now = Date.now();
    const lastHour = now - (60 * 60 * 1000);
    const lastDay = now - (24 * 60 * 60 * 1000);
    
    const recentOpportunities = this.mevHistory.filter(entry => entry.timestamp > lastHour);
    const dailyOpportunities = this.mevHistory.filter(entry => entry.timestamp > lastDay);
    
    // Use empty BigNumber for initial value and convert any non-BigNumber profit to BigNumber
    const hourlyProfit = recentOpportunities.reduce((sum, entry) => {
      const profit = entry.profit || ethers.BigNumber.from(0);
      return sum.add(profit);
    }, ethers.BigNumber.from(0));
    
    const dailyProfit = dailyOpportunities.reduce((sum, entry) => {
      const profit = entry.profit || ethers.BigNumber.from(0);
      return sum.add(profit);
    }, ethers.BigNumber.from(0));
    
    // Format for dashboard display
    return {
      backrunsDetected: this.stats.backrunsDetected,
      sandwichesDetected: this.stats.sandwichesDetected,
      backrunsExecuted: this.stats.backrunsExecuted,
      sandwichesExecuted: this.stats.sandwichesExecuted,
      hourlyProfit,
      pendingTransactions: this.pendingTransactions.length
    };
  }
}

module.exports = MevStrategies;