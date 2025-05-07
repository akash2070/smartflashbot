const { ethers } = require('ethers');
const logger = require('./logger');
const config = require('../config');

/**
 * Utility class for simulating blockchain events in development mode
 */
class BlockchainSimulator {
  constructor() {
    this.blockNumber = 1000000;
    this.pendingTransactions = [];
    this.eventListeners = {
      'pending': [],
      'block': []
    };
    this.simulationInterval = null;
    
    // Transaction template
    this.txTemplate = {
      hash: '',
      from: '',
      to: '',
      nonce: 0,
      gasLimit: ethers.BigNumber.from('300000'),
      gasPrice: ethers.BigNumber.from('5000000000'),
      data: '',
      value: ethers.BigNumber.from('0'),
      chainId: 56,
      confirmations: 0
    };
  }
  
  /**
   * Start the simulation
   */
  start() {
    if (this.simulationInterval) {
      this.stop();
    }
    
    // Simulate new blocks
    this.simulationInterval = setInterval(() => {
      this.blockNumber++;
      
      // Emit block event
      this.emit('block', this.blockNumber);
      
      // Simulate pending transactions
      this.simulatePendingTransactions();
    }, 12000); // ~12 seconds per block on BNB Chain
    
    logger.info('Blockchain simulator started');
  }
  
