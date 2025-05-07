/**
 * Constants for DEX interactions on BNB Chain
 * Contains contract addresses, ABIs, and token information
 */

// PancakeSwap V3 Core Contracts on BNB Chain
const PANCAKESWAP_V3_CONTRACTS = {
  // Factory contract to find and create pools
  FACTORY: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  
  // Router for executing swaps
  SWAP_ROUTER: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
  
  // Smart Router that can route across V2, V3, and StableSwap
  SMART_ROUTER: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
  
  // Manages liquidity positions as NFTs
  POSITION_MANAGER: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
  
  // Quoter for getting price quotes
  QUOTER_V2: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
  
  // Retrieves tick data from pools
  TICK_LENS: '0x9a489505a00cE272eAa5e07Dba6491314CaE3796'
};

// PancakeSwap V2 Contracts
const PANCAKESWAP_V2_CONTRACTS = {
  FACTORY: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
  ROUTER: '0x10ED43C718714eb63d5aA57B78B54704E256024E'
};

// ApeSwap Contracts
const APESWAP_CONTRACTS = {
  FACTORY: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
  ROUTER: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7'
};

// BiSwap Contracts
const BISWAP_CONTRACTS = {
  FACTORY: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
  ROUTER: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
  INIT_CODE_HASH: '0x6d58d2e45ee7491a6d4412e8f45d04c9a8e50b363aec0b11c70e82ba8db60d17'
};

// Major tokens on BNB Chain
const TOKENS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
};

// Fee tiers for PancakeSwap V3
const FEE_TIERS = {
  ULTRA_LOWEST: 10,  // 0.01% (used for stable pairs like WBNB/BUSD, WBNB/USDT, BUSD/USDT)
  LOWEST: 100,       // 0.015% (previously used for stable pairs)
  LOW: 500,          // 0.16% (used for pairs like CAKE/WBNB)
  MEDIUM: 2500,      // 0.25%
  HIGH: 10000        // 1.00%
};

// Common token decimals
const TOKEN_DECIMALS = {
  WBNB: 18,
  BUSD: 18,
  USDT: 18,
  CAKE: 18,
  ETH: 18,
  USDC: 18
};

module.exports = {
  PANCAKESWAP_V3_CONTRACTS,
  PANCAKESWAP_V2_CONTRACTS,
  APESWAP_CONTRACTS,
  BISWAP_CONTRACTS,
  TOKENS,
  FEE_TIERS,
  TOKEN_DECIMALS
};