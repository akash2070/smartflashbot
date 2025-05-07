const { ethers } = require('ethers');
const { getDeadline, applySlippage } = require('../utils/helpers');
const config = require('../config');
const logger = require('../utils/logger');
const { callContractWithRetry, retryWithBackoff } = require('../utils/requestUtils');
const { createContractWithRetry, createERC20WithRetry } = require('../utils/contractUtils');
const { PANCAKESWAP_V3_CONTRACTS, FEE_TIERS } = require('./constants');

// ABIs
const RouterABI = require('../abis/PancakeV3Router.json');
const FactoryABI = require('../abis/PancakeV3Factory.json');
const PoolABI = require('../abis/PancakeV3Pool.json');
const ERC20ABI = require('../abis/ERC20.json');
const FlashLoanABI = require('../abis/FlashLoan.json');

// Define a simple Quoter ABI for price calculation functions
const QuoterABI = [
  {
    "inputs": [
      { "internalType": "bytes", "name": "path", "type": "bytes" },
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" }
    ],
    "name": "quoteExactInput",
    "outputs": [
      { "internalType": "uint256", "name": "amountOut", "type": "uint256" },
      { "internalType": "uint160[]", "name": "sqrtPriceX96AfterList", "type": "uint160[]" },
      { "internalType": "uint32[]", "name": "initializedTicksCrossedList", "type": "uint32[]" },
      { "internalType": "uint256", "name": "gasEstimate", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "tokenIn", "type": "address" },
      { "internalType": "address", "name": "tokenOut", "type": "address" },
      { "internalType": "uint24", "name": "fee", "type": "uint24" },
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
      { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
    ],
    "name": "quoteExactInputSingle",
    "outputs": [
      { "internalType": "uint256", "name": "amountOut", "type": "uint256" },
      { "internalType": "uint160", "name": "sqrtPriceX96After", "type": "uint160" },
      { "internalType": "uint32", "name": "initializedTicksCrossed", "type": "uint32" },
      { "internalType": "uint256", "name": "gasEstimate", "type": "uint256" }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

class PancakeswapV3 {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.name = 'PancakeSwap V3';
    
    // Initialize contracts using constants
    this.smartRouterAddress = PANCAKESWAP_V3_CONTRACTS.SMART_ROUTER;
    this.routerAddress = PANCAKESWAP_V3_CONTRACTS.SWAP_ROUTER;
    this.factoryAddress = PANCAKESWAP_V3_CONTRACTS.FACTORY;
    this.quoterAddress = PANCAKESWAP_V3_CONTRACTS.QUOTER_V2;
    this.positionManagerAddress = PANCAKESWAP_V3_CONTRACTS.POSITION_MANAGER;
    
    // Initialize fee tier mappings
    this.feeMapping = {
      ULTRA_LOWEST: FEE_TIERS.ULTRA_LOWEST, // 0.01%
      LOWEST: FEE_TIERS.LOWEST,   // 0.015%
      LOW: FEE_TIERS.LOW,         // 0.05%
      MEDIUM: FEE_TIERS.MEDIUM,   // 0.25%
      HIGH: FEE_TIERS.HIGH        // 1.00%
    };
    
    // Fallback to config if constants are not defined or if in dev mode
    if (config.ENVIRONMENT.DEV_MODE && config.DEX && config.DEX.PANCAKESWAP_V3) {
      // Use config values in dev mode for consistency with existing code
      this.smartRouterAddress = config.DEX.PANCAKESWAP_V3.ROUTER || this.smartRouterAddress; 
      this.routerAddress = config.DEX.PANCAKESWAP_V3.ROUTER_V3 || this.routerAddress;
      this.factoryAddress = config.DEX.PANCAKESWAP_V3.FACTORY || this.factoryAddress;
      this.quoterAddress = config.DEX.PANCAKESWAP_V3.QUOTER || this.quoterAddress;
      this.positionManagerAddress = config.DEX.PANCAKESWAP_V3.POSITION_MANAGER || this.positionManagerAddress;
    }
    
    // Log the addresses being used
    logger.info(`PancakeSwap V3 using addresses:
      - Smart Router: ${this.smartRouterAddress}
      - V3 Router: ${this.routerAddress}
      - Factory: ${this.factoryAddress}
      - Quoter: ${this.quoterAddress}
      - Position Manager: ${this.positionManagerAddress}
    `);
    
    // Initialize the main router (V3 specific) with retry logic
    this.router = createContractWithRetry(
      this.routerAddress,
      RouterABI,
      this.provider
    );
    
    // Initialize smart router for cross-pool routing with retry logic
    this.smartRouter = createContractWithRetry(
      this.smartRouterAddress,
      RouterABI, // Note: This should use SmartRouterABI with full functionality
      this.provider
    );
    
    // Initialize factory with retry logic
    this.factory = createContractWithRetry(
      this.factoryAddress,
      FactoryABI,
      this.provider
    );
    
    // Initialize quoter for getting price quotes with retry logic
    if (this.quoterAddress) {
      try {
        this.quoter = createContractWithRetry(
          this.quoterAddress,
          QuoterABI,
          this.provider
        );
      } catch (error) {
        logger.warn(`Failed to initialize PancakeSwap V3 Quoter: ${error.message}`);
      }
    }
    
    this.routerWithSigner = this.router.connect(this.wallet);
    
    // Default fee tiers to check (using constants from imported FEE_TIERS)
    this.feeTiers = Object.values(FEE_TIERS);
  }
  
  /**
   * Get the pool address for two tokens
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @param {number} fee - Fee tier (100, 500, 3000, 10000)
   * @returns {Promise<string>} - Pool address
   */
  async getPoolAddress(tokenA, tokenB, fee = 3000) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        // Generate a deterministic "fake" pool address based on inputs
        const addressBase = "0x7Ea6bb671a9836c30511832D3D64C5F655321081"; // A constant base for deterministic results
        return addressBase;
      }
      
      // Production mode - real blockchain call
      const tokenALower = tokenA.toLowerCase();
      const tokenBLower = tokenB.toLowerCase();
      
      // Define preferred fee tiers for specific token pairs based on observed liquidity
      // These are pairs where we know the best liquidity is in a specific fee tier
      // We start with the regular LOWEST tier (0.015%) for stable pairs
      // and our fallback code will try ULTRA_LOWEST (0.01%) if it exists
      const PREFERRED_FEE_TIERS = {
        // WBNB/BUSD: 0.015% fee tier has good liquidity, we'll check for 0.01% separately
        [`${config.TOKENS.WBNB.toLowerCase()}-${config.TOKENS.BUSD.toLowerCase()}`]: FEE_TIERS.LOWEST, // 100 (0.015%)
        [`${config.TOKENS.BUSD.toLowerCase()}-${config.TOKENS.WBNB.toLowerCase()}`]: FEE_TIERS.LOWEST, // 100 (0.015%)
        
        // WBNB/USDT: 0.015% fee tier has good liquidity, we'll check for 0.01% separately
        [`${config.TOKENS.WBNB.toLowerCase()}-${config.TOKENS.USDT.toLowerCase()}`]: FEE_TIERS.LOWEST, // 100 (0.015%)
        [`${config.TOKENS.USDT.toLowerCase()}-${config.TOKENS.WBNB.toLowerCase()}`]: FEE_TIERS.LOWEST, // 100 (0.015%)
        
        // BUSD/USDT: 0.015% fee tier has good liquidity, we'll check for 0.01% separately
        [`${config.TOKENS.BUSD.toLowerCase()}-${config.TOKENS.USDT.toLowerCase()}`]: FEE_TIERS.LOWEST, // 100 (0.015%)
        [`${config.TOKENS.USDT.toLowerCase()}-${config.TOKENS.BUSD.toLowerCase()}`]: FEE_TIERS.LOWEST, // 100 (0.015%)
      };
      
      // Check if this is a known pair with a preferred fee tier
      const pairKey = `${tokenALower}-${tokenBLower}`;
      const reversePairKey = `${tokenBLower}-${tokenALower}`;
      
      // If we have a preferred fee tier for this pair and fee wasn't specifically requested,
      // use the preferred fee tier
      if ((fee === 3000) && (PREFERRED_FEE_TIERS[pairKey] || PREFERRED_FEE_TIERS[reversePairKey])) {
        const preferredFee = PREFERRED_FEE_TIERS[pairKey] || PREFERRED_FEE_TIERS[reversePairKey];
        logger.info(`Using preferred fee tier ${preferredFee} instead of default ${fee} for ${tokenA}/${tokenB}`);
        fee = preferredFee;
      }
      
      // We'll check for 0.01% pools for stable pairs, but default to 0.015% if those don't exist
      // This way, we get the best of both worlds - we use the ultra-low 0.01% fee tier if it exists,
      // but safely fall back to 0.015% if not

      // Special case for CAKE/WBNB to ensure we use 0.16% (closest is 0.05% / 500) tier
      // This is based on user's update showing highest liquidity in the 0.16% tier
      if (((tokenALower === config.TOKENS.CAKE.toLowerCase() && tokenBLower === config.TOKENS.WBNB.toLowerCase()) ||
           (tokenBLower === config.TOKENS.CAKE.toLowerCase() && tokenALower === config.TOKENS.WBNB.toLowerCase())) &&
          (fee !== FEE_TIERS.LOW)) {
        logger.info(`Overriding fee tier to ${FEE_TIERS.LOW} (0.05%) for CAKE/WBNB pair based on updated liquidity data (closest to 0.16%)`);
        fee = FEE_TIERS.LOW; // 500 (0.05%)
      }
      
      // Ensure tokenA is less than tokenB for consistent sorting (required by PancakeSwap factory)
      [tokenA, tokenB] = tokenALower < tokenBLower 
        ? [tokenA, tokenB] 
        : [tokenB, tokenA];
        
      // Use retry mechanism for handling rate limits
      const poolAddress = await retryWithBackoff(async () => {
        return await this.factory.getPool(tokenA, tokenB, fee);
      }, 5, 1000); // 5 retries with starting delay of 1000ms
      
      // Check if we got a valid pool address
      if (poolAddress === ethers.constants.AddressZero && fee === FEE_TIERS.ULTRA_LOWEST) {
        // If we tried with ULTRA_LOWEST (0.01%) and no pool exists, fallback to LOWEST (0.015%)
        logger.info(`No pool exists for ${tokenA}/${tokenB} with 0.01% fee tier, trying 0.015% as fallback`);
        return await retryWithBackoff(async () => {
          return await this.factory.getPool(tokenA, tokenB, FEE_TIERS.LOWEST);
        }, 5, 1000);
      }
      
      return poolAddress;
    } catch (error) {
      logger.error(`Error getting pool address: ${error.message}`);
      
      // In dev mode or if the error is due to rate limiting, return a fallback address
      if (config.ENVIRONMENT.DEV_MODE || error.message.includes("limit exceeded")) {
        // For common pairs, we know the fee tiers with most liquidity
        const tokenALower = tokenA.toLowerCase();
        const tokenBLower = tokenB.toLowerCase();
        
        // If this is CAKE/WBNB with LOW fee tier, return a known good address
        if (((tokenALower === config.TOKENS.CAKE.toLowerCase() && tokenBLower === config.TOKENS.WBNB.toLowerCase()) ||
             (tokenBLower === config.TOKENS.CAKE.toLowerCase() && tokenALower === config.TOKENS.WBNB.toLowerCase())) &&
            fee === FEE_TIERS.LOW) {
          const fallbackAddress = "0xAfB2Da14056725E3BA3a30dD846B6BBbd7886c56"; // Known address for CAKE/WBNB 0.05% pool
          logger.info(`Using known fallback pool address for CAKE/WBNB with 0.05% fee: ${fallbackAddress}`);
          return fallbackAddress;
        }
        
        // If this is a stablecoin pair with LOWEST fee tier, return a known good address
        if (((tokenALower === config.TOKENS.WBNB.toLowerCase() && tokenBLower === config.TOKENS.BUSD.toLowerCase()) ||
             (tokenBLower === config.TOKENS.WBNB.toLowerCase() && tokenALower === config.TOKENS.BUSD.toLowerCase())) &&
            fee === FEE_TIERS.LOWEST) {
          const fallbackAddress = "0x58F876857a02D6762E0101bb5C46A8c1ED44Dc16"; // Known address for WBNB/BUSD 0.015% pool
          logger.info(`Using known fallback pool address for WBNB/BUSD with 0.015% fee: ${fallbackAddress}`);
          return fallbackAddress;
        }
        
        // If we're in dev mode, return a generic simulated address
        if (config.ENVIRONMENT.DEV_MODE) {
          logger.info(`Dev mode: Returning simulated pool address for ${tokenA}/${tokenB} with fee ${fee}`);
          return "0x7Ea6bb671a9836c30511832D3D64C5F655321081";
        }
        
        // For other RPC limit errors, return AddressZero so the system can try fallbacks
        logger.info(`Returning AddressZero due to RPC limits to allow fallback fee tiers to be tried`);
        return ethers.constants.AddressZero;
      }
      
      throw error;
    }
  }
  
  /**
   * Get all existing pools for a token pair across all fee tiers
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<Array<{fee: number, address: string}>>} - List of pools
   */
  async getAllPools(tokenA, tokenB) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        // Return simulated pools data
        return this.feeTiers.map(fee => ({
          fee,
          address: `0x7Ea6bb671a9836c30511832D3D64C5F655321${fee.toString().padStart(3, '0')}`
        }));
      }
      
      // Production mode - real blockchain calls
      const pools = [];
      
      // Get the token pair key for checking preferred fee tiers
      const tokenALower = tokenA.toLowerCase();
      const tokenBLower = tokenB.toLowerCase();
      const pairKey = `${tokenALower}-${tokenBLower}`;
      const reversePairKey = `${tokenBLower}-${tokenALower}`;
      
      // Define preferred fee tiers for specific token pairs
      const PREFERRED_FEE_TIERS = {
        // WBNB/BUSD: 0.01% fee tier has best liquidity based on user's update
        [`${config.TOKENS.WBNB.toLowerCase()}-${config.TOKENS.BUSD.toLowerCase()}`]: [FEE_TIERS.ULTRA_LOWEST, FEE_TIERS.LOWEST],
        [`${config.TOKENS.BUSD.toLowerCase()}-${config.TOKENS.WBNB.toLowerCase()}`]: [FEE_TIERS.ULTRA_LOWEST, FEE_TIERS.LOWEST],
        
        // WBNB/USDT: 0.01% fee tier has best liquidity based on user's update
        [`${config.TOKENS.WBNB.toLowerCase()}-${config.TOKENS.USDT.toLowerCase()}`]: [FEE_TIERS.ULTRA_LOWEST, FEE_TIERS.LOWEST],
        [`${config.TOKENS.USDT.toLowerCase()}-${config.TOKENS.WBNB.toLowerCase()}`]: [FEE_TIERS.ULTRA_LOWEST, FEE_TIERS.LOWEST],
        
        // BUSD/USDT: 0.01% fee tier has best liquidity based on user's update
        [`${config.TOKENS.BUSD.toLowerCase()}-${config.TOKENS.USDT.toLowerCase()}`]: [FEE_TIERS.ULTRA_LOWEST, FEE_TIERS.LOWEST],
        [`${config.TOKENS.USDT.toLowerCase()}-${config.TOKENS.BUSD.toLowerCase()}`]: [FEE_TIERS.ULTRA_LOWEST, FEE_TIERS.LOWEST],
        
        // CAKE/WBNB: 0.05% fee tier for closest to 0.16%
        [`${config.TOKENS.CAKE.toLowerCase()}-${config.TOKENS.WBNB.toLowerCase()}`]: [FEE_TIERS.LOW],
        [`${config.TOKENS.WBNB.toLowerCase()}-${config.TOKENS.CAKE.toLowerCase()}`]: [FEE_TIERS.LOW],
      };
      
      // First, try the preferred fee tiers for known pairs
      const preferredTiers = PREFERRED_FEE_TIERS[pairKey] || PREFERRED_FEE_TIERS[reversePairKey];
      if (preferredTiers) {
        for (const fee of preferredTiers) {
          const poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
          if (poolAddress !== ethers.constants.AddressZero) {
            pools.push({
              fee,
              address: poolAddress
            });
            // If we found a pool with the preferred fee tier, we can skip checking other tiers
            logger.info(`Found pool with preferred fee tier ${fee} for ${tokenA}/${tokenB}`);
          }
        }
      }
      
      // If we didn't find any pools with preferred fee tiers, check all tiers
      if (pools.length === 0) {
        for (const fee of this.feeTiers) {
          // Skip fees we already checked
          if (preferredTiers && preferredTiers.includes(fee)) continue;
          
          const poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
          if (poolAddress !== ethers.constants.AddressZero) {
            pools.push({
              fee,
              address: poolAddress
            });
          }
        }
      }
      
      return pools;
    } catch (error) {
      logger.error(`Error getting all pools: ${error.message}`);
      
      // In dev mode, return simulated data
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning simulated pools for ${tokenA}/${tokenB}`);
        return this.feeTiers.map(fee => ({
          fee,
          address: `0x7Ea6bb671a9836c30511832D3D64C5F655321${fee.toString().padStart(3, '0')}`
        }));
      }
      
      throw error;
    }
  }
  
  /**
   * Get liquidity information for a specific pool
   * @param {string} poolAddress - Pool contract address
   * @returns {Promise<Object>} - Pool liquidity info
   */
  async getPoolLiquidity(poolAddress) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        // Extract fee tier from address if using our synthetic address format
        let fee = 3000; // Default to 0.3%
        if (poolAddress.includes('5321')) {
          const feeStr = poolAddress.slice(-3);
          fee = parseInt(feeStr, 10);
        }
        
        // Generate simulated pool data
        const token0 = config.TOKENS.WBNB;
        const token1 = config.TOKENS.BUSD;
        
        // Generate a reproducible sqrtPriceX96 based on the fee
        // Higher fee tiers typically have more volatile pairs
        const basePrice = fee === 10000 ? 85 : fee === 3000 ? 320 : fee === 500 ? 1 : 1.01;
        const priceFloat = basePrice * (1 + (fee % 10) / 1000);
        const sqrtPrice = Math.sqrt(priceFloat);
        // Be careful with the calculation to avoid overflow
        const sqrtPriceX96 = ethers.BigNumber.from(Math.floor(sqrtPrice))
          .mul(ethers.BigNumber.from(2).pow(48))
          .mul(ethers.BigNumber.from(2).pow(48));
        
        // Simulated tick based on the price
        const tick = Math.floor(Math.log(priceFloat) / Math.log(1.0001));
        
        // Simulate higher liquidity for lower fee tiers
        const liquidityFactor = fee === 100 ? 8 : fee === 500 ? 5 : fee === 3000 ? 3 : 1;
        const liquidity = ethers.utils.parseEther('1000000').mul(liquidityFactor);
        
        // Simulate token balances based on liquidity and price
        // Ensure we don't have a division by zero or very small numbers
        const feeSqrt = Math.max(1, Math.floor(Math.sqrt(fee)));
        const balance0 = ethers.utils.parseEther('5000').div(feeSqrt);
        const priceScaled = Math.max(1, Math.floor(priceFloat * 100));
        const balance1 = balance0.mul(priceScaled).div(100);
        
        return {
          exists: true,
          poolAddress,
          token0,
          token1,
          fee,
          sqrtPriceX96,
          tick,
          liquidity,
          balance0,
          balance1,
          decimals0: 18,
          decimals1: 18
        };
      }
      
      // Production mode - real blockchain calls with retry logic
      const pool = createContractWithRetry(poolAddress, PoolABI, this.provider);
      
      // Contracts with retry already built-in
      const [token0, token1, fee, liquidity, slot0] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.fee(),
        pool.liquidity(),
        pool.slot0()
      ]);
      
      // Get token balances in the pool with retry-enabled contracts
      const token0Contract = createERC20WithRetry(token0, this.provider);
      const token1Contract = createERC20WithRetry(token1, this.provider);
      
      const [balance0, decimals0, balance1, decimals1] = await Promise.all([
        token0Contract.balanceOf(poolAddress),
        token0Contract.decimals(),
        token1Contract.balanceOf(poolAddress),
        token1Contract.decimals()
      ]);
      
      return {
        exists: true,
        poolAddress,
        token0,
        token1,
        fee,
        sqrtPriceX96: slot0.sqrtPriceX96,
        tick: slot0.tick,
        liquidity,
        balance0,
        balance1,
        decimals0,
        decimals1
      };
    } catch (error) {
      logger.error(`Error getting pool liquidity: ${error.message}`);
      
      // In dev mode, return simulated data
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning simulated pool liquidity for ${poolAddress}`);
        const token0 = config.TOKENS.WBNB;
        const token1 = config.TOKENS.BUSD;
        const fee = 3000;
        
        return {
          exists: true,
          poolAddress,
          token0,
          token1,
          fee,
          sqrtPriceX96: ethers.BigNumber.from(2).pow(96).mul(20), // Price of ~400
          tick: 85176, // Approximate tick for price 400
          liquidity: ethers.utils.parseEther('3000000'),
          balance0: ethers.utils.parseEther('5000'),
          balance1: ethers.utils.parseEther('2000000'),
          decimals0: 18,
          decimals1: 18
        };
      }
      
      throw error;
    }
  }
  
  /**
   * Get the swap fee percentage for a given fee tier
   * @param {number} feeTier - The fee tier value (10, 100, 500, 2500, 10000)
   * @returns {number} - The fee percentage (e.g., 0.01, 0.015, 0.16, 0.25, 1.00)
   */
  getSwapFeePercentage(feeTier) {
    // PancakeSwap V3 uses specific percentages that don't exactly match the tier names
    // These values are based on user's update about actual fee percentages
    switch (feeTier) {
      case FEE_TIERS.ULTRA_LOWEST: // 10
        return 0.01; // 0.01% for the ultra lowest tier (stable pairs)
      case FEE_TIERS.LOWEST: // 100
        return 0.015; // 0.015% for the lowest tier
      case FEE_TIERS.LOW: // 500
        return 0.16; // 0.16% for the low tier
      case FEE_TIERS.MEDIUM: // 2500
        return 0.25; // 0.25% for the medium tier
      case FEE_TIERS.HIGH: // 10000
        return 1.00; // 1.00% for the high tier
      default:
        // Fallback to the mathematical calculation
        return feeTier / 10000;
    }
  }
  
  /**
   * Get all available fee tiers with their percentages
   * @returns {Object} - Map of fee tiers to their percentage values
   */
  getAllFeeTiers() {
    // Convert fee tiers to percentage values
    const feeTiersWithPercentages = {};
    
    // Convert each tier value to its percentage equivalent
    Object.entries(this.feeMapping).forEach(([tierName, tierValue]) => {
      feeTiersWithPercentages[tierValue] = this.getSwapFeePercentage(tierValue);
    });
    
    return feeTiersWithPercentages;
  }
  
  /**
   * Get fee tier description for UI display
   * @param {number} feeTier - The fee tier value
   * @returns {string} - Human-readable fee tier description
   */
  getFeeTierDescription(feeTier) {
    const percentage = this.getSwapFeePercentage(feeTier);
    
    // Special case for the 0.01% fee tier to show exact number
    if (feeTier === FEE_TIERS.ULTRA_LOWEST) {
      return '0.01% Tier';
    }
    
    // Special case for the 0.015% fee tier to show exact number
    if (feeTier === FEE_TIERS.LOWEST) {
      return '0.015% Tier';
    }
    
    // Special case for the 0.16% fee tier to show exact number
    if (feeTier === FEE_TIERS.LOW) {
      return '0.16% Tier';
    }
    
    // For other tiers, use the calculated percentage with 2 decimal places
    return `${percentage.toFixed(2)}% Tier`;
  }
  
  /**
   * Get price from V3 pool
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @param {number} fee - Fee tier
   * @returns {Promise<BigNumber>} - Price ratio
   */
  async getPrice(tokenA, tokenB, fee = 3000) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        // Generate deterministic price based on tokens and fee
        // This ensures consistent prices for the same token pair
        const tokenALower = tokenA.toLowerCase();
        const tokenBLower = tokenB.toLowerCase();
        
        // Base price calculations using synthetic data
        let basePrice;
        
        // WBNB/BUSD around 330 - PancakeSwap V3 has a different price than other DEXes (lower)
        if ((tokenALower === config.TOKENS.WBNB.toLowerCase() && 
             tokenBLower === config.TOKENS.BUSD.toLowerCase()) ||
            (tokenBLower === config.TOKENS.WBNB.toLowerCase() && 
             tokenALower === config.TOKENS.BUSD.toLowerCase())) {
          basePrice = ethers.utils.parseEther('330'); // Lower price on V3
        } 
        // WBNB/USDT around 330 - PancakeSwap V3 has a different price than other DEXes
        else if ((tokenALower === config.TOKENS.WBNB.toLowerCase() && 
                 tokenBLower === config.TOKENS.USDT.toLowerCase()) ||
                 (tokenBLower === config.TOKENS.WBNB.toLowerCase() && 
                 tokenALower === config.TOKENS.USDT.toLowerCase())) {
          basePrice = ethers.utils.parseEther('0.1'); // Much lower price on V3, creating arbitrage opportunity
        }
        // WBNB/CAKE around 180 CAKE per BNB
        else if ((tokenALower === config.TOKENS.WBNB.toLowerCase() && 
                  tokenBLower === config.TOKENS.CAKE.toLowerCase()) ||
                 (tokenBLower === config.TOKENS.WBNB.toLowerCase() && 
                  tokenALower === config.TOKENS.CAKE.toLowerCase())) {
          basePrice = ethers.utils.parseEther('180'); // Higher price on V3
        }
        // BUSD/USDT around 1:1
        else if ((tokenALower === config.TOKENS.BUSD.toLowerCase() && 
                  tokenBLower === config.TOKENS.USDT.toLowerCase()) ||
                 (tokenBLower === config.TOKENS.BUSD.toLowerCase() && 
                  tokenALower === config.TOKENS.USDT.toLowerCase())) {
          basePrice = ethers.utils.parseEther('1'); // Stable pair price
        }
        // Default to some price for any other pair
        else {
          basePrice = ethers.utils.parseEther('10');
        }
        
        // Adjust price based on fee tier (higher fee tiers have slightly different prices)
        // This creates price discrepancies for arbitrage opportunities
        let priceAdjustment;
        switch (fee) {
          case 10: // 0.01%
            priceAdjustment = ethers.utils.parseEther('0.992'); // Even lower for ultra stable pairs
            break;
          case 100: // 0.015%
            priceAdjustment = ethers.utils.parseEther('0.995');
            break;
          case 500: // 0.16%
            priceAdjustment = ethers.utils.parseEther('0.998');
            break;
          case 2500: // 0.25%
            priceAdjustment = ethers.utils.parseEther('1.002');
            break;
          case 10000: // 1%
            priceAdjustment = ethers.utils.parseEther('1.005');
            break;
          default:
            priceAdjustment = ethers.utils.parseEther('1');
        }
        
        const adjustedPrice = basePrice.mul(priceAdjustment).div(ethers.utils.parseEther('1'));
        
        // Ensure price is returned in the right direction
        if (tokenALower < tokenBLower) {
          return adjustedPrice;
        } else {
          return ethers.utils.parseEther('1').mul(ethers.utils.parseEther('1')).div(adjustedPrice);
        }
      }
      
      // Production mode - real blockchain calls with retry logic
      const poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
      
      if (poolAddress === ethers.constants.AddressZero) {
        throw new Error(`No pool exists for ${tokenA}/${tokenB} with fee ${fee}`);
      }
      
      // Create contract with built-in retry logic
      const pool = createContractWithRetry(poolAddress, PoolABI, this.provider);
      
      // Contract calls already have retry logic built-in
      const slot0 = await pool.slot0();
      
      // Price is derived from sqrtPriceX96
      const sqrtPriceX96 = slot0.sqrtPriceX96;
      
      // Convert sqrtPriceX96 to price
      // price = (sqrtPriceX96 / 2^96)^2
      const price = sqrtPriceX96
        .mul(sqrtPriceX96)
        .div(ethers.BigNumber.from(2).pow(192));
      
      // Check token order with contract that has retry built-in
      const token0 = await pool.token0();
      
      // Return price based on requested order
      if (token0.toLowerCase() === tokenA.toLowerCase()) {
        return price;
      } else {
        // Invert the price
        return ethers.utils.parseEther('1').mul(ethers.utils.parseEther('1')).div(price);
      }
    } catch (error) {
      logger.error(`Error getting V3 price: ${error.message}`);
      
      // In dev mode, return simulated price
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning simulated price for ${tokenA}/${tokenB}`);
        // Generate simple price based on token addresses
        const tokenSum = tokenA.toLowerCase().charCodeAt(30) + tokenB.toLowerCase().charCodeAt(30);
        const basePrice = tokenSum / 10;
        return ethers.utils.parseEther(basePrice.toString());
      }
      
      throw error;
    }
  }
  
  /**
   * Get the best pool for a token pair based on liquidity
   * @param {string} tokenA - First token address
   * @param {string} tokenB - Second token address
   * @returns {Promise<Object>} - Best pool information
   */
  async getBestPool(tokenA, tokenB) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning simulated best pool for ${tokenA}/${tokenB}`);
        // In dev mode, always return the 0.25% fee pool as the "best" pool
        return {
          address: '0x7Ea6bb671a9836c30511832D3D64C5F655321003',
          fee: 3000,
          token0: config.TOKENS.WBNB,
          token1: tokenA === config.TOKENS.WBNB ? tokenB : tokenA,
          liquidity: ethers.utils.parseEther('3000000'),
          sqrtPriceX96: ethers.BigNumber.from(2).pow(96).mul(20),
          tick: 85176,
          balance0: ethers.utils.parseEther('5000'),
          balance1: ethers.utils.parseEther('2000000'),
          decimals0: 18,
          decimals1: 18,
          exists: true
        };
      }
      
      // For production mode, directly try the preferred fee tiers based on token pair
      // This is more efficient than checking all pools first
      const tokenALower = tokenA.toLowerCase();
      const tokenBLower = tokenB.toLowerCase();
      
      // Directly try appropriate fee tiers based on token pairs
      let poolAddress;
      let fee;
      
      // CAKE/WBNB always uses 0.05% (LOW) fee tier
      if ((tokenALower === config.TOKENS.CAKE.toLowerCase() && tokenBLower === config.TOKENS.WBNB.toLowerCase()) ||
          (tokenBLower === config.TOKENS.CAKE.toLowerCase() && tokenALower === config.TOKENS.WBNB.toLowerCase())) {
        fee = FEE_TIERS.LOW; // 500 (0.05%)
        poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
      }
      // For stable pairs (WBNB/BUSD, WBNB/USDT, BUSD/USDT), try 0.015% first
      else if ((tokenALower === config.TOKENS.WBNB.toLowerCase() && tokenBLower === config.TOKENS.BUSD.toLowerCase()) ||
               (tokenBLower === config.TOKENS.WBNB.toLowerCase() && tokenALower === config.TOKENS.BUSD.toLowerCase()) ||
               (tokenALower === config.TOKENS.WBNB.toLowerCase() && tokenBLower === config.TOKENS.USDT.toLowerCase()) ||
               (tokenBLower === config.TOKENS.WBNB.toLowerCase() && tokenALower === config.TOKENS.USDT.toLowerCase()) ||
               (tokenALower === config.TOKENS.BUSD.toLowerCase() && tokenBLower === config.TOKENS.USDT.toLowerCase()) ||
               (tokenBLower === config.TOKENS.BUSD.toLowerCase() && tokenALower === config.TOKENS.USDT.toLowerCase())) {
        // Try the 0.015% (LOWEST) fee tier first
        fee = FEE_TIERS.LOWEST; // 100 (0.015%)
        poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
      }
      // For all other pairs, try with 0.3% fee tier
      else {
        fee = FEE_TIERS.MEDIUM; // 2500 (0.3%)
        poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
      }
      
      // If no pool was found with the initial preferred fee tier, try fallbacks
      if (poolAddress === ethers.constants.AddressZero) {
        // For stable pairs, fallback to 0.3% if 0.015% doesn't exist
        if (fee === FEE_TIERS.LOWEST) {
          logger.info(`No 0.015% pool found for ${tokenA}/${tokenB}, trying 0.3% tier`);
          fee = FEE_TIERS.MEDIUM; // 2500 (0.3%)
          poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
        }
        // For CAKE/WBNB, fallback to 0.3% if 0.05% doesn't exist
        else if (fee === FEE_TIERS.LOW) {
          logger.info(`No 0.05% pool found for ${tokenA}/${tokenB}, trying 0.3% tier`);
          fee = FEE_TIERS.MEDIUM; // 2500 (0.3%)
          poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
        }
        // For other pairs that tried 0.3% first, fallback to 1%
        else if (fee === FEE_TIERS.MEDIUM) {
          logger.info(`No 0.3% pool found for ${tokenA}/${tokenB}, trying 1% tier`);
          fee = FEE_TIERS.HIGH; // 10000 (1%)
          poolAddress = await this.getPoolAddress(tokenA, tokenB, fee);
        }
      }
      
      // If still no pool found after fallbacks, throw an error
      if (poolAddress === ethers.constants.AddressZero) {
        throw new Error(`No pools exist for ${tokenA}/${tokenB}`);
      }
      
      // Get liquidity info for the pool we found
      const liquidity = await this.getPoolLiquidity(poolAddress);
      
      return {
        fee,
        address: poolAddress,
        ...liquidity
      };
    } catch (error) {
      logger.error(`Error getting best pool: ${error.message}`);
      
      // In dev mode, return simulated data
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning fallback simulated best pool for ${tokenA}/${tokenB}`);
        return {
          address: '0x7Ea6bb671a9836c30511832D3D64C5F655321003',
          fee: 3000,
          token0: config.TOKENS.WBNB,
          token1: tokenA === config.TOKENS.WBNB ? tokenB : tokenA,
          liquidity: ethers.utils.parseEther('3000000'),
          sqrtPriceX96: ethers.BigNumber.from(2).pow(96).mul(20),
          tick: 85176,
          balance0: ethers.utils.parseEther('5000'),
          balance1: ethers.utils.parseEther('2000000'),
          decimals0: 18,
          decimals1: 18,
          exists: true
        };
      }
      
      throw error;
    }
  }
  
  /**
   * Get the amount out for a swap using exactInput
   * @param {BigNumber} amountIn - Input amount
   * @param {string} tokenIn - Input token address
   * @param {string} tokenOut - Output token address
   * @param {number} fee - Fee tier (optional)
   * @returns {Promise<BigNumber>} - Output amount
   */
  async getAmountOut(amountIn, tokenIn, tokenOut, fee) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        if (!fee) {
          // If fee not provided, get the best pool
          const bestPool = await this.getBestPool(tokenIn, tokenOut);
          fee = bestPool.fee;
        }
        
        // Get the price from our simulated price function
        const price = await this.getPrice(tokenIn, tokenOut, fee);
        
        // Calculate simulated output amount
        // For token-to-token swap, we need to account for the fee
        const feeAmount = amountIn.mul(fee).div(1000000); // fee in bps
        const amountInAfterFee = amountIn.sub(feeAmount);
        
        // Convert the price to appropriate decimals if needed
        const outputAmount = amountInAfterFee.mul(price).div(ethers.utils.parseEther('1'));
        
        logger.info(`Dev mode: Simulated swap ${amountIn.toString()} of ${tokenIn} to approximately ${outputAmount.toString()} of ${tokenOut}`);
        return outputAmount;
      }
      
      // Production mode - real blockchain call
      if (!fee) {
        // If fee not provided, get the best pool
        const bestPool = await this.getBestPool(tokenIn, tokenOut);
        fee = bestPool.fee;
      }
      
      // Create the path
      const path = ethers.utils.solidityPack(
        ['address', 'uint24', 'address'],
        [tokenIn, fee, tokenOut]
      );
      
      // Quote the swap
      const quotedAmountOut = await this.router.callStatic.exactInputSingle({
        tokenIn,
        tokenOut,
        fee,
        recipient: ethers.constants.AddressZero, // Dummy recipient for quote
        deadline: getDeadline(),
        amountIn,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      });
      
      return quotedAmountOut;
    } catch (error) {
      logger.error(`Error getting amount out: ${error.message}`);
      
      // In dev mode, return simulated data
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Using fallback simulation for getAmountOut`);
        // Get the price ratio between the tokens
        let priceRatio;
        
        // Check common pairs for consistency
        const tokenInLower = tokenIn.toLowerCase();
        const tokenOutLower = tokenOut.toLowerCase();
        
        // WBNB/BUSD around 330
        if ((tokenInLower === config.TOKENS.WBNB.toLowerCase() && 
             tokenOutLower === config.TOKENS.BUSD.toLowerCase())) {
          priceRatio = ethers.utils.parseEther('330');
        } 
        else if ((tokenOutLower === config.TOKENS.WBNB.toLowerCase() && 
                  tokenInLower === config.TOKENS.BUSD.toLowerCase())) {
          priceRatio = ethers.utils.parseEther('1').mul(ethers.utils.parseEther('1')).div(ethers.utils.parseEther('330'));
        }
        // WBNB/CAKE around 180 CAKE per BNB
        else if ((tokenInLower === config.TOKENS.WBNB.toLowerCase() && 
                  tokenOutLower === config.TOKENS.CAKE.toLowerCase())) {
          priceRatio = ethers.utils.parseEther('180');
        }
        else if ((tokenOutLower === config.TOKENS.WBNB.toLowerCase() && 
                  tokenInLower === config.TOKENS.CAKE.toLowerCase())) {
          priceRatio = ethers.utils.parseEther('1').mul(ethers.utils.parseEther('1')).div(ethers.utils.parseEther('180'));
        }
        // BUSD/USDT around 1:1
        else if ((tokenInLower === config.TOKENS.BUSD.toLowerCase() && 
                  tokenOutLower === config.TOKENS.USDT.toLowerCase()) ||
                 (tokenOutLower === config.TOKENS.BUSD.toLowerCase() && 
                  tokenInLower === config.TOKENS.USDT.toLowerCase())) {
          priceRatio = ethers.utils.parseEther('1');
        }
        // Default fallback for any other pair
        else {
          priceRatio = ethers.utils.parseEther('10');
        }
        
        // Adjust based on fee tier
        if (!fee) fee = 3000; // Default to 0.3%
        const feePercent = fee / 1000000;
        const outputAmount = amountIn.mul(priceRatio).div(ethers.utils.parseEther('1'));
        const outputAfterFee = outputAmount.mul(ethers.utils.parseEther((1 - feePercent).toString())).div(ethers.utils.parseEther('1'));
        
        return outputAfterFee;
      }
      
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
      // Check and get the best fee if not provided
      let fee = options.fee;
      if (!fee) {
        const bestPool = await this.getBestPool(tokenIn, tokenOut);
        fee = bestPool.fee;
      }
      
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
      
      const deadline = getDeadline(20); // 20 minutes from now
      
      // Determine which swap method to use
      let tx;
      if (tokenIn === config.TOKENS.WBNB) {
        // For exact WBNB in, wrap BNB to WBNB first
        const params = {
          tokenIn,
          tokenOut,
          fee,
          recipient: this.wallet.address,
          deadline,
          amountIn,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0
        };
        
        const txOptions = {
          ...options,
          value: amountIn
        };
        
        tx = await this.routerWithSigner.exactInputSingle(params, txOptions);
      } else if (tokenOut === config.TOKENS.WBNB) {
        // For exact tokens to WBNB, unwrap WBNB to BNB at the end
        const params = {
          tokenIn,
          tokenOut,
          fee,
          recipient: this.wallet.address,
          deadline,
          amountIn,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0
        };
        
        tx = await this.routerWithSigner.exactInputSingle(params, options);
      } else {
        // For token to token
        const params = {
          tokenIn,
          tokenOut,
          fee,
          recipient: this.wallet.address,
          deadline,
          amountIn,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: 0
        };
        
        tx = await this.routerWithSigner.exactInputSingle(params, options);
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
   * Check if a pool supports flash loan
   * @param {string} poolAddress - Pool address
   * @returns {Promise<boolean>} - Whether the pool supports flash loans
   */
  async supportsFlashLoan(poolAddress) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        // In dev mode, simulate that all pools support flash loans
        return true;
      }
      
      // Production mode - real blockchain call
      const pool = new ethers.Contract(poolAddress, PoolABI, this.provider);
      const code = await this.provider.getCode(poolAddress);
      
      // Check if the contract implements flash loan interface
      // by checking if the code contains the flash function signature
      const flashFunctionSignature = ethers.utils.id('flash(address,uint256,uint256,bytes)').slice(0, 10);
      return code.includes(flashFunctionSignature.slice(2));
    } catch (error) {
      logger.error(`Error checking flash loan support: ${error.message}`);
      
      // In dev mode, return true as fallback
      if (config.ENVIRONMENT.DEV_MODE) {
        return true;
      }
      
      return false;
    }
  }
  
  /**
   * Get pools that can be used for flash loans
   * @param {string} token - Token address to flash loan
   * @returns {Promise<Array<Object>>} - List of pools supporting flash loans
   */
  async getFlashLoanPools(token) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning simulated flash loan pools for ${token}`);
        
        // We'll generate simulated pools with WBNB, BUSD, or USDT
        const commonTokens = [
          config.TOKENS.WBNB,
          config.TOKENS.BUSD,
          config.TOKENS.USDT
        ].filter(t => t.toLowerCase() !== token.toLowerCase());
        
        // Create simulated flash loan pools
        const flashLoanPools = [];
        
        for (let i = 0; i < commonTokens.length; i++) {
          const pairedToken = commonTokens[i];
          
          // Create pools with different fee tiers
          for (const fee of this.feeTiers) {
            const poolAddress = `0x7Ea6bb671a9836c30511832D3D64C5F655321${fee.toString().padStart(3, '0')}`;
            
            // Higher liquidity for WBNB pool (most common for flash loans)
            const liquidityFactor = pairedToken === config.TOKENS.WBNB ? 5 : 
                                   pairedToken === config.TOKENS.BUSD ? 3 : 1;
            
            // Lower fee tiers typically have more liquidity
            const feeFactor = fee === 100 ? 8 : 
                             fee === 500 ? 5 : 
                             fee === 3000 ? 3 : 1;
            
            // Generate simulated pool data
            flashLoanPools.push({
              address: poolAddress,
              fee,
              pairedToken,
              token0: token.toLowerCase() < pairedToken.toLowerCase() ? token : pairedToken,
              token1: token.toLowerCase() < pairedToken.toLowerCase() ? pairedToken : token,
              liquidity: ethers.utils.parseEther('1000000').mul(liquidityFactor).mul(feeFactor),
              balance0: ethers.utils.parseEther('5000').mul(liquidityFactor),
              balance1: ethers.utils.parseEther('5000').mul(liquidityFactor),
              decimals0: 18,
              decimals1: 18,
              exists: true
            });
          }
        }
        
        // Sort by liquidity (highest first)
        return flashLoanPools.sort((a, b) => b.liquidity.gt(a.liquidity) ? 1 : -1);
      }
      
      // Production mode - real blockchain calls
      // We'll look for pools with WBNB, BUSD, or USDT
      const commonTokens = [
        config.TOKENS.WBNB,
        config.TOKENS.BUSD,
        config.TOKENS.USDT
      ].filter(t => t.toLowerCase() !== token.toLowerCase());
      
      const flashLoanPools = [];
      
      for (const pairedToken of commonTokens) {
        const pools = await this.getAllPools(token, pairedToken);
        
        for (const pool of pools) {
          const supportsFlash = await this.supportsFlashLoan(pool.address);
          
          if (supportsFlash) {
            const liquidity = await this.getPoolLiquidity(pool.address);
            flashLoanPools.push({
              ...pool,
              pairedToken,
              ...liquidity
            });
          }
        }
      }
      
      // Sort by liquidity (highest first)
      return flashLoanPools.sort((a, b) => b.liquidity.gt(a.liquidity) ? 1 : -1);
    } catch (error) {
      logger.error(`Error getting flash loan pools: ${error.message}`);
      
      // In dev mode, return simulated data
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning fallback simulated flash loan pools for ${token}`);
        
        // Create a single simulated flash loan pool with WBNB
        const pairedToken = config.TOKENS.WBNB;
        return [{
          address: '0x7Ea6bb671a9836c30511832D3D64C5F655321003',
          fee: 3000,
          pairedToken,
          token0: token.toLowerCase() < pairedToken.toLowerCase() ? token : pairedToken,
          token1: token.toLowerCase() < pairedToken.toLowerCase() ? pairedToken : token,
          liquidity: ethers.utils.parseEther('5000000'),
          balance0: ethers.utils.parseEther('10000'),
          balance1: ethers.utils.parseEther('10000'),
          decimals0: 18,
          decimals1: 18,
          exists: true
        }];
      }
      
      throw error;
    }
  }
  
  /**
   * Get the best flash loan pool for a token
   * @param {string} token - Token address to flash loan
   * @returns {Promise<Object>} - Best pool for flash loan
   */
  async getBestFlashLoanPool(token) {
    try {
      // Check if we're in development mode
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning simulated best flash loan pool for ${token}`);
        // Get all simulated flash loan pools
        const pools = await this.getFlashLoanPools(token);
        // Return the first one (should be sorted by liquidity already)
        return pools[0];
      }
      
      // Production mode - real blockchain calls
      const pools = await this.getFlashLoanPools(token);
      
      if (pools.length === 0) {
        throw new Error(`No flash loan pools available for ${token}`);
      }
      
      // Return the pool with highest liquidity
      return pools[0];
    } catch (error) {
      logger.error(`Error getting best flash loan pool: ${error.message}`);
      
      // In dev mode, return simulated data
      if (config.ENVIRONMENT.DEV_MODE) {
        logger.info(`Dev mode: Returning fallback simulated best flash loan pool for ${token}`);
        
        // Create a single simulated flash loan pool with WBNB
        const pairedToken = config.TOKENS.WBNB;
        return {
          address: '0x7Ea6bb671a9836c30511832D3D64C5F655321003',
          fee: 3000,
          pairedToken,
          token0: token.toLowerCase() < pairedToken.toLowerCase() ? token : pairedToken,
          token1: token.toLowerCase() < pairedToken.toLowerCase() ? pairedToken : token,
          liquidity: ethers.utils.parseEther('5000000'),
          balance0: ethers.utils.parseEther('10000'),
          balance1: ethers.utils.parseEther('10000'),
          decimals0: 18,
          decimals1: 18,
          exists: true
        };
      }
      
      throw error;
    }
  }
  
  /**
   * Calculate the flash loan fee
   * @param {BigNumber} amount - Flash loan amount
   * @param {number} fee - Pool fee (in bps)
   * @returns {BigNumber} - Flash loan fee
   */
  calculateFlashLoanFee(amount, fee) {
    return amount.mul(fee).div(1000000); // fee is in bps (e.g., 3000 = 0.3%)
  }
}

module.exports = PancakeswapV3;
