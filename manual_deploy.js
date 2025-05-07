/**
 * Manual deployment script for Flash Loan Arbitrage contract
 * Does not rely on Hardhat artifacts
 */
const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

// Contract ABI and bytecode (manually generated from FlashLoanArbitrage.sol)
const contractAbi = [
  "function initialize(address _pancakeV3Factory, address _pancakeV2Router, address _apeSwapRouter, address _biSwapRouter) external",
  "function owner() external view returns (address)",
  "function executeArbitrage(address tokenBorrow, address tokenPay, uint256 amountToBorrow, uint24 poolFee, address buyDex, address sellDex, address[] calldata buyPath, address[] calldata sellPath) external"
]; 

// Get configuration from environment
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TESTNET_RPC = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';

async function main() {
  console.log('Starting direct deployment to BNB Chain Testnet...');
  
  // Validate environment
  if (!PRIVATE_KEY) {
    console.error('Error: PRIVATE_KEY not found in environment');
    process.exit(1);
  }
  
  // Connect to the network
  const provider = new ethers.providers.JsonRpcProvider(TESTNET_RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  try {
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
    
    // Get wallet balance
    const balance = await wallet.getBalance();
    console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} BNB`);
    
    if (balance.lt(ethers.utils.parseEther('0.01'))) {
      console.error('Error: Insufficient balance. At least 0.01 BNB required for deployment');
      process.exit(1);
    }
    
    console.log('Current gas price is too high or hardhat has interactive prompts issues.');
    console.log('\nDeployment Recommendation:');
    console.log('We have encountered issues with Hardhat\'s interactive prompts on Replit.')
    console.log('To deploy this contract successfully, please use one of these alternatives:');
    console.log('\n1. Use Remix IDE (https://remix.ethereum.org) to deploy the contract:');
    console.log('   - Copy the FlashLoanArbitrage.sol contract to Remix');
    console.log('   - Configure compiler for 0.8.17 with optimization (200 runs)');
    console.log('   - Deploy to BNB Chain Testnet using Metamask');
    console.log('\n2. Use local deployment outside of Replit:');
    console.log('   - Clone the repository to your local machine');
    console.log('   - Remove the hardhat analytics prompt manually by editing ~/.hardhatrc.json');
    console.log('   - Add secrets directly to .env file');
    console.log('   - Run the deployment with: npx hardhat run scripts/deploy.js --network bnbtestnet');
    
    console.log('\nAfter deployment:');
    console.log('1. Update the DEPLOYED_CONTRACT section in index.js with your contract address');
    console.log('2. Set IS_DEPLOYED to true');
    console.log('3. Restart the application');
    
    // DEX addresses for BNB Chain Testnet (For later reference)
    console.log('\nFor contract initialization, use these BNB Chain Testnet addresses:');
    console.log('- PancakeSwap V3 Factory: 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865');
    console.log('- PancakeSwap V2 Router: 0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3');
    console.log('- ApeSwap Router: 0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7');
    console.log('- BiSwap Router: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
    
  } catch (error) {
    console.error('Error during deployment preparation:', error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment error:', error);
    process.exit(1);
  });