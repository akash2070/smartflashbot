/**
 * Pure Ethers.js deployment script for Flash Loan Arbitrage contract
 * No Hardhat dependencies to avoid analytics prompts
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Load contract artifacts directly
const contractJson = require('../artifacts/contracts/FlashLoanArbitrage.sol/FlashLoanArbitrage.json');
const proxyArtifact = {
  abi: [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "_logic",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "admin_",
          "type": "address"
        },
        {
          "internalType": "bytes",
          "name": "_data",
          "type": "bytes"
        }
      ],
      "stateMutability": "payable",
      "type": "constructor"
    }
  ],
  bytecode: "0x608060405260405161091f38038061091f83398101604081905261002291610320565b61002e8282600061003c565b505050610417565b61004583610117565b6040516001600160a01b038416907f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90600090a2603c8113156100eb5760405162461bcd60e51b815260206004820152603860248201527f555550535570677261646561626c653a2064656c656761746563616c6c20746f60448201527f20746865206e657720696d706c656d656e746174696f6e206661696c6564000060648201526084015b60405180910390fd5b6100fb838383606461012a565b50505050565b6100fb838361012a565b610125816101e3565b6101255761012681610237565b5b50565b6000808573ffffffffffffffffffffffffffffffffffffffff168585604051610154919061039d565b60006040518083038185875af1925050503d8060008114610191576040519150601f19603f3d011682016040523d82523d6000602084013e610196565b606091505b50915091506101a6828286610281565b5095945050505050565b6001600160a01b03163b151590565b606061012583836040518060600160405280602781526020016104e7602791396102e5565b3b151590565b90565b60606101e082610326565b92915050565b6000610201826001600160a01b031661026a565b15610230576040516001600160a01b038216907f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90600090a26001919050565b50600090565b608061030660018360405160240161024f91906103b3565b60408051601f198184030181529190526020810180516001600160e01b0316633b51a8bf60e11b179052610326565b505050565b6060610326826000610326565b610306838383610326565b606083156102a657505060016101e0565b8251156102b6575060016101e0565b6040516001600160a01b038516907f5c26b3fb987d587d7be11ed37a37d36e5da296c55240d8e56f1cc5e0424a83ab9061030290869085906103ce565b60006101e0565b6060831561031557508161031a565b61031a83610326565b9392505050565b6060610320826101ab565b9392505050565b60008060006060848603121561033557600080fd5b83516001600160a01b038116811461034c57600080fd5b60208501519093506001600160a01b038116811461036957600080fd5b80925050604084015190509250925092565b60005b838110156103945781810151838201526020016103cc565b50506000910152565b60008251610245818460208701610334565b600060208083528351808285015260005b818110156103e0578581018301518582016040015282016103c4565b506000604082860101526040601f19601f8301168501019250505092915050565b60006020828403121561041457600080fd5b5051919050565b6104c1806104266000396000f3fe60806040523661001357610011610017565b005b6100115b61002761002261005e565b610096565b565b606061004e83836040518060600160405280602781526020016104646027913961010c565b9392505050565b3b151590565b90565b600061007c7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5490565b905090565b6000610071546001600160a01b0316905090565b3660008037600080366000845af43d6000803e8080156100b5573d6000f35b3d6000fd5b6100dd7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5490565b6001600160a01b0316610083565b6040516001600160a01b0381169050919050565b906100716101f7565b606083156101555750506040516001600160a01b0385169083156108fc029084906000818181858888f19350505050156101505761014b8161026f565b610150565b600080fd5b505050565b825115610165575060016100e2565b6040516001600160a01b038516907f5c26b3fb987d587d7be11ed37a37d36e5da296c55240d8e56f1cc5e0424a83ab906101af9086908590602401610313565b60408051601f198184030181529190526020810180516001600160e01b031663446dd9fe60e11b179052610316565b60006100e2565b6060610205826101da565b92915050565b6000610223826001600160a01b03166100e9565b15610252576040516001600160a01b038216907f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc90600090a26001919050565b50600090565b606061026b826000610205565b9392505050565b61029a7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5490565b8051156102ea57604080516001600160a01b039283166020808401919091528351808403820181529184018352815191909201201790525b6102f56000826101fe565b50565b61012561030260018361042c565b610316565b60005b8381101561032857818101518382015260200161026b565b50506000910152565b600060208083528351808285015260005b8181101561035f57858101830151858201604001528201610343565b506000604082860101526040601f19601f8301168501019250505092915050565b634e487b7160e01b600052604160045260246000fd5b600082601f83011261039f578081fd5b813567ffffffffffffffff811115610340578182fd5b602060206000808402830185018383016111a961042c565b600080fd5b610425826040513d602d81016040526003601e600c5360ff8160448137600993848410808211176103fe57604052604a606a82395060cc82855404608060e0610ce3610e03610f2361042c565b50565b6040516000906000600281600261026b60c0608060406000608060c061042c"
};

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
    
    console.log('Deploying implementation contract...');
    
    // Deploy implementation
    const Factory = new ethers.ContractFactory(
      contractJson.abi,
      contractJson.bytecode,
      wallet
    );
    
    const implementation = await Factory.deploy();
    await implementation.deployed();
    
    console.log(`Implementation deployed at: ${implementation.address}`);
    
    // Create initialization data
    // PancakeSwap V3 Factory
    const pancakeV3Factory = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
    // PancakeSwap V2 Router
    const pancakeV2Router = '0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3';
    // ApeSwap Router
    const apeSwapRouter = '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7';
    // BiSwap Router
    const biSwapRouter = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
    
    // Create initialize function data
    const initData = implementation.interface.encodeFunctionData('initialize', [
      pancakeV3Factory,
      pancakeV2Router,
      apeSwapRouter,
      biSwapRouter
    ]);
    
    console.log('Deploying proxy...');
    
    // Deploy ERC1967 proxy pointing to our implementation
    const ProxyFactory = new ethers.ContractFactory(
      proxyArtifact.abi,
      proxyArtifact.bytecode,
      wallet
    );
    
    const proxy = await ProxyFactory.deploy(
      implementation.address,    // implementation address
      wallet.address,            // admin address (owner)
      initData                  // initialization call data
    );
    
    await proxy.deployed();
    
    console.log(`Proxy deployed at: ${proxy.address}`);
    
    // Create proxy contract instance
    const flashLoanArbitrage = new ethers.Contract(
      proxy.address,
      contractJson.abi,
      wallet
    );
    
    console.log('Verifying initialization...');
    // Verify the contract was initialized properly
    const owner = await flashLoanArbitrage.owner();
    console.log(`Contract owner: ${owner}`);
    
    if (owner === wallet.address) {
      console.log('✅ Contract initialization successful!');
    } else {
      console.error('❌ Contract initialization failed!');
    }
    
    // Save deployment addresses to file
    const deploymentInfo = {
      proxy: proxy.address,
      implementation: implementation.address,
      deployer: wallet.address,
      network: {
        name: network.name,
        chainId: network.chainId
      },
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
      'deployment.json',
      JSON.stringify(deploymentInfo, null, 2)
    );
    
    console.log('\n✅ Deployment information saved to deployment.json');
    console.log('\n==== DEPLOYMENT COMPLETED SUCCESSFULLY ====');
    console.log(`Contract Address: ${proxy.address}`);
    console.log(`Implementation: ${implementation.address}`);
    console.log('\nNext steps:');
    console.log('1. Update the contract address in index.js (DEPLOYED_CONTRACT.ADDRESS)');
    console.log('2. Set DEPLOYED_CONTRACT.IS_DEPLOYED to true');
    console.log('3. Restart the bot to connect to the deployed contract');
  } catch (error) {
    console.error('Error during deployment:', error);
    process.exit(1);
  }
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Deployment error:', error);
    process.exit(1);
  });