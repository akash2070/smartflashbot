/**
 * Flash Loan Arbitrage Contract Deployment Script
 * This script deploys the FlashLoanArbitrage_v5 contract to BNB Chain Testnet
 * Using direct compilation and deployment method
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ethers = require('ethers');
require('dotenv').config();

// DEX addresses on BNB Chain testnet
const PancakeV3Factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const PancakeV2Router = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
const ApeSwapRouter = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";
const BiSwapRouter = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("FLASH LOAN ARBITRAGE CONTRACT DEPLOYMENT");
    console.log("=".repeat(80));
    
    // Get environment variables
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const BNB_TESTNET_RPC_URL = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';
    
    if (!PRIVATE_KEY) {
      console.error("ERROR: PRIVATE_KEY not found in environment variables");
      process.exit(1);
    }
    
    // Create temp directory for modified contract
    const buildDir = './build_temp';
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir);
    }
    
    // Set up provider and wallet
    console.log("Connecting to BNB Chain Testnet...");
    const provider = new ethers.providers.JsonRpcProvider(BNB_TESTNET_RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`Deployer address: ${wallet.address}`);
    const balance = await wallet.getBalance();
    console.log(`Account balance: ${ethers.utils.formatEther(balance)} BNB`);
    
    // Verify network
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (network.chainId !== 97) {
      console.warn("WARNING: Not connected to BNB Chain Testnet (chainId 97)");
      console.log("Cannot proceed with deployment. Please check your RPC URL.");
      process.exit(1);
    }
    
    // Use the standalone contract
    console.log("\nPreparing contract for compilation...");
    const standaloneContractPath = `${buildDir}/FlashLoanArbitrage_Standalone.sol`;
    
    // Compile the contract with solc
    console.log("Compiling contract with solc...");
    try {
      const compileCommand = `solc --bin --abi --optimize --optimize-runs 200 -o ${buildDir} ${standaloneContractPath}`;
      execSync(compileCommand);
      console.log("Contract compilation successful!");
    } catch (error) {
      console.error("Contract compilation failed:", error.message);
      process.exit(1);
    }
    
    // Read compiled artifacts
    console.log("\nReading compiled contract artifacts...");
    const contractBin = fs.readFileSync(`${buildDir}/FlashLoanArbitrage.bin`, 'utf8');
    const contractAbi = JSON.parse(fs.readFileSync(`${buildDir}/FlashLoanArbitrage.abi`, 'utf8'));
    
    console.log(`Contract bytecode size: ${contractBin.length / 2} bytes`);
    
    // Create factory and deploy
    console.log("\nCreating contract factory...");
    const factory = new ethers.ContractFactory(contractAbi, '0x' + contractBin, wallet);
    
    console.log("Deploying contract...");
    const gasPrice = ethers.utils.parseUnits('5', 'gwei'); // 5 Gwei
    const gasLimit = 4500000; // Higher limit for complex contract
    
    console.log(`Using gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
    console.log(`Using gas limit: ${gasLimit}`);
    
    // Deploy contract
    const contract = await factory.deploy({
      gasPrice: gasPrice,
      gasLimit: gasLimit
    });
    
    console.log(`\nDeployment transaction sent: ${contract.deployTransaction.hash}`);
    console.log("Waiting for transaction confirmation (this may take a minute)...");
    
    await contract.deployed();
    
    console.log(`\n✅ IMPLEMENTATION CONTRACT DEPLOYED SUCCESSFULLY!`);
    console.log(`Contract address: ${contract.address}`);
    
    // Initialize the contract
    console.log("\nInitializing contract...");
    const initTx = await contract.initialize(
      PancakeV3Factory,
      PancakeV2Router,
      ApeSwapRouter,
      BiSwapRouter,
      {
        gasPrice: gasPrice,
        gasLimit: 3000000
      }
    );
    
    console.log(`Initialization transaction sent: ${initTx.hash}`);
    console.log("Waiting for initialization confirmation...");
    
    const initReceipt = await initTx.wait();
    
    console.log(`\n✅ CONTRACT INITIALIZATION SUCCESSFUL!`);
    console.log(`Transaction confirmed in block: ${initReceipt.blockNumber}`);
    
    // Verify contract ownership
    const owner = await contract.owner();
    console.log(`\nContract owner: ${owner}`);
    
    if (owner.toLowerCase() === wallet.address.toLowerCase()) {
      console.log("✅ Owner verification successful!");
    } else {
      console.error("❌ Owner verification failed!");
    }
    
    // Deployment summary
    console.log("\n" + "=".repeat(80));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(80));
    console.log(`Contract Address: ${contract.address}`);
    console.log(`Owner Address: ${owner}`);
    console.log(`Deployment Transaction: ${contract.deployTransaction.hash}`);
    console.log(`Initialization Transaction: ${initTx.hash}`);
    console.log(`Network: BNB Chain Testnet (Chain ID: 97)`);
    console.log("=".repeat(80));
    
    console.log("\n=== Copy the following into your index.js file ===");
    console.log(`const DEPLOYED_CONTRACT = {
  IS_DEPLOYED: true,
  ADDRESS: "${contract.address}"
};`);
    
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