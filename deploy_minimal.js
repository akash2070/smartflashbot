/**
 * Minimal contract deployment script
 * Using solc compiler and ethers.js
 */

const fs = require('fs');
const { execSync } = require('child_process');
const ethers = require('ethers');
require('dotenv').config();

async function main() {
  try {
    console.log("=".repeat(80));
    console.log("MINIMAL TEST CONTRACT DEPLOYMENT");
    console.log("=".repeat(80));
    
    // Get environment variables
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const BNB_TESTNET_RPC_URL = process.env.BNB_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545';
    
    if (!PRIVATE_KEY) {
      console.error("ERROR: PRIVATE_KEY not found in environment variables");
      process.exit(1);
    }
    
    // Setup provider and wallet
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
    
    // Use the minimal test contract
    console.log("\nCompiling minimal test contract...");
    const minimalContractPath = './build_temp/MinimalTestContract.sol';
    
    // Compile the contract with solc
    try {
      const compileCommand = `solc --bin --abi --optimize --optimize-runs 200 --overwrite -o ./build_temp ${minimalContractPath}`;
      execSync(compileCommand);
      console.log("Contract compilation successful!");
    } catch (error) {
      console.error("Contract compilation failed:", error.message);
      process.exit(1);
    }
    
    // Read compiled artifacts
    console.log("\nReading compiled contract artifacts...");
    const contractBin = fs.readFileSync('./build_temp/MinimalTestContract.bin', 'utf8');
    const contractAbi = JSON.parse(fs.readFileSync('./build_temp/MinimalTestContract.abi', 'utf8'));
    
    console.log(`Contract bytecode size: ${contractBin.length / 2} bytes`);
    
    // Create factory and deploy
    console.log("\nCreating contract factory...");
    const factory = new ethers.ContractFactory(contractAbi, '0x' + contractBin, wallet);
    
    console.log("Deploying contract...");
    const gasPrice = ethers.utils.parseUnits('5', 'gwei'); // 5 Gwei
    const gasLimit = 1000000; // Lower limit for minimal contract
    
    console.log(`Using gas price: ${ethers.utils.formatUnits(gasPrice, 'gwei')} Gwei`);
    console.log(`Using gas limit: ${gasLimit}`);
    
    // Deploy contract
    const contract = await factory.deploy({
      gasPrice: gasPrice,
      gasLimit: gasLimit
    });
    
    console.log(`\nDeployment transaction sent: ${contract.deployTransaction.hash}`);
    console.log("Waiting for transaction confirmation...");
    
    await contract.deployed();
    
    console.log(`\n✅ CONTRACT DEPLOYED SUCCESSFULLY!`);
    console.log(`Contract address: ${contract.address}`);
    
    // Initialize the contract
    console.log("\nInitializing contract...");
    const initTx = await contract.initialize(
      "Flash Loan Arbitrage Test Contract",
      {
        gasPrice: gasPrice,
        gasLimit: 500000
      }
    );
    
    console.log(`Initialization transaction sent: ${initTx.hash}`);
    console.log("Waiting for initialization confirmation...");
    
    const initReceipt = await initTx.wait();
    
    console.log(`\n✅ CONTRACT INITIALIZATION SUCCESSFUL!`);
    console.log(`Transaction confirmed in block: ${initReceipt.blockNumber}`);
    
    // Verify contract info
    console.log("\nVerifying contract info...");
    const contractInfo = await contract.getContractInfo();
    
    console.log(`Owner: ${contractInfo._owner}`);
    console.log(`Message: ${contractInfo._message}`);
    console.log(`Initialized: ${contractInfo._initialized}`);
    
    // Update the message to prove we can interact with the contract
    console.log("\nUpdating contract message...");
    const updateTx = await contract.updateMessage(
      "Successfully deployed to BNB Chain Testnet",
      {
        gasPrice: gasPrice,
        gasLimit: 500000
      }
    );
    
    console.log(`Update transaction sent: ${updateTx.hash}`);
    console.log("Waiting for update confirmation...");
    
    const updateReceipt = await updateTx.wait();
    
    console.log(`\n✅ MESSAGE UPDATE SUCCESSFUL!`);
    console.log(`Transaction confirmed in block: ${updateReceipt.blockNumber}`);
    
    // Verify the message was updated
    const updatedInfo = await contract.getContractInfo();
    console.log(`Updated message: ${updatedInfo._message}`);
    
    // Deployment summary
    console.log("\n" + "=".repeat(80));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(80));
    console.log(`Contract Address: ${contract.address}`);
    console.log(`Owner Address: ${updatedInfo._owner}`);
    console.log(`Deployment Transaction: ${contract.deployTransaction.hash}`);
    console.log(`Initialization Transaction: ${initTx.hash}`);
    console.log(`Update Transaction: ${updateTx.hash}`);
    console.log(`Network: BNB Chain Testnet (Chain ID: 97)`);
    console.log(`Final Message: ${updatedInfo._message}`);
    console.log("=".repeat(80));
    
    console.log("\n✅ CONTRACT VERIFICATION COMPLETE");
    console.log("The contract is deployed and functioning correctly on the BNB Chain Testnet.");
    console.log("We can now update the main FlashLoanArbitrage contract using the knowledge gained from this successful deployment.");
    
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