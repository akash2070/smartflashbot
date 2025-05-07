# Hardhat Deployment Guide for FlashLoanArbitrage_v5

This guide provides step-by-step instructions for deploying the FlashLoanArbitrage_v5 contract using Hardhat directly from Replit.

## Prerequisites

1. Private key for a wallet with sufficient BNB (at least 0.05 BNB for testnet deployment)
2. BNB Chain Testnet RPC URL (optional, default is provided)

## Step 1: Set Up Environment Variables

1. Ensure your `.env` file contains the following variables:
   ```
   PRIVATE_KEY=your_wallet_private_key_without_0x_prefix
   BNB_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
   ```

2. You can verify these secrets are properly set by running:
   ```
   bash -c 'source .env && echo "PRIVATE_KEY is set: ${#PRIVATE_KEY}" && echo "BNB_TESTNET_RPC_URL is set: ${BNB_TESTNET_RPC_URL}"'
   ```

## Step 2: Deploy with Our Deployment Script

We've created a simplified deployment script that handles all the complexity:

1. Run the deployment script:
   ```
   ./deploy_v5.sh
   ```

2. This script will:
   - Check if your environment is properly configured
   - Compile the FlashLoanArbitrage_v5 contract
   - Deploy it to BNB Chain Testnet
   - Initialize the contract with the correct DEX addresses
   - Verify that deployment was successful
   - Output the contract address for you to use

## Step 3: Update Bot Configuration

Once deployment is successful, update the `index.js` file with your deployed contract address:

1. In the `index.js` file, find the `DEPLOYED_CONTRACT` section
2. Update it with the new address:
   ```javascript
   const DEPLOYED_CONTRACT = {
     IS_DEPLOYED: true,
     ADDRESS: "YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE"
   };
   ```

3. Save the file
4. Restart the bot to enable real arbitrage execution

## Troubleshooting

### RPC Connection Issues

If you encounter RPC connection issues, try these alternate RPC endpoints:

```
https://data-seed-prebsc-2-s1.binance.org:8545
https://data-seed-prebsc-1-s2.binance.org:8545
https://data-seed-prebsc-2-s2.binance.org:8545
```

Update your `.env` file with one of these URLs and try again.

### Insufficient Gas

If deployment fails due to insufficient gas, try increasing the gas limit in the `hardhat.config.js` file:

1. Open `hardhat.config.js`
2. Find the `bnbtestnet` network configuration
3. Increase the `gasPrice` value from 3 Gwei to 5 Gwei:
   ```javascript
   gasPrice: 5000000000, // 5 Gwei
   ```

### Contract Verification

Unlike Remix deployment, this approach deploys a proxy contract. The actual implementation is deployed at a different address.

When interacting with your contract:
- Use the proxy address for all interactions
- The implementation address can be used for verification on BscScan if needed

## Manual Deployment Alternative

If you prefer to run the deployment commands directly:

```bash
# Compile contracts
npx hardhat compile

# Deploy to testnet
npx hardhat run scripts/deploy_v5.js --network bnbtestnet
```

This executes the same commands as the deployment script, but gives you more control over the process.

## Next Steps

Once your contract is deployed:

1. Test a small arbitrage opportunity first
2. Monitor execution in the dashboard
3. Gradually increase flash loan amounts as you gain confidence in the system