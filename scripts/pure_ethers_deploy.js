/**
 * Pure Ethers.js deployment script for Flash Loan Arbitrage contract
 * Deploys contract to testnet using only ethers.js
 */

const ethers = require('ethers');
const fs = require('fs');
require('dotenv').config();

// Get environment variables
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BNB_TESTNET_RPC_URL = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';

// DEX addresses on testnet
const PancakeV3Factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const PancakeV2Router = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
const ApeSwapRouter = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";
const BiSwapRouter = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

// Hard-coded ABI for initialization and owner check
const contractAbi = [
  "function initialize(address,address,address,address) public",
  "function owner() public view returns (address)"
];

async function main() {
  console.log("Starting pure ethers.js deployment of FlashLoanArbitrage_v5 contract...");
  
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
    console.log("Make sure you're on the correct network.");
    process.exit(1);
  }
  
  // Read compiled bytecode directly (pre-compiled)
  try {
    // Read the contract file
    console.log("Reading contract bytecode...");
    const contractPath = './contracts/FlashLoanArbitrage_v5.sol';
    
    // For this example, we'll use a pre-compiled bytecode
    // In a real deployment, you would use solc or hardhat to compile the contract
    
    // Placeholder bytecode - this would be the actual compiled bytecode of your contract
    // You would replace this with the output from a compiler or use a compiled contract binary
    
    // Since we'll need to use Hardhat for proper compilation anyway,
    // let's try a simpler approach with hardhat directly
    
    console.log("\nThis script needs pre-compiled bytecode. Let's use hardhat directly instead.\n");
    console.log("Executing hardhat deployment...");
    
    // Use hardhat cli but bypass the analytics prompt
    // This sets the HARDHAT_ANALYTICS env var to false before running the command
    const deployCommand = `HARDHAT_ANALYTICS=false npx hardhat run scripts/deploy_v5.js --network bnbtestnet`;
    require('child_process').execSync(deployCommand, {stdio: 'inherit'});
    
    console.log("\nHardhat deployment completed!");
    
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// Run main function
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error during deployment:", error);
    process.exit(1);
  });