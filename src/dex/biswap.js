/**
 * BiSwap DEX Integration
 * Provides methods for interacting with BiSwap on BNB Chain
 */

const { ethers } = require('ethers');
const { BISWAP_CONTRACTS, TOKENS } = require('./constants');
const logger = require('../utils/logger');

// Load ABIs
const BiswapFactoryABI = require('../../attached_assets/biswap_factory_abi.json');
const BiswapRouterABI = require('../../attached_assets/biswap_router_abi (1).json');
const ERC20ABI = require('../abi/erc20.json');
const PairABI = require('../abi/pair.json');

class Biswap {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.factory = new ethers.Contract(
      BISWAP_CONTRACTS.FACTORY,
      BiswapFactoryABI,
      this.provider
    );
    this.router = new ethers.Contract(
      BISWAP_CONTRACTS.ROUTER,
      BiswapRouterABI,
      this.wallet || this.provider
    );

    logger.info(`BiSwap initialized with factory: ${BISWAP_CONTRACTS.FACTORY}, router: ${BISWAP_CONTRACTS.ROUTER}`);
  }
  
  /**
   * Get the pair address for two tokens
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<string>} - Pair address
   */
  async getPairAddress(tokenA, tokenB) {
    try {
      const pairAddress = await this.factory.getPair(tokenA, tokenB);
      return pairAddress;
    } catch (error) {
      logger.error(`Error getting BiSwap pair address: ${error.message}`);
      return ethers.constants.AddressZero;
    }
  }
  
  /**
   * Get reserves for a token pair
   * @param {string} pairAddress - Pair contract address
   * @returns {Promise<{reserve0: BigNumber, reserve1: BigNumber}>} - Reserves
   */
  async getReserves(pairAddress) {
    try {
      const pairContract = new ethers.Contract(pairAddress, PairABI, this.provider);
      const reserves = await pairContract.getReserves();
      return {
        reserve0: reserves[0],
        reserve1: reserves[1]
      };
    } catch (error) {
      logger.error(`Error getting BiSwap reserves: ${error.message}`);
      return {
        reserve0: ethers.BigNumber.from(0),
        reserve1: ethers.BigNumber.from(0)
      };
    }
  }
  
  /**
   * Get token order in the pair
   * @param {string} pairAddress - Pair contract address
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<{token0: string, token1: string}>} - Token order
   */
  async getTokenOrder(pairAddress, tokenA, tokenB) {
    try {
      const pairContract = new ethers.Contract(pairAddress, PairABI, this.provider);
      const token0 = await pairContract.token0();
      const token1 = await pairContract.token1();
      
      if (token0.toLowerCase() === tokenA.toLowerCase()) {
        return { token0: tokenA, token1: tokenB };
      } else {
        return { token0: tokenB, token1: tokenA };
      }
    } catch (error) {
      logger.error(`Error getting BiSwap token order: ${error.message}`);
      return { token0: tokenA, token1: tokenB };
    }
  }
  
  /**
   * Get the amount out for a swap
   * @param {BigNumber} amountIn - Input amount
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @returns {Promise<BigNumber>} - Output amount
   */
  async getAmountOut(amountIn, tokenIn, tokenOut) {
    try {
      const pairAddress = await this.getPairAddress(tokenIn, tokenOut);
      
      if (pairAddress === ethers.constants.AddressZero) {
        logger.warn(`No BiSwap pair exists for ${tokenIn}/${tokenOut}`);
        return ethers.BigNumber.from(0);
      }
      
      const { reserve0, reserve1 } = await this.getReserves(pairAddress);
      const { token0 } = await this.getTokenOrder(pairAddress, tokenIn, tokenOut);
      
      const [reserveIn, reserveOut] = token0.toLowerCase() === tokenIn.toLowerCase()
        ? [reserve0, reserve1]
        : [reserve1, reserve0];
      
      // Use the router to calculate the amount out
      const amountOut = await this.router.getAmountOut(
        amountIn,
        reserveIn,
        reserveOut
      );
      
      return amountOut;
    } catch (error) {
      logger.error(`Error calculating BiSwap amount out: ${error.message}`);
      return ethers.BigNumber.from(0);
    }
  }
  
  /**
   * Execute a swap
   * @param {BigNumber} amountIn - Input amount
   * @param {BigNumber} amountOutMin - Minimum output amount
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} - Transaction result
   */
  async swap(amountIn, amountOutMin, tokenIn, tokenOut, options = {}) {
    try {
      // Need to approve the router to spend tokens if the wallet is connected
      if (this.wallet) {
        const tokenContract = new ethers.Contract(tokenIn, ERC20ABI, this.wallet);
        const allowance = await tokenContract.allowance(
          await this.wallet.getAddress(),
          BISWAP_CONTRACTS.ROUTER
        );
        
        if (allowance.lt(amountIn)) {
          logger.info(`Approving BiSwap router to spend ${ethers.utils.formatEther(amountIn)} of token ${tokenIn}`);
          const approveTx = await tokenContract.approve(
            BISWAP_CONTRACTS.ROUTER,
            ethers.constants.MaxUint256
          );
          await approveTx.wait();
          logger.info(`Approval transaction confirmed: ${approveTx.hash}`);
        }
      }
      
      // Calculate deadline
      const deadline = Math.floor(Date.now() / 1000) + (options.deadlineSeconds || 300);
      
      // Execute the swap
      const path = [tokenIn, tokenOut];
      const to = await this.wallet.getAddress();
      
      const tx = await this.router.swapExactTokensForTokens(
        amountIn,
        amountOutMin,
        path,
        to,
        deadline,
        {
          gasLimit: options.gasLimit || 500000,
          gasPrice: options.gasPrice || ethers.utils.parseUnits('5', 'gwei')
        }
      );
      
      logger.info(`BiSwap swap transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      logger.info(`BiSwap swap transaction confirmed: ${tx.hash}`);
      
      return {
        hash: tx.hash,
        receipt,
        success: receipt.status === 1
      };
    } catch (error) {
      logger.error(`Error executing BiSwap swap: ${error.message}`);
      return {
        hash: null,
        receipt: null,
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get the price of a token pair
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<BigNumber>} - Price ratio
   */
  async getPrice(tokenA, tokenB) {
    try {
      const pairAddress = await this.getPairAddress(tokenA, tokenB);
      
      if (pairAddress === ethers.constants.AddressZero) {
        logger.warn(`No BiSwap pair exists for ${tokenA}/${tokenB}`);
        return ethers.BigNumber.from(0);
      }
      
      const { reserve0, reserve1 } = await this.getReserves(pairAddress);
      const { token0 } = await this.getTokenOrder(pairAddress, tokenA, tokenB);
      
      if (reserve0.isZero() || reserve1.isZero()) {
        logger.warn(`BiSwap zero reserves for pair ${tokenA}/${tokenB}`);
        return ethers.BigNumber.from(0);
      }
      
      // Calculate price based on reserves
      const price = token0.toLowerCase() === tokenA.toLowerCase()
        ? reserve1.mul(ethers.BigNumber.from(10).pow(18)).div(reserve0)
        : reserve0.mul(ethers.BigNumber.from(10).pow(18)).div(reserve1);
      
      // Adjust for token decimals if needed
      // This assumes both tokens have 18 decimals, should be adjusted for tokens with different decimals
      
      return price;
    } catch (error) {
      logger.error(`Error getting BiSwap price: ${error.message}`);
      return ethers.BigNumber.from(0);
    }
  }
  
  /**
   * Get the swap fee percentage
   * @returns {number} - Swap fee as a decimal (e.g., 0.003 for 0.3%)
   */
  getSwapFee() {
    // BiSwap has a 0.2% fee across all pairs, down from 0.3% in many other exchanges
    return 0.002;
  }
  
  /**
   * Get liquidity information for a token pair
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<Object>} - Liquidity info
   */
  async getLiquidity(tokenA, tokenB) {
    try {
      const pairAddress = await this.getPairAddress(tokenA, tokenB);
      
      if (pairAddress === ethers.constants.AddressZero) {
        logger.warn(`No BiSwap pair exists for ${tokenA}/${tokenB}`);
        return {
          exists: false,
          reserveA: ethers.BigNumber.from(0),
          reserveB: ethers.BigNumber.from(0),
          liquidity: ethers.BigNumber.from(0)
        };
      }
      
      const { reserve0, reserve1 } = await this.getReserves(pairAddress);
      const { token0 } = await this.getTokenOrder(pairAddress, tokenA, tokenB);
      
      const [reserveA, reserveB] = token0.toLowerCase() === tokenA.toLowerCase()
        ? [reserve0, reserve1]
        : [reserve1, reserve0];
      
      // Get pair contract to get total supply
      const pairContract = new ethers.Contract(pairAddress, PairABI, this.provider);
      const totalSupply = await pairContract.totalSupply();
      
      return {
        exists: true,
        reserveA,
        reserveB,
        pairAddress,
        totalSupply,
        liquidity: totalSupply
      };
    } catch (error) {
      logger.error(`Error getting BiSwap liquidity: ${error.message}`);
      return {
        exists: false,
        reserveA: ethers.BigNumber.from(0),
        reserveB: ethers.BigNumber.from(0),
        liquidity: ethers.BigNumber.from(0),
        error: error.message
      };
    }
  }
}

module.exports = Biswap;