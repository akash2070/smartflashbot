# Flash Loan Arbitrage Contract - Deployment & Usage Guide

This guide provides detailed instructions for deploying and interacting with the Flash Loan Arbitrage smart contract on BNB Chain.

## Table of Contents

1. [Preparation](#preparation)
2. [Deployment](#deployment)
3. [Contract Interaction](#contract-interaction)
4. [Flash Loan Execution](#flash-loan-execution)
5. [Configuration & Maintenance](#configuration--maintenance)
6. [Security Considerations](#security-considerations)
7. [Troubleshooting](#troubleshooting)

## Preparation

### 1. Environment Setup

Create a `.env` file with the following variables:

```bash
# Required for deployment
PRIVATE_KEY=your_wallet_private_key_without_0x_prefix
BNB_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
BNB_RPC_URL_KEY=https://bsc-dataseed.binance.org/

# For dashboard security
SESSION_SECRET=your_secure_random_string
```

### 2. Testnet BNB

Ensure your wallet has sufficient testnet BNB for deployment:

* Required: Minimum 0.01 BNB
* Recommended: 0.05 BNB for multiple tests

Get testnet BNB from:
* [Official BNB Chain Faucet](https://testnet.bnbchain.org/faucet-smart)
* [QuickNode BNB Faucet](https://faucet.quicknode.com/binance-smart-chain/bnb-testnet)

## Deployment

### 1. Using the Deployment Script

Run the deployment script which will verify the contract and deploy to testnet:

```bash
./deploy_testnet.sh
```

### 2. Manual Deployment Steps

If you prefer to manually deploy:

1. Verify the contract structure:
   ```bash
   node scripts/verify_contract.js
   ```

2. Deploy using Hardhat:
   ```bash
   HARDHAT_ANALYTICS_DISABLED=1 npx hardhat run scripts/deploy.js --network bnbtestnet
   ```

### 3. Record Contract Addresses

After deployment, record both addresses:
* Proxy address (the one you'll interact with)
* Implementation address (for contract verification)

## Contract Interaction

### 1. Direct Function Calls (Hardhat Console)

Start a Hardhat console:
```bash
HARDHAT_ANALYTICS_DISABLED=1 npx hardhat console --network bnbtestnet
```

Load the contract:
```javascript
const FlashLoanArbitrage = await ethers.getContractFactory("FlashLoanArbitrage");
const arbitrage = await FlashLoanArbitrage.attach("YOUR_PROXY_ADDRESS");
```

### 2. View Contract State

Get basic statistics:
```javascript
const stats = await arbitrage.getStats();
console.log({
  totalTrades: stats[0].toString(),
  successfulTrades: stats[1].toString(),
  totalProfit: ethers.utils.formatEther(stats[2]) + " BNB"
});
```

Check settings:
```javascript
const pancakeV3SlippageCap = await arbitrage.pancakeV3SlippageCap();
console.log(`PancakeSwap V3 Slippage Cap: ${pancakeV3SlippageCap.toString()} basis points`);

const mevProtectionEnabled = await arbitrage.mevProtectionEnabled();
console.log(`MEV Protection: ${mevProtectionEnabled ? "Enabled" : "Disabled"}`);
```

## Flash Loan Execution

### 1. Execute an Arbitrage Opportunity

```javascript
// Key addresses (BNB Chain Testnet)
const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const BUSD = "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const PANCAKE_V2_ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
const APESWAP_ROUTER = "0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7";

// Loan parameters
const amountToBorrow = ethers.utils.parseEther("0.01"); // 0.01 BNB
const poolFee = 100; // 0.015% fee tier

// Path arrays
const buyPath = [WBNB, BUSD];
const sellPath = [BUSD, WBNB];

// Execute flash loan arbitrage
await arbitrage.executeArbitrage(
  WBNB,             // tokenBorrow
  BUSD,             // tokenPay
  amountToBorrow,   // amountToBorrow
  poolFee,          // poolFee
  PANCAKE_V2_ROUTER,// buyDex
  APESWAP_ROUTER,   // sellDex
  buyPath,          // buyPath
  sellPath          // sellPath
);
```

### 2. Monitoring Results

Check for emitted events:
```javascript
const filter = arbitrage.filters.ArbitrageExecuted();
const events = await arbitrage.queryFilter(filter);
console.log("Recent arbitrage executions:", events.map(e => e.args));
```

## Configuration & Maintenance

### 1. Update Slippage Settings

```javascript
// Update PancakeSwap V2 slippage cap to 0.8% (80 basis points)
await arbitrage.updateSlippageCap("pancakeV2", 80);

// Update ApeSwap slippage cap to 1.0% (100 basis points)
await arbitrage.updateSlippageCap("apeSwap", 100);
```

### 2. Configure MEV Protection

```javascript
await arbitrage.updateMevProtection(
  true,   // enabled
  true,   // enableBackrun 
  false,  // enableFrontrun
  150     // feeMultiplier (1.5x)
);
```

### 3. Withdraw Funds

```javascript
// Withdraw all BNB
await arbitrage.withdraw("0x0000000000000000000000000000000000000000", 0);

// Withdraw specific amount of WBNB
const wbnbAmount = ethers.utils.parseEther("0.1");
await arbitrage.withdraw(WBNB, wbnbAmount);
```

### 4. Emergency Controls

Pause the contract in emergencies:
```javascript
await arbitrage.pause();
```

Resume contract operation:
```javascript
await arbitrage.unpause();
```

## Security Considerations

1. **Test with small amounts**: Initially use small flash loan amounts (0.01 BNB)
2. **Increment gradually**: Increase loan size by 2x only after successful executions
3. **Monitor gas usage**: Keep gas prices reasonable (3-5 Gwei)
4. **MEV protection**: Always enable backrun protection to prevent sandwich attacks
5. **Slippage limits**: Set tight but realistic limits based on pool sizes

## Troubleshooting

### 1. Flash Loan Failures

**Pool Not Found Error**:
* Ensure the pool exists with the specified fee tier
* Try different fee tiers (10 = 0.01%, 100 = 0.05%, 500 = 0.1%)

**Insufficient Repayment**:
* Decrease slippage to ensure enough profit after fees
* Check token pair for sufficient price difference

### 2. Network Issues

**Transaction Reverts**:
* Increase gas limit for complex transactions
* Use reliable RPC endpoints

**Delayed Transactions**:
* Increase gas price for faster confirmation
* Check network congestion and adjust strategy accordingly

### 3. Verification Status

Check verification status on BscScan:
```
https://testnet.bscscan.com/address/YOUR_IMPLEMENTATION_ADDRESS
```

### 4. Common Error Messages

| Error | Solution |
|-------|----------|
| "Pool not found" | Check pool existence and fee tier |
| "Insufficient output amount" | Adjust slippage settings |
| "No profit after fees" | Look for larger price differences |
| "Unauthorized callback" | Check contract permissions |