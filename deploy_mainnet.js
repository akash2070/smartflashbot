/**
 * Flash Loan Arbitrage Contract Direct Mainnet Deployment Script
 * 
 * This script deploys the FlashLoanArbitrage_v5 contract to BNB Chain Mainnet
 * Using Hardhat with direct provider initialization
 */

// Import direct dependencies to avoid Hardhat config issues
const ethers = require('ethers');
const hre = require('hardhat');
const { upgrades } = require('hardhat');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("FLASH LOAN ARBITRAGE CONTRACT MAINNET DEPLOYMENT");
    console.log("=".repeat(80));
    
    console.log("\n⚠️ MAINNET DEPLOYMENT - Real funds will be used");
    console.log("\nVerifying environment setup...");
    
    // Get environment variables
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    
    // Multiple RPC URLs to try
    const RPC_URLS = [
      process.env.BNB_RPC_URL_KEY || 'https://bsc-dataseed.binance.org/',
      'https://bsc-dataseed1.binance.org/',
      'https://bsc-dataseed2.binance.org/',
      'https://bsc-dataseed3.binance.org/',
      'https://bsc-dataseed4.binance.org/',
      'https://binance.nodereal.io',
      'https://bsc-mainnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3',
      'https://rpc.ankr.com/bsc',
      'https://bsc.publicnode.com',
    ];
    
    if (!PRIVATE_KEY) {
      console.error("ERROR: PRIVATE_KEY not found in environment variables");
      process.exit(1);
    }
    
    // Try connecting with each RPC URL
    console.log("Connecting to BNB Chain Mainnet...");
    let provider;
    let wallet;
    let connected = false;
    
    for (const url of RPC_URLS) {
      try {
        console.log(`Trying RPC URL: ${url}`);
        provider = new ethers.providers.JsonRpcProvider(url);
        
        // Test the connection with a simple call
        await provider.getBlockNumber();
        
        wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        connected = true;
        
        console.log(`✓ Successfully connected to: ${url}`);
        break;
      } catch (error) {
        console.log(`✗ Failed to connect to: ${url}`);
        console.log(`  Error: ${error.message}`);
      }
    }
    
    if (!connected) {
      console.error("ERROR: Failed to connect to any BNB Chain RPC endpoint");
      process.exit(1);
    }
    
    console.log(`Deployer address: ${wallet.address}`);
    const balance = await wallet.getBalance();
    console.log(`Account balance: ${ethers.utils.formatEther(balance)} BNB`);
    
    // Verify network
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (network.chainId !== 56) {
      console.error("ERROR: Not connected to BNB Chain Mainnet (chainId 56)");
      process.exit(1);
    }
    
    // Check if balance is sufficient
    const minBalance = ethers.utils.parseEther("0.01");
    if (balance.lt(minBalance)) {
      console.error(`ERROR: Insufficient balance. Need at least 0.01 BNB for deployment.`);
      process.exit(1);
    }
    
    // Get contract factory
    console.log("\nCompiling contract directly...");
    
    // Use hre (hardhat runtime environment) to compile and get the contract factory
    const hardhatEthers = hre.ethers;
    
    // Create signer from wallet private key that works with hardhat
    const hardhatWallet = new hardhatEthers.Wallet(PRIVATE_KEY, new hardhatEthers.providers.JsonRpcProvider(provider.connection.url));
    
    // Get contract factory using hardhat
    const FlashLoanArbitrage = await hardhatEthers.getContractFactory("FlashLoanArbitrage_v5", hardhatWallet);
    
    // Estimate deployment gas
    console.log("\nEstimating deployment gas cost...");
    const deploymentGasEstimate = await ethers.provider.estimateGas(
      FlashLoanArbitrage.getDeployTransaction().data
    );
    console.log(`Estimated deployment gas: ${deploymentGasEstimate.toString()}`);
    
    // Get current gas price and add 10% buffer
    const gasPrice = await provider.getGasPrice();
    const bufferedGasPrice = gasPrice.mul(110).div(100);
    console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} Gwei`);
    console.log(`Using gas price with buffer: ${ethers.utils.formatUnits(bufferedGasPrice, "gwei")} Gwei`);
    
    // Calculate deployment cost
    const deploymentCost = deploymentGasEstimate.mul(bufferedGasPrice);
    console.log(`Estimated deployment cost: ${ethers.utils.formatEther(deploymentCost)} BNB`);
    
    if (balance.lt(deploymentCost.mul(120).div(100))) {
      console.warn(`WARNING: Balance may be insufficient to cover deployment and initialization.`);
      console.warn(`Recommended balance: ${ethers.utils.formatEther(deploymentCost.mul(120).div(100))} BNB`);
      
      // Ask for confirmation to proceed
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const proceed = await new Promise(resolve => {
        readline.question('Do you want to proceed with deployment? (y/n): ', answer => {
          readline.close();
          resolve(answer.toLowerCase() === 'y');
        });
      });
      
      if (!proceed) {
        console.log("Deployment canceled by user.");
        process.exit(0);
      }
    }
    
    // Deploy implementation contract
    console.log("\nDeploying Flash Loan Arbitrage contract via UUPS Proxy...");
    console.log("This will deploy both implementation and proxy contracts.");
    
    const deploymentOptions = {
      gasPrice: bufferedGasPrice
    };
    
    // Deploy using OpenZeppelin UUPS proxy pattern
    const pancakeSwapV3Factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"; // Mainnet address
    const flashLoanContract = await upgrades.deployProxy(
      FlashLoanArbitrage, 
      [pancakeSwapV3Factory],
      { 
        kind: "uups",
        initializer: "initialize",
        ...deploymentOptions
      }
    );
    
    console.log(`Deployment transaction sent! Waiting for confirmation...`);
    console.log(`Transaction hash: ${flashLoanContract.deployTransaction.hash}`);
    
    // Wait for contract deployment
    await flashLoanContract.deployed();
    
    console.log(`\n✅ CONTRACT DEPLOYED SUCCESSFULLY!`);
    console.log(`Proxy address: ${flashLoanContract.address}`);
    
    // Get implementation address
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(flashLoanContract.address);
    console.log(`Implementation address: ${implementationAddress}`);
    
    // Verify contract settings
    console.log("\nVerifying contract settings...");
    const owner = await flashLoanContract.owner();
    const factoryAddress = await flashLoanContract.PANCAKESWAP_V3_FACTORY();
    const mevProtection = await flashLoanContract.mevProtectionEnabled();
    const backrunEnabled = await flashLoanContract.backrunEnabled();
    const frontrunEnabled = await flashLoanContract.frontrunEnabled();
    
    console.log(`Owner: ${owner}`);
    console.log(`PancakeSwap V3 Factory: ${factoryAddress}`);
    console.log(`MEV Protection Enabled: ${mevProtection}`);
    console.log(`Backrun Enabled: ${backrunEnabled}`);
    console.log(`Frontrun Enabled: ${frontrunEnabled}`);
    
    // Save deployment info
    const deploymentInfo = {
      network: "BSC Mainnet",
      chainId: network.chainId,
      proxyAddress: flashLoanContract.address,
      implementationAddress: implementationAddress,
      owner: owner,
      deploymentTx: flashLoanContract.deployTransaction.hash,
      factoryAddress: factoryAddress,
      mevProtection: mevProtection,
      backrunEnabled: backrunEnabled,
      frontrunEnabled: frontrunEnabled,
      deploymentDate: new Date().toISOString()
    };
    
    const deploymentsDir = path.join(__dirname, 'deployments');
    if (!fs.existsSync(deploymentsDir)) {
      fs.mkdirSync(deploymentsDir);
    }
    
    fs.writeFileSync(
      path.join(deploymentsDir, 'mainnet-deployment.json'),
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log(`\nDeployment info saved to deployments/mainnet-deployment.json`);
    
    // Deployment summary
    console.log("\n" + "=".repeat(80));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(80));
    console.log(`Proxy Address: ${flashLoanContract.address}`);
    console.log(`Implementation Address: ${implementationAddress}`);
    console.log(`Owner Address: ${owner}`);
    console.log(`Deployment Transaction: ${flashLoanContract.deployTransaction.hash}`);
    console.log(`Network: BNB Chain Mainnet (Chain ID: ${network.chainId})`);
    console.log("=".repeat(80));
    
    console.log("\n✅ MAINNET DEPLOYMENT COMPLETE!");
    console.log("To use this contract with the arbitrage bot, update the config.js file with the proxy address.");
    
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error during deployment:", error);
    process.exit(1);
  });