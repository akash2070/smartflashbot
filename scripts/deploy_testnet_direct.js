/**
 * Direct deployment script for Flash Loan Arbitrage contract to testnet
 * No Hardhat dependencies to avoid prompts
 */

const ethers = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Access environment variables
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BNB_TESTNET_RPC_URL = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';

// Default BNB Chain addresses for DEXes (testnet)
const PancakeV3Factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const PancakeV2Router = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
const ApeSwapRouter = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";
const BiSwapRouter = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// Simplified ABI for the contract's initialize function
const initializeAbi = [
  {
    "inputs": [
      { "name": "_pancakeV3Factory", "type": "address" },
      { "name": "_pancakeV2Router", "type": "address" },
      { "name": "_apeSwapRouter", "type": "address" },
      { "name": "_biSwapRouter", "type": "address" }
    ],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function main() {
  console.log("Starting direct deployment of FlashLoanArbitrage_v5 contract to testnet...");
  
  if (!PRIVATE_KEY) {
    console.error("ERROR: PRIVATE_KEY not found in environment variables");
    process.exit(1);
  }
  
  // Create provider and wallet
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
    const proceed = await prompt("Do you want to proceed anyway? (y/n) ");
    if (proceed.toLowerCase() !== 'y') {
      console.log("Deployment aborted.");
      process.exit(0);
    }
  }
  
  try {
    console.log("Preparing contract bytecode...");
    
    // Read contract bytecode from file
    // This approach requires a pre-compiled contract
    // For simplicity in this example, we'll use a mock bytecode
    // In a real scenario, you would compile the contract first
    
    // Compile the contract
    console.log("Compiling contract...");
    const solcCommand = `npx solc --optimize --optimize-runs 200 --bin --abi contracts/FlashLoanArbitrage_v5.sol -o build --overwrite`;
    require('child_process').execSync(solcCommand, {stdio: 'inherit'});
    
    console.log("Reading contract artifacts...");
    const contractBin = fs.readFileSync('./build/FlashLoanArbitrage.bin', 'utf8');
    const contractAbi = JSON.parse(fs.readFileSync('./build/FlashLoanArbitrage.abi', 'utf8'));
    
    // Deploy contract
    console.log("Deploying contract...");
    const factory = new ethers.ContractFactory(contractAbi, '0x' + contractBin, wallet);
    
    // Set deployment parameters
    const gasPrice = ethers.utils.parseUnits('5', 'gwei'); // 5 Gwei
    const gasLimit = 4500000;
    
    console.log(`Using gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
    console.log(`Using gas limit: ${gasLimit}`);
    
    // Deploy contract
    const deployStartTime = Date.now();
    console.log("Sending deployment transaction...");
    const contract = await factory.deploy({
      gasPrice,
      gasLimit
    });
    
    console.log(`Deployment transaction sent: ${contract.deployTransaction.hash}`);
    console.log("Waiting for transaction confirmation...");
    
    // Wait for deployment to be confirmed
    await contract.deployed();
    
    const deployEndTime = Date.now();
    const deploymentDuration = (deployEndTime - deployStartTime) / 1000;
    
    console.log(`Contract deployed at address: ${contract.address}`);
    console.log(`Deployment time: ${deploymentDuration.toFixed(2)} seconds`);
    
    // Initialize the contract
    console.log("\nInitializing contract...");
    const initTx = await contract.initialize(
      PancakeV3Factory,
      PancakeV2Router, 
      ApeSwapRouter,
      BiSwapRouter,
      {
        gasPrice,
        gasLimit: 3000000
      }
    );
    
    console.log(`Initialization transaction sent: ${initTx.hash}`);
    console.log("Waiting for initialization confirmation...");
    
    const initReceipt = await initTx.wait();
    console.log(`Initialization confirmed in block ${initReceipt.blockNumber}`);
    
    // Verify contract ownership
    const owner = await contract.owner();
    console.log(`Contract owner: ${owner}`);
    
    if (owner.toLowerCase() === wallet.address.toLowerCase()) {
      console.log("✅ Owner verification successful!");
    } else {
      console.log("❌ Owner verification failed!");
    }
    
    // Deployment successful
    console.log("\n✅ Deployment completed successfully!");
    console.log(`Implementation contract address: ${contract.address}`);
    
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

// Simple prompt function for console input
function prompt(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdin.resume();
    stdout.write(question);
    
    stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

// Run the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error during deployment:", error);
    process.exit(1);
  });