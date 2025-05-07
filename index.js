require('dotenv').config();
const { ethers } = require('ethers');
const { BigNumber } = ethers;  // Add BigNumber import 
const logger = require('./src/utils/logger');
const { sleep, formatEther, getSafeGasPrice } = require('./src/utils/helpers');
const simulator = require('./src/utils/simulator');
const { createProviderAndWallet, createWebSocketProvider } = require('./src/providers/blockchain');
const OpportunityFinder = require('./src/arbitrage/opportunities');
const ArbitrageCalculator = require('./src/arbitrage/calculator');
const FlashLoanExecutor = require('./src/flashloan/executor');
const MevProtection = require('./src/mev/protection');
const MevStrategies = require('./src/mev/strategies');
const performanceTracker = require('./src/dashboard/tracker');
const config = require('./src/config');
const safetyManager = require('./src/utils/safetyManager');

// ======== DEPLOYED CONTRACT CONFIGURATION ========
// FlashLoanArbitrage contract configuration
const DEPLOYED_CONTRACT = {
  // Set to true to enable contract integration
  IS_DEPLOYED: true,
  
  // Our deployed FlashLoanArbitrage_Flattened contract address on BNB mainnet
  ADDRESS: "0x43c006f6e8B7e81f64f2cba0f2a320875feF8c90",
  
  // The BNB Chain network (56 for mainnet, 97 for testnet)
  NETWORK_ID: 56, // BNB Chain Mainnet
  
  // ABI will be loaded dynamically from the compiled contract
  ABI: null,
};

// Initialize components
logger.info('Starting Flash Loan Arbitrage Bot on BNB Chain...');

