/**
 * Manual deployment script for Flash Loan Arbitrage contract
 * Does not rely on Hardhat artifacts or prompt responses
 */

const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

// Get private key and RPC URL from environment
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const BNB_TESTNET_RPC_URL = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';

// Default BNB Chain addresses for DEXes
const PancakeV3Factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const PancakeV2Router = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
const ApeSwapRouter = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";
const BiSwapRouter = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// Load contract ABI and bytecode
async function loadContractData() {
  try {
    // Read the Solidity contract file
    const contractPath = './contracts/FlashLoanArbitrage_v5.sol';
    const contractSource = fs.readFileSync(contractPath, 'utf8');
    
    console.log("Contract source loaded successfully. Deploying contract directly...");
    
    return contractSource;
  } catch (error) {
    console.error("Error loading contract data:", error);
    process.exit(1);
  }
}

async function main() {
  console.log("Starting manual deployment of FlashLoanArbitrage_v5 contract...");
  
  // Load contract data
  await loadContractData();
  
  if (!PRIVATE_KEY) {
    console.error("ERROR: Private key is not set in .env file");
    process.exit(1);
  }
  
  // Create provider and wallet
  const provider = new ethers.providers.JsonRpcProvider(BNB_TESTNET_RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // Log deployer address and balance
  console.log(`Deploying contracts with account: ${wallet.address}`);
  const balance = await wallet.getBalance();
  console.log(`Account balance: ${ethers.utils.formatEther(balance)} BNB`);
  
  try {
    // Confirm on testnet
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chain ID: ${network.chainId})`);
    
    if (network.chainId !== 97) {
      console.warn("WARNING: Not connected to BNB Chain Testnet (chainId 97)");
      process.exit(1);
    }
    
    // Compile the contract using ethers.js ContractFactory (direct deployment)
    console.log("Deploying FlashLoanArbitrage_v5 contract...");
    
    // Execute the direct deployment
    const deployCommand = `npx solc --optimize --optimize-runs 200 --abi --bin contracts/FlashLoanArbitrage_v5.sol -o build`;
    require('child_process').execSync(deployCommand, {stdio: 'inherit'});
    
    console.log("Contract compiled successfully. Loading artifacts...");
    
    // Load the compiled contract ABI and bytecode
    const contractAbi = JSON.parse(fs.readFileSync('./build/FlashLoanArbitrage.abi', 'utf8'));
    const contractBin = fs.readFileSync('./build/FlashLoanArbitrage.bin', 'utf8');
    
    // Create contract factory
    const factory = new ethers.ContractFactory(contractAbi, contractBin, wallet);
    
    // Deploy the contract
    console.log("Sending deployment transaction...");
    const deployTransaction = factory.getDeployTransaction();
    deployTransaction.gasLimit = ethers.utils.hexlify(4000000); // Set explicit gas limit
    
    const tx = await wallet.sendTransaction(deployTransaction);
    console.log(`Deployment transaction sent: ${tx.hash}`);
    console.log("Waiting for transaction confirmation...");
    
    const receipt = await tx.wait();
    const contractAddress = receipt.contractAddress;
    console.log(`Contract deployed to: ${contractAddress}`);
    
    // Initialize the contract
    console.log("Initializing contract...");
    const contract = new ethers.Contract(contractAddress, contractAbi, wallet);
    const initTx = await contract.initialize(
      PancakeV3Factory,
      PancakeV2Router,
      ApeSwapRouter,
      BiSwapRouter,
      { gasLimit: ethers.utils.hexlify(3000000) }
    );
    
    console.log(`Initialization transaction sent: ${initTx.hash}`);
    console.log("Waiting for initialization confirmation...");
    
    await initTx.wait();
    console.log("Contract initialized successfully!");
    
    // Verify owner
    const owner = await contract.owner();
    console.log(`Contract owner set to: ${owner}`);
    
    // Deployment successful
    console.log("\nDeployment completed successfully!");
    console.log("\n=== Copy the following into your index.js file ===");
    console.log(`const DEPLOYED_CONTRACT = {
  IS_DEPLOYED: true,
  ADDRESS: "${contractAddress}"
};`);
    
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`Error during deployment: ${error.stack}`);
    process.exit(1);
  });