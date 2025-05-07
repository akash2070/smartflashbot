# Flash Loan Arbitrage - Testnet Deployment Guide

This guide provides step-by-step instructions for deploying the Flash Loan Arbitrage contract to BNB Chain Testnet.

## Prerequisites

1. **Testnet BNB**
   - Minimum 0.02 BNB in your wallet
   - Get testnet BNB from:
     - [BNB Chain Faucet](https://testnet.bnbchain.org/faucet-smart)
     - [QuickNode Faucet](https://faucet.quicknode.com/binance-smart-chain/bnb-testnet)

2. **Environment Setup**
   - Node.js v14+ installed
   - Git repository cloned
   - Dependencies installed via `npm install`

## Step 1: Configure Environment Variables

1. Create a `.env` file based on `.env.template`:

```bash
cp .env.template .env
```

2. Edit `.env` and add the following variables:

```
PRIVATE_KEY=your_wallet_private_key_without_0x_prefix
BNB_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
BNB_RPC_URL_KEY=https://bsc-dataseed.binance.org/
SESSION_SECRET=your_random_secure_string
```

3. Replace the placeholder values with your actual credentials:
   - `PRIVATE_KEY`: Your wallet's private key (without the `0x` prefix)
   - `BNB_TESTNET_RPC_URL`: Can use the default or any BNB testnet RPC
   - `SESSION_SECRET`: Any random string for dashboard security

## Step 2: Verify Contract Structure

1. Run the verification script to check the contract structure:

```bash
node scripts/verify_contract.js
```

2. Ensure you see the "Contract verification passed!" message before proceeding.

## Step 3: Deploy to Testnet

1. Execute the deployment script:

```bash
./deploy_testnet.sh
```

2. The deployment process will:
   - Verify your environment variables
   - Check contract structure
   - Deploy the proxy and implementation contracts
   - Initialize the contract with default settings

3. After successful deployment, record both addresses printed in the console:
   - **Proxy Address**: The address you'll interact with
   - **Implementation Address**: The address of the logic contract

## Step 4: Verify on BscScan

1. Visit [BNB Testnet Explorer](https://testnet.bscscan.com/)

2. Search for your implementation contract address

3. Go to the "Contract" tab and click "Verify and Publish"

4. Select:
   - Compiler Type: Solidity (Single file)
   - Compiler Version: 0.8.17
   - License Type: MIT

5. Paste the entire contract code and submit for verification

## Step 5: Test Basic Functionality

1. First test: Check if the contract was properly initialized

```bash
HARDHAT_ANALYTICS_DISABLED=1 npx hardhat console --network bnbtestnet
```

```javascript
const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
const arbitrage = await FlashLoanArbitrage.attach("YOUR_PROXY_ADDRESS");

// Check owner
const owner = await arbitrage.owner();
console.log("Contract owner:", owner);

// Check default settings
const pancakeV3SlippageCap = await arbitrage.pancakeV3SlippageCap();
console.log("PancakeSwap V3 Slippage Cap:", pancakeV3SlippageCap.toString(), "basis points");

// Check pause status
const isPaused = await arbitrage.paused();
console.log("Contract paused:", isPaused);

// Exit console
.exit
```

## Step 6: Initial Configuration

Configure the contract with appropriate settings for testnet:

```bash
HARDHAT_ANALYTICS_DISABLED=1 npx hardhat console --network bnbtestnet
```

```javascript
const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
const arbitrage = await FlashLoanArbitrage.attach("YOUR_PROXY_ADDRESS");

// Update slippage caps (in basis points, e.g., 50 = 0.5%)
await arbitrage.updateSlippageCap("pancakeV2", 100); // 1.0%
await arbitrage.updateSlippageCap("apeSwap", 120);   // 1.2%
await arbitrage.updateSlippageCap("biswap", 70);     // 0.7%
await arbitrage.updateSlippageCap("pancakeV3", 50);  // 0.5%

// Configure MEV protection
await arbitrage.updateMevProtection(
  true,  // enabled
  true,  // enableBackrun
  false, // enableFrontrun
  150    // feeMultiplier (1.5x)
);

// Exit console
.exit
```

## Step 7: Execute Test Flash Loan (Optional)

Test with a minimal flash loan to ensure everything works:

```bash
HARDHAT_ANALYTICS_DISABLED=1 npx hardhat console --network bnbtestnet
```

```javascript
const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
const arbitrage = await FlashLoanArbitrage.attach("YOUR_PROXY_ADDRESS");

// Testnet addresses (BNB Chain Testnet)
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const BUSD = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const PANCAKE_V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const APESWAP_ROUTER = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";

// Loan parameters - small amount for testing
const amountToBorrow = ethers.utils.parseEther("0.001"); // 0.001 BNB
const poolFee = 100; // 0.01% fee tier

// Path arrays
const buyPath = [WBNB, BUSD];
const sellPath = [BUSD, WBNB];

// Execute flash loan arbitrage with higher gas limit
await arbitrage.executeArbitrage(
  WBNB,             // tokenBorrow
  BUSD,             // tokenPay
  amountToBorrow,   // amountToBorrow
  poolFee,          // poolFee
  PANCAKE_V2_ROUTER,// buyDex
  APESWAP_ROUTER,   // sellDex
  buyPath,          // buyPath
  sellPath,         // sellPath
  { gasLimit: 2000000 }
);

// Check if transaction was successful by looking at events
const filter = arbitrage.filters.ArbitrageExecuted();
const events = await arbitrage.queryFilter(filter);
console.log("Recent arbitrage executions:", events.map(e => e.args));

// Exit console
.exit
```

## Step 8: Monitor via Dashboard

1. Start the Dashboard server:

```bash
node dashboard-server.js
```

2. Open the dashboard in your browser at: http://localhost:5000 or https://your-replit-url.replit.app

3. Observe the dashboard for:
   - Real-time price monitoring
   - Arbitrage opportunities
   - Contract statistics
   - Transaction history

## Testnet Addresses

### BNB Chain Testnet

| Component | Address |
|-----------|---------|
| WBNB | 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd |
| BUSD | 0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee |
| USDT | 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd |
| CAKE | 0xFa60D973F7642B748046464e165A65B7323b0DEE |
| PancakeSwap V2 Router | 0xD99D1c33F9fC3444f8101754aBC46c52416550D1 |
| PancakeSwap V2 Factory | 0x6725F303b657a9451d8BA641348b6761A6CC7a17 |
| PancakeSwap V3 Factory | 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865 |
| PancakeSwap V3 Router | 0x13f4EA83D0bd40E75C8222255bc855a974568Dd4 |
| ApeSwap Router | 0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7 |
| BiSwap Router | 0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8 |

## Common Issues & Solutions

### Pool Not Found
If you encounter "Pool not found" errors, try different fee tiers. For testnet:
- WBNB/BUSD: Try fee tier 500 (0.05%) instead of 100 (0.01%)
- WBNB/USDT: Try fee tier 3000 (0.3%) instead of 100 (0.01%)

### Insufficient Liquidity
Testnet pools may have limited liquidity. If transactions fail:
- Reduce the flash loan amount (start with 0.001 BNB)
- Try different token pairs with more liquidity

### Gas Related Errors
If transactions fail due to gas issues:
- Increase the gas limit: `{ gasLimit: 3000000 }`
- Use a higher gas price: `{ gasPrice: ethers.utils.parseUnits("10", "gwei") }`

For more detailed troubleshooting, refer to the [Deployment Troubleshooting Guide](./DEPLOYMENT_TROUBLESHOOTING.md).

---

After successful testnet deployment and testing, you can proceed to mainnet deployment by adjusting the network settings in your scripts and using the `--network bnbmainnet` flag with Hardhat commands.