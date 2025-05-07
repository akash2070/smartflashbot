/**
 * Configuration for the Flash Loan Arbitrage Bot
 */

const crypto = require('crypto');
const config = {
  // Network configuration
  network: {
    rpcUrl: process.env.BNB_RPC_URL_KEY || 'https://bsc-dataseed1.binance.org/',
    chainId: 56, // BNB Chain
    name: 'BNB Chain'
  },
  
  // DEX addresses
  addresses: {
    pancakeswapV2: {
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'
    },
    pancakeswapV3: {
      router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'
    },
    apeswap: {
      router: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
      factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6'
    },
    biswap: {
      router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
      factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE'
    }
  },
  
  // Backward compatibility for references to config.DEX
  get DEX() {
    return {
      PANCAKESWAP_V2: {
        ROUTER: this.addresses.pancakeswapV2.router,
        FACTORY: this.addresses.pancakeswapV2.factory
      },
      PANCAKESWAP_V3: {
        ROUTER: this.addresses.pancakeswapV3.router,
        FACTORY: this.addresses.pancakeswapV3.factory,
        QUOTER: this.addresses.pancakeswapV3.quoter
      },
      APESWAP: {
        ROUTER: this.addresses.apeswap.router,
        FACTORY: this.addresses.apeswap.factory
      }
    };
  },
  
  // Add the BLOCKCHAIN structure for backward compatibility
  get BLOCKCHAIN() {
    return {
      PRIMARY_RPC_URL: process.env.BNB_RPC_URL || 'https://bsc-mainnet.infura.io/v3/e61e6bfe6bbd410a842f58f7a98f5813',
      SECONDARY_RPC_URL: process.env.BNB_RPC_URL_BACKUP1 || 'https://bsc-mainnet.core.chainstack.com/452214f8109f496cc2e3a7c61aeaf3af',
      TERTIARY_RPC_URL: process.env.BNB_RPC_URL_BACKUP2 || 'https://bsc-mainnet.infura.io/v3/540be088222846879dde5408235eadbe',
      
      RPC_URLS: [
        'https://bsc-mainnet.infura.io/v3/e61e6bfe6bbd410a842f58f7a98f5813',
        'https://bsc-mainnet.infura.io/v3/540be088222846879dde5408235eadbe',
        'https://bsc-mainnet.infura.io/v3/d47931b894ba4a6d950a44bfc3fc0309',
        'https://bsc-mainnet.infura.io/v3/9141934ea14f43b98d6025788a72d2b9',
        
        'https://bsc-mainnet.core.chainstack.com/452214f8109f496cc2e3a7c61aeaf3af',
        'https://bsc-mainnet.core.chainstack.com/46b882aaad1fd65c0af996c58019d839',
        'https://bsc-mainnet.core.chainstack.com/821e6d7b0229673dc844ffbb28c8f4ec',
        
        'https://black-damp-model.bsc.quiknode.pro/3050dcae7ae25db594ae3fa5b795ef24ced74c05/',
        
        'https://bsc-dataseed1.binance.org/',
        'https://bsc-dataseed2.binance.org/',
        'https://bsc-dataseed3.binance.org/',
        'https://bsc-dataseed4.binance.org/',
        'https://rpc.ankr.com/bsc/',
      ],
      
      WSS_URLS: {
        PRIMARY: process.env.WEBSOCKET_ENDPOINT_1 || 'wss://bsc-mainnet.infura.io/ws/v3/e61e6bfe6bbd410a842f58f7a98f5813',
        INFURA1: 'wss://bsc-mainnet.infura.io/ws/v3/540be088222846879dde5408235eadbe',
        CHAINSTACK: 'wss://bsc-mainnet.core.chainstack.com/452214f8109f496cc2e3a7c61aeaf3af',
        INFURA2: 'wss://bsc-mainnet.infura.io/ws/v3/d47931b894ba4a6d950a44bfc3fc0309',
        QUIKNODE: 'wss://black-damp-model.bsc.quiknode.pro/3050dcae7ae25db594ae3fa5b795ef24ced74c05/',
        INFURA3: 'wss://bsc-mainnet.infura.io/ws/v3/9141934ea14f43b98d6025788a72d2b9',
        CHAINSTACK2: 'wss://bsc-mainnet.core.chainstack.com/821e6d7b0229673dc844ffbb28c8f4ec'
      },
      
      // Pair-specific RPC configuration
      PAIR_SPECIFIC_RPC: {
        'WBNB_BUSD': {
          rpcUrl: process.env.WBNB_BUSD_RPC_URL || 'https://bsc-mainnet.infura.io/v3/e61e6bfe6bbd410a842f58f7a98f5813',
          backupRpcUrl: process.env.WBNB_BUSD_BACKUP_RPC_URL || 'https://bsc-mainnet.core.chainstack.com/452214f8109f496cc2e3a7c61aeaf3af',
          tokens: [this.tokens.WBNB, this.tokens.BUSD]
        },
        'WBNB_USDT': {
          rpcUrl: process.env.WBNB_USDT_RPC_URL || 'https://bsc-mainnet.infura.io/v3/540be088222846879dde5408235eadbe',
          backupRpcUrl: process.env.WBNB_USDT_BACKUP_RPC_URL || 'https://black-damp-model.bsc.quiknode.pro/3050dcae7ae25db594ae3fa5b795ef24ced74c05/',
          tokens: [this.tokens.WBNB, this.tokens.USDT]
        },
        'CAKE_WBNB': {
          rpcUrl: process.env.CAKE_WBNB_RPC_URL || 'https://bsc-mainnet.infura.io/v3/d47931b894ba4a6d950a44bfc3fc0309',
          backupRpcUrl: process.env.CAKE_WBNB_BACKUP_RPC_URL || 'https://bsc-mainnet.core.chainstack.com/46b882aaad1fd65c0af996c58019d839',
          tokens: [this.tokens.CAKE, this.tokens.WBNB]
        },
        'BUSD_USDT': {
          rpcUrl: process.env.BUSD_USDT_RPC_URL || 'https://bsc-mainnet.infura.io/v3/9141934ea14f43b98d6025788a72d2b9',
          backupRpcUrl: process.env.BUSD_USDT_BACKUP_RPC_URL || 'https://bsc-mainnet.core.chainstack.com/821e6d7b0229673dc844ffbb28c8f4ec',
          tokens: [this.tokens.BUSD, this.tokens.USDT]
        }
      }
    };
  },
  
  // Token addresses
  tokens: {
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'
  },
  
  // Flash loan configuration
  flashLoan: {
    // Fee percentages
    feePercentage: 0.09, // 0.09% PancakeSwap V3 flash loan fee
    maxPriceImpact: 0.5, // Maximum allowed price impact in percentage
    gasLimitMultiplier: 1.2, // Multiply estimated gas by this factor
    maxGasPrice: 5, // Maximum gas price in Gwei
  },
  
  // Arbitrage configuration
  arbitrage: {
    minProfitUsd: 5, // Minimum profit threshold in USD
    minProfitPercentage: 0.15, // Minimum profit percentage
    maxFlashLoanAmount: '50', // Maximum flash loan amount in BNB
    slippageTolerance: 0.5, // Slippage tolerance percentage
    gasEstimateGwei: 5, // Gas price estimate in Gwei
    maxRetries: 3, // Maximum number of retries for failed transactions
  },
  
  // DEX swap fees
  dexFees: {
    pancakeV2: 0.25, // 0.25%
    pancakeV3: {
      'ULTRA_LOWEST': 0.01, // 0.01%
      'LOWEST': 0.05, // 0.05% 
      'LOW': 0.3, // 0.3%
      'MEDIUM': 1.0, // 1.0%
      'HIGH': 5.0 // 5.0%
    },
    apeswap: 0.3, // 0.3%
    biswap: 0.2 // 0.2%
  },
  
  // Maximum slippage caps by DEX
  maxSlippageByDex: {
    pancakeV3: 0.5, // 0.5% 
    biswap: 0.7, // 0.7%
    pancakeV2: 1.0, // 1.0%
    apeswap: 1.2 // 1.2%
  },
  
  // Dashboard configuration
  dashboard: {
    port: process.env.PORT || 5000,
    host: '0.0.0.0',
    sessionSecret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')
  },
  
  // Safety features
  safety: {
    cooldownPeriod: 5 * 60 * 1000, // 5 minute cooldown after multiple failures
    maxConsecutiveFailures: 3, // Number of failures before cooldown
    priceDeviationThreshold: 5, // Percentage threshold for price deviation alerts
    emergencyShutdownEnabled: true, // Enable emergency shutdown
  },
  
  // Monitoring configuration
  monitoring: {
    updateInterval: 10 * 1000, // Update interval in milliseconds
    maxPriceAge: 60 * 1000, // Maximum age of price data in milliseconds
  },
  
  // PancakeSwap V3 fee tiers
  pancakeswapV3FeeTiers: {
    ULTRA_LOWEST: 10, // 0.01%
    LOWEST: 100,      // 0.05%
    LOW: 500,         // 0.3%
    MEDIUM: 2500,     // 1%
    HIGH: 10000       // 5%
  },
  
  // For each token pair, set preferred fee tier
  preferredFeeTiers: {
    'WBNB/BUSD': 100,    // 0.05% fee tier for WBNB/BUSD
    'WBNB/USDT': 100,    // 0.05% fee tier for WBNB/USDT
    'CAKE/WBNB': 500,    // 0.3% fee tier for CAKE/WBNB
    'BUSD/USDT': 10      // 0.01% fee tier for BUSD/USDT
  },
  
  // RPC endpoints for different token pairs
  rpcEndpoints: {
    'WBNB/BUSD': process.env.WBNB_BUSD_RPC_URL || 'https://bsc-mainnet.infura.io/v3/e61e6bfe6bbd410a842f58f7a98f5813',
    'WBNB/USDT': process.env.WBNB_USDT_RPC_URL || 'https://bsc-mainnet.infura.io/v3/540be088222846879dde5408235eadbe',
    'CAKE/WBNB': process.env.CAKE_WBNB_RPC_URL || 'https://bsc-mainnet.infura.io/v3/d47931b894ba4a6d950a44bfc3fc0309',
    'BUSD/USDT': process.env.BUSD_USDT_RPC_URL || 'https://bsc-mainnet.infura.io/v3/9141934ea14f43b98d6025788a72d2b9'
  },
  
  // MEV Protection configuration
  MEV: {
    ENABLED: true, // Master MEV feature flag
    PROTECTION: {
      ENABLED: true,
      MAX_PRIORITY_FEE_PER_GAS: 3, // Gwei
      MAX_FEE_PER_GAS: 10, // Gwei
      BUNDLE_BRIBE_MULTIPLIER: 1.05, // 5% extra incentive
      METHODS: {
        EIP1559: true,
        FLASHBOTS: false,
        BLOXTRADE: false
      }
    },
    STRATEGIES: {
      ENABLED: true,
      MIN_PROFIT_THRESHOLD: 0.01, // 0.01 BNB,
      MAX_GAS_PRICE: 10, // Gwei
      BACKRUN: {
        ENABLED: true
      },
      SANDWICH: {
        ENABLED: true, // Enabled sandwich attacks
        MAX_POOL_IMPACT: 0.005, // 0.5% max impact
        MIN_PROFIT_THRESHOLD: 0.02, // 0.02 BNB minimum profit for sandwich (higher than backrun)
        FRONTRUN_GAS_BOOST: 1.2, // 20% gas boost for front-run transactions
        MAX_WAIT_TIME: 30 // Maximum seconds to wait for victim transaction
      }
    }
  },
  
  // Environment config
  ENVIRONMENT: {
    DEV_MODE: process.env.DEV_MODE === 'true'
  },
  
  // For compatibility
  get TOKENS() {
    return this.tokens;
  },
  
  get NETWORK() {
    return {
      NATIVE_SYMBOL: 'BNB',
      CHAIN_ID: this.network.chainId,
      NAME: this.network.name
    };
  },
  
  get ARBITRAGE() {
    return this.arbitrage;
  }
};

module.exports = config;
