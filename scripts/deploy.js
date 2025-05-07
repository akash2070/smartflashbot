const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("Starting deployment to BNB Chain Testnet...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);
  
  const balance = await deployer.getBalance();
  console.log(`Account balance: ${ethers.utils.formatEther(balance)} BNB`);
  
  // BNB Chain Testnet addresses
  const PANCAKESWAP_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
  const PANCAKESWAP_V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
  const APESWAP_ROUTER = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";
  const BISWAP_ROUTER = "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8";
  
  console.log("Compiling contracts...");
  await hre.run('compile');
  
  // Deploy the implementation contract through the proxy
  console.log("Deploying Flash Loan Arbitrage contract...");
  const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
  
  // Deploy as upgradeable contract using UUPS proxy pattern
  console.log("Deploying proxy...");
  const proxy = await upgrades.deployProxy(
    FlashLoanArbitrage, 
    [
      PANCAKESWAP_V3_FACTORY,
      PANCAKESWAP_V2_ROUTER,
      APESWAP_ROUTER,
      BISWAP_ROUTER
    ],
    { 
      kind: 'uups',
      initializer: 'initialize' 
    }
  );
  
  await proxy.deployed();
  
  // Get implementation address
  const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxy.address);
  
  console.log("Deployment completed!");
  console.log(`Proxy address: ${proxy.address}`);
  console.log(`Implementation address: ${implementationAddress}`);
  
  console.log("\nVerification info:");
  console.log("====================");
  console.log("To verify the implementation contract:");
  console.log(`npx hardhat verify --network bnbtestnet ${implementationAddress}`);
  
  // Display estimated deployment costs
  const gasPrice = await ethers.provider.getGasPrice();
  console.log(`\nCurrent gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} Gwei`);
  console.log("Estimated deployment costs:");
  console.log(`- Proxy: ~800,000 gas (${ethers.utils.formatEther(gasPrice.mul(800000))} BNB)`);
  console.log(`- Implementation: ~1,500,000 gas (${ethers.utils.formatEther(gasPrice.mul(1500000))} BNB)`);
  console.log(`- Total: ~2,300,000 gas (${ethers.utils.formatEther(gasPrice.mul(2300000))} BNB)`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });