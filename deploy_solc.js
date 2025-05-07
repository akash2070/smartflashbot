/**
 * Direct contract deployment to mainnet without Hardhat
 * Using solc compiler and ethers.js for FlashLoanArbitrage_v5
 */

const fs = require('fs');
const { execSync } = require('child_process');
const ethers = require('ethers');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
const isTestnet = args.includes('--testnet');
const isMainnet = args.includes('--mainnet') || (!isTestnet && !args.includes('--help'));

function showHelp() {
  console.log(`
Flash Loan Arbitrage Contract Deployment Script

Usage:
  node deploy_solc.js [options]

Options:
  --testnet    Deploy to BNB Chain Testnet (chainId 97)
  --mainnet    Deploy to BNB Chain Mainnet (chainId 56)
  --help       Show this help message

Examples:
  node deploy_solc.js --testnet    # Deploy to testnet
  node deploy_solc.js --mainnet    # Deploy to mainnet
  `);
  process.exit(0);
}

// Show help if requested
if (args.includes('--help')) {
  showHelp();
}

async function main() {
  try {
    console.log("=".repeat(80));
    const title = isTestnet ? 
      "FLASH LOAN ARBITRAGE CONTRACT TESTNET DEPLOYMENT USING SOLC" : 
      "FLASH LOAN ARBITRAGE CONTRACT MAINNET DEPLOYMENT USING SOLC";
    console.log(title);
    console.log("=".repeat(80));
    
    if (isMainnet) {
      console.log("\n⚠️ MAINNET DEPLOYMENT - Real funds will be used");
    } else {
      console.log("\n🧪 TESTNET DEPLOYMENT - Test network will be used");
    }
    
    console.log("\nVerifying environment setup...");
    
    // Create temp directory for compilation output
    if (!fs.existsSync('./build_temp')) {
      fs.mkdirSync('./build_temp');
    }
    
    // Get environment variables
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    
    // Define RPC URLs for both networks
    const MAINNET_RPC_URLS = [
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
    
    const TESTNET_RPC_URLS = [
      process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      'https://data-seed-prebsc-2-s1.binance.org:8545/',
      'https://data-seed-prebsc-1-s2.binance.org:8545/',
      'https://data-seed-prebsc-2-s2.binance.org:8545/',
      'https://data-seed-prebsc-1-s3.binance.org:8545/',
      'https://data-seed-prebsc-2-s3.binance.org:8545/',
      'https://bsc-testnet.publicnode.com',
      'https://bsc-testnet.nodereal.io/v1/64a9df0874fb4a93b9d0a3849de012d3',
    ];
    
    // Choose RPC URLs based on network selection
    const RPC_URLS = isTestnet ? TESTNET_RPC_URLS : MAINNET_RPC_URLS;
    
    if (!PRIVATE_KEY) {
      console.error("ERROR: PRIVATE_KEY not found in environment variables");
      process.exit(1);
    }
    
    // Try connecting with each RPC URL
    console.log(`Connecting to BNB Chain ${isTestnet ? 'Testnet' : 'Mainnet'}...`);
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
    
    // Allow both testnet and mainnet deployment
    const validNetworks = [56, 97]; // 56 = Mainnet, 97 = Testnet
    if (!validNetworks.includes(network.chainId)) {
      console.error(`ERROR: Connected to unsupported network with chainId ${network.chainId}`);
      console.error("Please use BNB Chain Mainnet (chainId 56) or Testnet (chainId 97)");
      process.exit(1);
    }
    
    const networkType = network.chainId === 56 ? "Mainnet" : "Testnet";
    console.log(`\n⚠️ Deploying to BNB Chain ${networkType}`);
    if (networkType === "Mainnet") {
      console.log("⚠️ WARNING: DEPLOYING TO MAINNET - Real funds will be used!");
    }
    
    // Check if balance is sufficient
    const minBalance = ethers.utils.parseEther("0.01");
    if (balance.lt(minBalance)) {
      console.error(`ERROR: Insufficient balance. Need at least 0.01 BNB for deployment.`);
      process.exit(1);
    }
    
    // Ready to deploy the flattened FlashLoanArbitrage contract
    
    console.log("\nPreparing FlashLoanArbitrage_Flattened contract for deployment...");
    const contractPath = './build_temp/FlashLoanArbitrage_Flattened.sol';
    
    // Make sure the contract exists
    if (!fs.existsSync(contractPath)) {
      console.error(`ERROR: FlashLoanArbitrage_Flattened not found at ${contractPath}`);
      console.error("Please create the FlashLoanArbitrage_Flattened first.");
      process.exit(1);
    }
    
    console.log("Reading contract content...");
    const contractContent = fs.readFileSync(contractPath, 'utf8');
    
    console.log("Compiling contract with solc...");
    
    try {
      // Use solc from node_modules
      const solcCommand = `npx solc --optimize --bin --abi -o ./build_temp ${contractPath}`;
      execSync(solcCommand, { stdio: 'inherit' });
      
      console.log("Contract compiled successfully.");
      
      console.log("Reading compiled contract artifacts...");
      const binPath = './build_temp/build_temp_FlashLoanArbitrage_Flattened_sol_FlashLoanArbitrage_Flattened.bin';
      const abiPath = './build_temp/build_temp_FlashLoanArbitrage_Flattened_sol_FlashLoanArbitrage_Flattened.abi';
      
      if (!fs.existsSync(binPath) || !fs.existsSync(abiPath)) {
        console.error(`ERROR: Contract artifacts not found at ${binPath} or ${abiPath}`);
        console.error("Compilation may have failed.");
        process.exit(1);
      }
      
      const contractBin = fs.readFileSync(binPath, 'utf8');
      const contractAbi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
      
      // Create factory and deploy
      console.log("Creating contract factory...");
      const factory = new ethers.ContractFactory(contractAbi, contractBin, wallet);
      
      // Estimate gas for deployment
      console.log("\nEstimating deployment gas cost...");
      const deploymentGasEstimate = await provider.estimateGas({
        data: factory.bytecode
      });
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
      
      // Use PancakeSwap V3 Factory address depending on the network
      const pancakeV3FactoryAddress = isTestnet 
        ? "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865" // Testnet V3 Factory address
        : "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865"; // Mainnet V3 Factory address
      
      console.log(`Deploying FlashLoanArbitrage_Flattened contract...`);
      console.log(`Using PancakeSwap V3 Factory address: ${pancakeV3FactoryAddress}`);
      
      // Deploy the contract
      const contract = await factory.deploy({
        gasPrice: bufferedGasPrice,
        gasLimit: deploymentGasEstimate.mul(120).div(100) // Add 20% buffer to gas limit
      });
      
      console.log(`Deployment transaction sent: ${contract.deployTransaction.hash}`);
      console.log("Waiting for transaction confirmation...");
      
      await contract.deployed();
      
      console.log(`\n✅ FLASH LOAN ARBITRAGE CONTRACT DEPLOYED SUCCESSFULLY!`);
      console.log(`Contract address: ${contract.address}`);
      
      // Initialize the contract
      console.log("Initializing contract with PancakeSwap V3 Factory address...");
      const initTx = await contract.initialize(pancakeV3FactoryAddress);
      await initTx.wait();
      
      console.log("Contract initialized successfully!");
      
      // Verify contract is working
      const owner = await contract.owner();
      const factoryAddress = await contract.PANCAKESWAP_V3_FACTORY();
      
      console.log(`Contract owner: ${owner}`);
      console.log(`PancakeSwap V3 Factory: ${factoryAddress}`);
      
      if (owner === wallet.address) {
        console.log("✅ Owner verification successful!");
      } else {
        console.log("❌ Owner verification failed!");
      }
      
      if (factoryAddress === pancakeV3FactoryAddress) {
        console.log("✅ Factory address verification successful!");
      } else {
        console.log("❌ Factory address verification failed!");
      }
      
      // Verify additional contract configurations
      const mevProtectionEnabled = await contract.mevProtectionEnabled();
      const backrunEnabled = await contract.backrunEnabled();
      const frontrunEnabled = await contract.frontrunEnabled();
      const minExecutionBalance = await contract.minExecutionBalance();
      
      console.log("\nContract Configuration:");
      console.log(`- MEV Protection Enabled: ${mevProtectionEnabled}`);
      console.log(`- Backrun Enabled: ${backrunEnabled}`);
      console.log(`- Frontrun Enabled: ${frontrunEnabled}`);
      console.log(`- Minimum Execution Balance: ${ethers.utils.formatEther(minExecutionBalance)} BNB`);
      
      // Test getting a pool from PancakeSwap V3
      const bnbAddress = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // WBNB
      const busdAddress = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"; // BUSD
      const feeTier = 100; // 0.01% fee tier
      
      console.log("\nTesting contract functionality with getPancakeV3Pool...");
      try {
        const poolAddress = await contract.getPancakeV3Pool(bnbAddress, busdAddress, feeTier);
        console.log(`Pool Address for WBNB/BUSD with fee tier ${feeTier}: ${poolAddress}`);
        if (poolAddress !== ethers.constants.AddressZero) {
          console.log("✅ Pool lookup functionality verification successful!");
        } else {
          console.log("⚠️ Pool not found, but function executed successfully.");
        }
      } catch (error) {
        console.log("❌ Pool lookup functionality verification failed!");
        console.error(error.message);
      }
      
      // Save deployment info
      const deploymentInfo = {
        network: `BSC ${networkType}`,
        chainId: network.chainId,
        contractAddress: contract.address,
        owner: owner,
        deploymentTx: contract.deployTransaction.hash,
        contractType: "FlashLoanArbitrage_Flattened",
        initialized: true,
        factoryAddress: factoryAddress,
        deploymentDate: new Date().toISOString()
      };
      
      const deploymentsDir = './deployments';
      if (!fs.existsSync(deploymentsDir)) {
        fs.mkdirSync(deploymentsDir);
      }
      
      // Create a filename based on network type
      const deploymentFilename = `${networkType.toLowerCase()}-deployment-solc.json`;
      
      fs.writeFileSync(
        `${deploymentsDir}/${deploymentFilename}`,
        JSON.stringify(deploymentInfo, null, 2)
      );
      
      console.log(`\nDeployment info saved to deployments/${deploymentFilename}`);
      
      // Deployment summary
      console.log("\n" + "=".repeat(80));
      console.log("DEPLOYMENT SUMMARY");
      console.log("=".repeat(80));
      console.log(`Contract Address: ${contract.address}`);
      console.log(`Owner Address: ${owner}`);
      console.log(`Deployment Transaction: ${contract.deployTransaction.hash}`);
      console.log(`Network: BNB Chain ${networkType} (Chain ID: ${network.chainId})`);
      console.log("=".repeat(80));
      
      console.log(`\n✅ ${networkType.toUpperCase()} DEPLOYMENT COMPLETE!`);
      console.log("To use this contract with the arbitrage bot, update the config.js file with the contract address.");
      
    } catch (compileError) {
      console.error("Contract compilation failed:", compileError);
      process.exit(1);
    }
    
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