  /**
   * Stop the simulation
   */
  stop() {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
      logger.info('Blockchain simulator stopped');
    }
  }
  
  /**
   * Add an event listener
   * @param {string} event - Event name
   * @param {Function} listener - Event listener
   */
  on(event, listener) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].push(listener);
    }
  }
  
  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  removeAllListeners(event) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
  }
  
  /**
   * Emit an event
   * @param {string} event - Event name
   * @param {...any} args - Event arguments
   */
  emit(event, ...args) {
    if (this.eventListeners[event]) {
      for (const listener of this.eventListeners[event]) {
        try {
          listener(...args);
        } catch (error) {
          logger.error(`Error in event listener: ${error.message}`);
        }
      }
    }
  }
  
  /**
   * Simulate pending transactions
   */
  simulatePendingTransactions() {
    // Tokens to use for swaps
    const tokens = [
      config.TOKENS.WBNB,
      config.TOKENS.BUSD,
      config.TOKENS.USDT,
      config.TOKENS.CAKE
    ];
    
    // DEX routers to use
    const routers = [
      config.DEX.PANCAKESWAP_V2.ROUTER,
      config.DEX.PANCAKESWAP_V3.ROUTER,
      config.DEX.APESWAP.ROUTER
    ];
    
    // Simulate 0-3 pending transactions
    const txCount = Math.floor(Math.random() * 4);
    
    for (let i = 0; i < txCount; i++) {
      const txType = Math.random() < 0.7 ? 'swap' : 'transfer';
      
      if (txType === 'swap') {
        // Simulate a swap transaction
        this.simulateSwapTransaction(tokens, routers);
      } else {
        // Simulate a token transfer
        this.simulateTransferTransaction(tokens);
      }
    }
  }
  
  /**
   * Simulate a swap transaction
   * @param {Array<string>} tokens - List of token addresses
   * @param {Array<string>} routers - List of router addresses
   */
  simulateSwapTransaction(tokens, routers) {
    // Select random tokens
    const tokenIn = tokens[Math.floor(Math.random() * tokens.length)];
    let tokenOut;
    do {
      tokenOut = tokens[Math.floor(Math.random() * tokens.length)];
    } while (tokenOut === tokenIn);
    
    // Select random router
    const routerAddress = routers[Math.floor(Math.random() * routers.length)];
    
    // Create random wallet address
    const walletAddress = ethers.Wallet.createRandom().address;
    
    // Create swap data
    let data;
    const amountIn = ethers.utils.parseEther((0.1 + Math.random() * 10).toFixed(3));
    
    if (tokenIn === config.TOKENS.WBNB) {
      // swapExactETHForTokens
      data = '0x7ff36ab5' + this.encodeSwapExactETHForTokens(amountIn, tokenOut, walletAddress);
    } else if (tokenOut === config.TOKENS.WBNB) {
      // swapExactTokensForETH
      data = '0x18cbafe5' + this.encodeSwapExactTokensForETH(amountIn, tokenIn, walletAddress);
    } else {
      // swapExactTokensForTokens
      data = '0x38ed1739' + this.encodeSwapExactTokensForTokens(amountIn, tokenIn, tokenOut, walletAddress);
    }
    
    const tx = {
      ...this.txTemplate,
      hash: '0x' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 58),
      from: walletAddress,
      to: routerAddress,
      data,
      nonce: Math.floor(Math.random() * 100),
      gasPrice: ethers.BigNumber.from(Math.floor(3 + Math.random() * 5) + '000000000'), // 3-8 Gwei
    };
    
    // Emit pending transaction
    this.pendingTransactions.push(tx);
    this.emit('pending', tx.hash);
  }
  
  /**
   * Simulate a token transfer transaction
   * @param {Array<string>} tokens - List of token addresses
   */
  simulateTransferTransaction(tokens) {
    // Select random token
    const token = tokens[Math.floor(Math.random() * tokens.length)];
    
    // Create random wallet addresses
    const fromAddress = ethers.Wallet.createRandom().address;
    const toAddress = ethers.Wallet.createRandom().address;
    
    // Create transfer data (ERC20 transfer)
    const amountToTransfer = ethers.utils.parseEther((0.1 + Math.random() * 100).toFixed(3));
    const data = '0xa9059cbb' + this.encodeTransfer(toAddress, amountToTransfer);
    
    const tx = {
      ...this.txTemplate,
      hash: '0x' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 58),
      from: fromAddress,
      to: token,
      data,
      nonce: Math.floor(Math.random() * 100),
      gasPrice: ethers.BigNumber.from(Math.floor(3 + Math.random() * 5) + '000000000'), // 3-8 Gwei
    };
    
    // Emit pending transaction
    this.pendingTransactions.push(tx);
    this.emit('pending', tx.hash);
  }
  
  /**
   * Get a pending transaction by hash
   * @param {string} txHash - Transaction hash
   * @returns {Object|null} - Transaction object or null
   */
  getTransaction(txHash) {
    return this.pendingTransactions.find(tx => tx.hash === txHash) || null;
  }
  
  /**
   * Create fake data for swapExactETHForTokens
   * @param {BigNumber} amountIn - Amount of ETH to swap
   * @param {string} tokenOut - Output token address
   * @param {string} to - Recipient address
   * @returns {string} - Encoded data
   */
  encodeSwapExactETHForTokens(amountIn, tokenOut, to) {
    const amountOutMin = amountIn.mul(990).div(1000); // 1% slippage
    const path = [config.TOKENS.WBNB, tokenOut];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
    
    // We're not actually encoding ABI here, just creating hex-like data for simulation
    return '0000000000000000000000000000000000000000000000000000000000000001'; // Placeholders
  }
  
  /**
   * Create fake data for swapExactTokensForETH
   * @param {BigNumber} amountIn - Amount of tokens to swap
   * @param {string} tokenIn - Input token address
   * @param {string} to - Recipient address
   * @returns {string} - Encoded data
   */
  encodeSwapExactTokensForETH(amountIn, tokenIn, to) {
    const amountOutMin = amountIn.mul(990).div(1000); // 1% slippage
    const path = [tokenIn, config.TOKENS.WBNB];
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
    
    // We're not actually encoding ABI here, just creating hex-like data for simulation
    return '0000000000000000000000000000000000000000000000000000000000000002'; // Placeholders
  }
  
  /**
   * Create fake data for swapExactTokensForTokens
   * @param {BigNumber} amountIn - Amount of tokens to swap
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @param {string} to - Recipient address
   * @returns {string} - Encoded data
   */
  encodeSwapExactTokensForTokens(amountIn, tokenIn, tokenOut, to) {
    const amountOutMin = amountIn.mul(990).div(1000); // 1% slippage
    const path = [tokenIn, config.TOKENS.WBNB, tokenOut]; // Use WBNB as intermediate
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes
    
    // We're not actually encoding ABI here, just creating hex-like data for simulation
    return '0000000000000000000000000000000000000000000000000000000000000003'; // Placeholders
  }
  
  /**
   * Create fake data for ERC20 transfer
   * @param {string} to - Recipient address
   * @param {BigNumber} amount - Amount to transfer
   * @returns {string} - Encoded data
   */
  encodeTransfer(to, amount) {
    // We're not actually encoding ABI here, just creating hex-like data for simulation
    return '0000000000000000000000000000000000000000000000000000000000000004'; // Placeholders
  }
}

// Export a singleton instance
const simulator = new BlockchainSimulator();

module.exports = simulator;