async function initialize() {
  try {
    // Check if we should try to connect to the real blockchain
    const useRealBlockchain = process.env.USE_REAL_BLOCKCHAIN === 'true';
    logger.info(`Initializing with USE_REAL_BLOCKCHAIN=${useRealBlockchain}`);
    
    // Create provider and wallet with better reliability
    const { provider, wallet } = await createProviderAndWallet();
    
    logger.info('Provider and wallet instance created');
    
    let networkInfo;
    let balance;
    let usingSimulator = false;
    
    try {
      // Try to check connection to blockchain
      logger.info('Attempting to fetch network and balance information...');
      
      networkInfo = await provider.getNetwork();
      logger.info(`Connected to network: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);
      
      // Try to get wallet balance
      try {
        balance = await provider.getBalance(wallet.address);
        logger.info(`Wallet balance: ${formatEther(balance)} BNB`);
        
        // Store the wallet address in environment for dashboard access
        process.env.WALLET_ADDRESS = wallet.address;
        logger.info(`Wallet address stored for dashboard display: ${wallet.address}`);
        
        if (balance.eq(0)) {
          logger.warn('Wallet has zero balance. Bot will monitor but cannot execute transactions.');
        }
      } catch (balanceError) {
        logger.error(`Error fetching balance: ${balanceError.message}`);
        balance = ethers.BigNumber.from(0);
      }
    } catch (error) {
      logger.error(`Failed to connect to blockchain: ${error.message}`);
      
      if (config.ENVIRONMENT.DEV_MODE || !useRealBlockchain) {
        // In development mode, we can proceed with simulated network
        logger.warn(`Using simulated network (BNB Chain) due to connection error`);
        logger.debug(`Network error details: ${error.message}`);
        
        // Use simulated network info for development
        networkInfo = { 
          name: 'bnb-simulated', 
          chainId: 56 
        };
        
        // Use simulated balance
        balance = ethers.utils.parseEther('10');
        logger.info(`Simulated wallet balance: ${formatEther(balance)} BNB`);
        
        // Start the blockchain simulator for development mode
        simulator.start();
        logger.info('Started blockchain simulator for development mode');
        usingSimulator = true;
        
        // Make sure provider exists and has basic functionality before attaching simulator
        if (!provider) {
          provider = new ethers.providers.JsonRpcProvider();
          logger.warn('Created a dummy provider for simulator mode');
        }
        
        // Override the provider methods with simulator methods
        provider.on = (event, listener) => simulator.on(event, listener);
        provider.removeAllListeners = (event) => simulator.removeAllListeners(event);
        provider.getTransaction = (txHash) => Promise.resolve(simulator.getTransaction(txHash));
      } else {
        // In production with USE_REAL_BLOCKCHAIN=true, we'll keep retrying
        logger.error(`Cannot connect to blockchain in production mode: ${error.message}`);
        logger.warn('Will continue retrying with all available RPC endpoints...');
        networkInfo = { name: 'bnb-recovery', chainId: 56 };
        balance = ethers.utils.parseEther('0'); // Zero balance until we connect
      }
    }
    
    logger.info(`Blockchain connectivity status: ${usingSimulator ? 'Using simulator' : 'Connected to real network'}`);
    
    
    // For development mode, we'll create simplified DEX interfaces
    // In production, these would be actual DEX interface implementations
    const dexes = {
      'PancakeSwap V2': { name: 'PancakeSwap V2', address: config.addresses.pancakeswapV2.router },
      'PancakeSwap V3': { name: 'PancakeSwap V3', address: config.addresses.pancakeswapV3.router },
      'ApeSwap': { name: 'ApeSwap', address: config.addresses.apeswap.router }
    };
    
    // Initialize core components
    const opportunityFinder = new OpportunityFinder(provider);
    const arbitrageCalculator = new ArbitrageCalculator(provider);
    const flashLoanExecutor = new FlashLoanExecutor(wallet);
    const mevProtection = new MevProtection(provider, wallet);
    
    // Connect to deployed contract if available
    let flashLoanContract = null;
    if (DEPLOYED_CONTRACT.IS_DEPLOYED && DEPLOYED_CONTRACT.ADDRESS) {
      try {
        // Load the contract ABI from the JSON file if not already loaded
        if (!DEPLOYED_CONTRACT.ABI) {
          const contractAbi = require('./src/abis/FlashLoan.json');
          DEPLOYED_CONTRACT.ABI = contractAbi;
        }
        
        // Create contract instance
        flashLoanContract = new ethers.Contract(
          DEPLOYED_CONTRACT.ADDRESS,
          DEPLOYED_CONTRACT.ABI,
          wallet
        );
        
        logger.info(`Connected to deployed FlashLoanArbitrage contract at ${DEPLOYED_CONTRACT.ADDRESS}`);
        
        // Store contract address in environment for dashboard access
        process.env.CONTRACT_ADDRESS = DEPLOYED_CONTRACT.ADDRESS;
      } catch (error) {
        logger.error(`Failed to connect to deployed contract: ${error.message}`);
        logger.warn('Bot will run without direct contract integration');
      }
    } else {
      logger.info('No deployed contract configured. Bot will run in monitoring mode only.');
    }
    
    // Initialize MEV strategies if enabled
    let mevStrategies = null;
    if (config.MEV.STRATEGIES?.ENABLED) {
      logger.info('Initializing advanced MEV strategies');
      
      // Create a dedicated WebSocket provider for mempool monitoring
      // This is essential for MEV detection
      const wsProvider = createWebSocketProvider();
      
      // If WebSocket provider is available, use it for MEV strategies
      // Otherwise, fall back to the HTTP provider (with limited functionality)
      const mevProvider = wsProvider || provider;
      
      // Connect the MEV strategies to the performance tracker to update dashboard stats
      mevStrategies = new MevStrategies(mevProvider, wallet, dexes, performanceTracker);
      
      // Start monitoring for MEV opportunities if enabled
      const monitoringStarted = mevStrategies.startMonitoring();
      if (monitoringStarted) {
        logger.info('MEV strategy monitoring started successfully');
        
        if (wsProvider) {
          logger.info('Using WebSocket connection for real-time mempool monitoring');
        } else {
          logger.warn('Using HTTP provider for mempool monitoring - MEV detection may be limited');
        }
      }
    }
    
    return {
      provider,
      wallet,
      dexes,
      opportunityFinder,
      arbitrageCalculator,
      flashLoanExecutor,
      mevProtection,
      mevStrategies
    };
  } catch (error) {
    logger.error(`Initialization failed: ${error.message}`);
    throw error;
  }
}

async function monitorAndExecute(components) {
  const { 
    provider,
    opportunityFinder, 
    arbitrageCalculator, 
    flashLoanExecutor, 
    mevProtection, 
    mevStrategies 
  } = components;
  
  // Store some statistics for logging
  let stats = {
    totalOpportunities: 0,
    profitableOpportunities: 0,
    executedArbitrages: 0,
    failedArbitrages: 0,
    totalProfit: ethers.BigNumber.from(0),
    mevStats: {
      backrunsDetected: 0,
      sandwichesDetected: 0,
      backrunsExecuted: 0,
      sandwichesExecuted: 0
    }
  };
  
  logger.info('Starting arbitrage monitoring cycle');
  
  while (true) {
    try {
      // Log ALL PAIR PRICES directly from token pairs
      logger.info('==========================================');
      logger.info('             ALL PAIR PRICES             ');
      logger.info('==========================================');
      
      // Get the tokenPairs from opportunityFinder
      const tokenPairs = opportunityFinder.getPairs ? 
                        await opportunityFinder.getPairs() : 
                        opportunityFinder.tokenPairs || [];
      
      for (const pair of tokenPairs) {
        try {
          const prices = await opportunityFinder.getPricesForPair(pair.tokenA, pair.tokenB);
          logger.info(`\n===== ${pair.name} =====`);
          
          if (prices && prices.length > 0) {
            prices.forEach(price => {
              if (price && price.price) {
                logger.info(`${price.dex}: ${price.price.toString()} (Fee: ${price.fee || 'N/A'}%)`);
              } else {
                logger.info(`${price.dex}: N/A`);
              }
            });
          } else {
            logger.info('No prices available');
          }
        } catch (error) {
          logger.error(`Error getting prices for ${pair.name}: ${error.message}`);
        }
      }
      logger.info('==========================================\n');
      
      // Find potential arbitrage opportunities
      const opportunities = await opportunityFinder.findOpportunities();
      
      if (opportunities.length === 0) {
        logger.debug('No arbitrage opportunities found in this cycle');
      } else {
        stats.totalOpportunities += opportunities.length;
        logger.info(`Found ${opportunities.length} potential arbitrage opportunities`);
        
        // For each opportunity, calculate profit and execute if profitable
        for (const opportunity of opportunities) {
          // Calculate expected profit considering all costs
          const { isProfitable, profit, flashLoanAmount, route, tokens } = 
            await arbitrageCalculator.calculateProfit(opportunity);
          
          if (isProfitable) {
            stats.profitableOpportunities++;
            logger.info(`Found profitable arbitrage opportunity:`);
            logger.info(`Route: ${route.join(' -> ')}`);
            logger.info(`Expected profit: ${formatEther(profit)} BNB`);
            logger.info(`Flash loan amount: ${formatEther(flashLoanAmount)} BNB`);
            
            // Apply MEV protection to avoid front-running
            const protectedParams = await mevProtection.protectTransaction({
              ...opportunity,
              flashLoanAmount,
              route,
              tokens
            });
            
            // Execute flash loan and arbitrage
            const txResult = await flashLoanExecutor.execute(
              tokens,
              flashLoanAmount,
              route,
              protectedParams
            );
            
            if (txResult.success) {
              stats.executedArbitrages++;
              stats.totalProfit = stats.totalProfit.add(txResult.actualProfit || profit);
              
              logger.info(`Arbitrage executed successfully: ${txResult.txHash}`);
              logger.info(`Actual profit: ${formatEther(txResult.actualProfit || profit)} BNB`);
              
              // Log cumulative stats every 5 successful arbitrages
              if (stats.executedArbitrages % 5 === 0) {
                logger.info(`===== ARBITRAGE STATS =====`);
                logger.info(`Total opportunities found: ${stats.totalOpportunities}`);
                logger.info(`Profitable opportunities: ${stats.profitableOpportunities}`);
                logger.info(`Successfully executed: ${stats.executedArbitrages}`);
                logger.info(`Failed executions: ${stats.failedArbitrages}`);
                logger.info(`Total profit: ${formatEther(stats.totalProfit)} BNB`);
                logger.info(`===========================`);
              }
            } else {
              stats.failedArbitrages++;
              logger.error(`Arbitrage execution failed: ${txResult.error}`);
            }
          } else {
            logger.debug(`Opportunity not profitable after costs: ${route?.join(' -> ')}`);
          }
        }
      }
      
      // Process advanced MEV strategies if enabled
      if (mevStrategies && config.MEV.STRATEGIES.ENABLED) {
        // Get MEV stats
        const mevStats = mevStrategies.getStats();
        
        // Log MEV statistics periodically
        if (mevStats.backrunsDetected + mevStats.sandwichesDetected > 0 || 
            stats.mevStats.backrunsDetected + stats.mevStats.sandwichesDetected === 0) {
          // Update local stats with values from MEV strategy
          stats.mevStats.backrunsDetected = mevStats.backrunsDetected;
          stats.mevStats.sandwichesDetected = mevStats.sandwichesDetected;
          stats.mevStats.backrunsExecuted = mevStats.backrunsExecuted;
          stats.mevStats.sandwichesExecuted = mevStats.sandwichesExecuted;
          stats.mevStats.hourlyProfit = mevStats.hourlyProfit;
          stats.mevStats.pendingTransactions = mevStats.pendingTransactions;
          
          // Update performance tracker with current MEV stats
          if (performanceTracker && performanceTracker.stats && performanceTracker.stats.mevStats) {
            performanceTracker.stats.mevStats.backrunsDetected = mevStats.backrunsDetected;
            performanceTracker.stats.mevStats.sandwichesDetected = mevStats.sandwichesDetected;
            performanceTracker.stats.mevStats.backrunsExecuted = mevStats.backrunsExecuted;
            performanceTracker.stats.mevStats.sandwichesExecuted = mevStats.sandwichesExecuted;
            performanceTracker.stats.mevStats.hourlyProfit = mevStats.hourlyProfit;
            
            // Push latest stats to dashboard
            performanceTracker.pushStatsToDashboard();
          }
          
          logger.info(`===== MEV STRATEGY STATS =====`);
          logger.info(`Backruns detected: ${mevStats.backrunsDetected}`);
          logger.info(`Backruns executed: ${mevStats.backrunsExecuted}`);
          logger.info(`Sandwiches detected: ${mevStats.sandwichesDetected}`);
          logger.info(`Sandwiches executed: ${mevStats.sandwichesExecuted}`);
          logger.info(`Hourly profit: ${formatEther(mevStats.hourlyProfit)} BNB`);
          logger.info(`Pending transactions monitored: ${mevStats.pendingTransactions}`);
          logger.info(`=============================`);
        }
      }
      
      // Monitor network conditions (every 15 seconds)
      try {
        // Update gas price more frequently for better dashboard responsiveness
        const currentTimestamp = Date.now();
        if (!global.lastGasPriceFetch || (currentTimestamp - global.lastGasPriceFetch) >= 15000) {
          // Get current gas price to monitor network congestion
          const currentGasPrice = await getSafeGasPrice(provider);
          global.lastGasPriceFetch = currentTimestamp;
          
          // Make sure safetyManager is properly initialized
          if (safetyManager && typeof safetyManager.updateGasPrice === 'function') {
            // Update safety manager with current gas price - enforce minimum 1.0 Gwei on BNB Chain
            const gasPriceGwei = BigNumber.isBigNumber(currentGasPrice) ? 
                                parseFloat(currentGasPrice.div(1e9).toString()) : 
                                (typeof currentGasPrice === 'number' ? currentGasPrice : 1.0);
            
            // Force to minimum 1.0 Gwei which is the standard baseline on BNB Chain
            const normalizedGasPrice = Math.max(1.0, gasPriceGwei);
            safetyManager.updateGasPrice(normalizedGasPrice);
            
            // Get the complete safety status with updates for gas price, network congestion, and competitive bots
            const safetyStatus = safetyManager.getStatus();
            
            // Log the gas price being sent to the dashboard for debugging
            logger.info(`Sending gas price to dashboard: ${safetyStatus.networkCongestion.currentGasPrice.toFixed(1)} Gwei`);
            
            // Always update the dashboard with latest safety status
            if (performanceTracker && performanceTracker.dashboardServer && 
                typeof performanceTracker.dashboardServer.updateSafetyStatus === 'function') {
              performanceTracker.dashboardServer.updateSafetyStatus(safetyStatus);
            }
            
            // Check if we should block operations 
            const blockStatus = typeof safetyManager.shouldBlockOperations === 'function' ? 
                safetyManager.shouldBlockOperations() : { blocked: false };
            
            if (blockStatus.blocked) {
              // Operations are blocked due to safety measures
              if (blockStatus.reason === 'cooldown') {
                logger.warn(`Safety cooldown active - pausing operations for ${Math.ceil(safetyStatus.cooldown.remainingTime / 60000)} minutes`);
                performanceTracker.updateBotStatus('paused', `Safety cooldown: ${blockStatus.message}`);
              } else if (blockStatus.reason === 'highGasPrice') {
                logger.warn('Network congestion detected - temporarily skipping low-profit opportunities');
                performanceTracker.updateBotStatus('warning', `Network congestion: ${blockStatus.message}`);
              }
            } else if (safetyStatus.competitiveBots.detected) {
              // Competitive bots detected but still operating with adjusted slippage
              logger.warn(`Competitive bots detected - increasing slippage tolerance by ${(safetyStatus.competitiveBots.slippageMultiplier - 1) * 100}%`);
              performanceTracker.updateBotStatus('warning', `Competitive bots detected, adjusting slippage (${safetyStatus.competitiveBots.slippageMultiplier.toFixed(2)}x)`);
            } else {
              // No safety issues, ensure status is normal
              performanceTracker.updateBotStatus('running', 'Operating normally');
            }
            
            // Log safety status every 10 cycles (adjust based on your monitoring interval)
            if (Math.random() < 0.1) { // 10% chance to log status each cycle
              logger.info('===== SAFETY STATUS =====');
              logger.info(`Cooldown: ${safetyStatus.cooldown.active ? 'ACTIVE' : 'inactive'}`);
              logger.info(`Consecutive failures: ${safetyStatus.cooldown.consecutiveFailures}`);
              logger.info(`Remaining cooldown: ${Math.ceil(safetyStatus.cooldown.remainingTime / 60000)} minutes`);
              logger.info(`Network congestion: ${safetyStatus.networkCongestion.isHighGasPrice ? 'DETECTED' : 'normal'}`);
              logger.info(`Current gas price: ${safetyStatus.networkCongestion.currentGasPrice.toFixed(1)} Gwei`);
              logger.info(`Competitive bots: ${safetyStatus.competitiveBots.detected ? 'DETECTED' : 'not detected'}`);
              logger.info(`Slippage multiplier: ${safetyStatus.competitiveBots.slippageMultiplier.toFixed(2)}x`);
              logger.info('==========================');
            }
          } else {
            // If safetyManager is not available, just set status to normal
            performanceTracker.updateBotStatus('running', 'Operating normally (safety checks disabled)');
          }
        }
      } catch (gasError) {
        logger.error(`Error monitoring network conditions: ${gasError.message}`);
      }
      
      // Wait for next cycle
      await sleep(config.MONITORING_INTERVAL);
    } catch (error) {
      logger.error(`Error in monitoring cycle: ${error.message}`);
      await sleep(config.ERROR_RETRY_INTERVAL);
    }
  }
}

// Main execution flow
(async () => {
  try {
    // Initialize bot components
    const components = await initialize();
    
    // Update performance tracker (without starting the dashboard server)
    performanceTracker.startTracking();
    logger.info('Performance tracker started');
    
    // Update initial bot status
    performanceTracker.updateBotStatus('running', 'Bot initialized successfully');
    
    // Start monitoring and execution
    await monitorAndExecute(components);
  } catch (error) {
    logger.error(`Critical error, shutting down: ${error.message}`);
    performanceTracker.updateBotStatus('error', error.message);
    process.exit(1);
  }
})();
