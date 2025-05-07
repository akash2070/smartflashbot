const { ethers } = require('ethers');
const { getDeadline, applySlippage } = require('../utils/helpers');
const config = require('../config');
const logger = require('../utils/logger');

// ABIs
const RouterABI = require('../abis/PancakeV2Router.json');
const FactoryABI = require('../abis/PancakeV2Factory.json');
const PairABI = require('../abis/PancakeV2Pair.json');
const ERC20ABI = require('../abis/ERC20.json');

class PancakeswapV2 {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.name = 'PancakeSwap V2';
    
    // Initialize contracts
    this.routerAddress = config.DEX.PANCAKESWAP_V2.ROUTER;
    this.factoryAddress = config.DEX.PANCAKESWAP_V2.FACTORY;
    
    this.router = new ethers.Contract(
      this.routerAddress,
      RouterABI,
      this.provider
    );
    
    this.factory = new ethers.Contract(
      this.factoryAddress,
      FactoryABI,
      this.provider
    );
    
    this.routerWithSigner = this.router.connect(this.wallet);
  }
  
  /**
   * Get the pair address for two tokens
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<string>} - Pair address
   */
  async getPairAddress(tokenA, tokenB) {
    try {
      return await this.factory.getPair(tokenA, tokenB);
    } catch (error) {
      logger.error(`Error getting pair address: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get reserves for a token pair
   * @param {string} pairAddress - Pair contract address
   * @returns {Promise<{reserve0: BigNumber, reserve1: BigNumber}>} - Reserves
   */
  async getReserves(pairAddress) {
    try {
      const pair = new ethers.Contract(pairAddress, PairABI, this.provider);
      const reserves = await pair.getReserves();
      
      return {
        reserve0: reserves._reserve0,
        reserve1: reserves._reserve1
      };
    } catch (error) {
      logger.error(`Error getting reserves: ${error.message}`);
      throw error;
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
      const pair = new ethers.Contract(pairAddress, PairABI, this.provider);
      const token0 = await pair.token0();
      const token1 = await pair.token1();
      
      return {
        token0,
        token1
      };
    } catch (error) {
      logger.error(`Error getting token order: ${error.message}`);
      throw error;
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
      const path = [tokenIn, tokenOut];
      const amounts = await this.router.getAmountsOut(amountIn, path);
      return amounts[1];
    } catch (error) {
      logger.error(`Error getting amount out: ${error.message}`);
      throw error;
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
      // Check if we need to approve the router first
      if (tokenIn !== config.TOKENS.WBNB) {
        const tokenContract = new ethers.Contract(tokenIn, ERC20ABI, this.provider);
        const tokenWithSigner = tokenContract.connect(this.wallet);
        
        const allowance = await tokenContract.allowance(
          this.wallet.address,
          this.routerAddress
        );
        
        if (allowance.lt(amountIn)) {
          logger.info(`Approving ${this.name} router to spend ${tokenIn}`);
          const approveTx = await tokenWithSigner.approve(
            this.routerAddress,
            ethers.constants.MaxUint256,
            { gasLimit: options.gasLimit || 100000 }
          );
          await approveTx.wait();
        }
      }
      
      const path = [tokenIn, tokenOut];
      const deadline = getDeadline(20); // 20 minutes from now
      
      // Determine which swap method to use
      let tx;
      if (tokenIn === config.TOKENS.WBNB) {
        // Swap exact ETH for tokens
        const txOptions = {
          ...options,
          value: amountIn
        };
        
        tx = await this.routerWithSigner.swapExactETHForTokens(
          amountOutMin,
          path,
          this.wallet.address,
          deadline,
          txOptions
        );
      } else if (tokenOut === config.TOKENS.WBNB) {
        // Swap exact tokens for ETH
        tx = await this.routerWithSigner.swapExactTokensForETH(
          amountIn,
          amountOutMin,
          path,
          this.wallet.address,
          deadline,
          options
        );
      } else {
        // Swap exact tokens for tokens
        tx = await this.routerWithSigner.swapExactTokensForTokens(
          amountIn,
          amountOutMin,
          path,
          this.wallet.address,
          deadline,
          options
        );
      }
      
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString()
      };
    } catch (error) {
      logger.error(`Swap failed: ${error.message}`);
      return {
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
        throw new Error(`No pair exists for ${tokenA}/${tokenB}`);
      }
      
      const { reserve0, reserve1 } = await this.getReserves(pairAddress);
      const { token0 } = await this.getTokenOrder(pairAddress, tokenA, tokenB);
      
      // Calculate price based on token order
      if (token0 === tokenA) {
        return reserve1.mul(ethers.BigNumber.from(10).pow(18)).div(reserve0);
      } else {
        return reserve0.mul(ethers.BigNumber.from(10).pow(18)).div(reserve1);
      }
    } catch (error) {
      logger.error(`Error getting price: ${error.message}`);
      throw error;
    }
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
        return {
          exists: false,
          liquidity: ethers.BigNumber.from(0),
          reserveA: ethers.BigNumber.from(0),
          reserveB: ethers.BigNumber.from(0)
        };
      }
      
      const pair = new ethers.Contract(pairAddress, PairABI, this.provider);
      const reserves = await pair.getReserves();
      const { token0 } = await this.getTokenOrder(pairAddress, tokenA, tokenB);
      
      // Determine which reserve belongs to which token
      let reserveA, reserveB;
      if (token0 === tokenA) {
        reserveA = reserves._reserve0;
        reserveB = reserves._reserve1;
      } else {
        reserveA = reserves._reserve1;
        reserveB = reserves._reserve0;
      }
      
      // Get total liquidity
      const totalSupply = await pair.totalSupply();
      
      return {
        exists: true,
        pairAddress,
        reserveA,
        reserveB,
        totalSupply
      };
    } catch (error) {
      logger.error(`Error getting liquidity: ${error.message}`);
      throw error;
    }
  }
}

module.exports = PancakeswapV2;
