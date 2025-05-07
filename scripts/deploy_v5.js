/**
 * Direct deployment script for FlashLoanArbitrage_v5 contract
 * Optimized for OpenZeppelin 5.3.0 compatibility
 */

const { ethers, upgrades } = require("hardhat");

// Default BNB Chain addresses for DEXes
const PancakeV3Factory = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const PancakeV2Router = "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
const ApeSwapRouter = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";
const BiSwapRouter = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

async function main() {
  console.log("Starting deployment of FlashLoanArbitrage_v5 contract...");
  const [deployer] = await ethers.getSigners();

  // Log deployer address and balance
  console.log(`Deploying contracts with account: ${deployer.address}`);
  const balance = await deployer.getBalance();
  console.log(`Account balance: ${ethers.utils.formatEther(balance)} BNB`);

  // Get contract factory
  console.log("Compiling contract...");
  const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
  
  // Deploy using OpenZeppelin upgrades plugin
  console.log("Deploying contract...");
  const flashLoanArbitrage = await upgrades.deployProxy(
    FlashLoanArbitrage,
    [
      PancakeV3Factory,
      PancakeV2Router,
      ApeSwapRouter,
      BiSwapRouter
    ],
    { 
      initializer: 'initialize',
      kind: 'uups'
    }
  );

  await flashLoanArbitrage.deployed();
  
  // Log contract addresses
  console.log(`FlashLoanArbitrage proxy deployed to: ${flashLoanArbitrage.address}`);
  
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(
    flashLoanArbitrage.address
  );

  console.log(`Implementation contract deployed to: ${implementationAddress}`);
  console.log("Deployment completed successfully!");
  
  // Verify owner and settings
  const owner = await flashLoanArbitrage.owner();
  console.log(`Contract owner set to: ${owner}`);
  
  console.log("Deployment verification successful!");
  
  // Save deployed address for the bot to use
  console.log("") 
  console.log("=== Copy the following into your index.js file ===");
  console.log(`const DEPLOYED_CONTRACT = {
  IS_DEPLOYED: true,
  ADDRESS: "${flashLoanArbitrage.address}"
};`);
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(`Error during deployment: ${error.stack}`);
    process.exit(1);
  });