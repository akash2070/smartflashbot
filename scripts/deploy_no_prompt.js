/**
 * Deployment script for Flash Loan Arbitrage contract
 * With automatic analytics prompt bypass
 */
const { ethers, upgrades } = require('hardhat');
const fs = require('fs');
const path = require('path');

// Immediately answer the analytics prompt by writing to .hardhatrc.json
function bypassAnalyticsPrompt() {
  try {
    // Create a .hardhatrc.json file in the home directory with analytics disabled
    const homedir = require('os').homedir();
    const hardhatrcPath = path.join(homedir, '.hardhatrc.json');
    fs.writeFileSync(hardhatrcPath, JSON.stringify({ analytics: false }), 'utf8');
    console.log('✅ Created .hardhatrc.json with analytics disabled');
    return true;
  } catch (error) {
    console.error('Error bypassing analytics prompt:', error);
    return false;
  }
}

async function main() {
  // Bypass the analytics prompt first
  bypassAnalyticsPrompt();
  
  console.log('Starting deployment to BNB Chain Testnet...');
  
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with account: ${deployer.address}`);
  
  // Get wallet balance
  const balance = await deployer.getBalance();
  console.log(`Account balance: ${ethers.utils.formatEther(balance)} BNB`);
  
  if (balance.lt(ethers.utils.parseEther('0.01'))) {
    console.error('Error: Insufficient balance. At least 0.01 BNB required for deployment');
    process.exit(1);
  }

  try {
    // Deploy FlashLoanArbitrage as upgradeable contract
    console.log('Deploying FlashLoanArbitrage contract...');
    const FlashLoanArbitrage = await ethers.getContractFactory('FlashLoanArbitrage');

    // Deploy with UUPS proxy pattern
    console.log('Deploying proxy...');
    const flashLoanArbitrage = await upgrades.deployProxy(FlashLoanArbitrage, [
      // No constructor params - initialize will be called by the proxy
    ], {
      initializer: false, // We will call initialize manually
      kind: 'uups'
    });

    await flashLoanArbitrage.deployed();
    
    console.log(`✅ FlashLoanArbitrage proxy deployed to: ${flashLoanArbitrage.address}`);
    
    // Get implementation address
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(flashLoanArbitrage.address);
    console.log(`✅ Implementation address: ${implementationAddress}`);
    
    // DEX addresses for BNB Chain Testnet
    const pancakeV3Factory = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
    const pancakeV2Router = '0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3';
    const apeSwapRouter = '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7';
    const biSwapRouter = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    
    // Initialize the contract
    console.log('Initializing contract...');
    const initTx = await flashLoanArbitrage.initialize(
      pancakeV3Factory,
      pancakeV2Router,
      apeSwapRouter,
      biSwapRouter
    );
    
    await initTx.wait();
    console.log('✅ Contract initialized successfully');
    
    // Save deployment addresses to file
    const deploymentInfo = {
      proxy: flashLoanArbitrage.address,
      implementation: implementationAddress,
      deployer: deployer.address,
      network: {
        name: network.name,
        chainId: network.config.chainId
      },
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      'deployment.json',
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log('\n✅ Deployment information saved to deployment.json');
    console.log('\n==== DEPLOYMENT COMPLETED SUCCESSFULLY ====');
    console.log(`Contract Address: ${flashLoanArbitrage.address}`);
    console.log(`Implementation: ${implementationAddress}`);
    console.log('\nNext steps:');
    console.log('1. Update the contract address in index.js (DEPLOYED_CONTRACT.ADDRESS)');
    console.log('2. Set DEPLOYED_CONTRACT.IS_DEPLOYED to true');
    console.log('3. Restart the bot to connect to the deployed contract');

  } catch (error) {
    console.error('Error during deployment:', error);
    process.exit(1);
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Unhandled error during deployment:', error);
    process.exit(1);
  });