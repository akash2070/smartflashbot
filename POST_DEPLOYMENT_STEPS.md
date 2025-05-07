# Post-Deployment Steps

After successfully deploying your Flash Loan Arbitrage contract using Remix IDE, follow these steps to connect your bot to the deployed contract:

## 1. Update index.js Configuration

1. Open `index.js` in your Replit project
2. Locate the `DEPLOYED_CONTRACT` section (around line 20)
3. Update the configuration as follows:

```javascript
const DEPLOYED_CONTRACT = {
  // Change this to true
  IS_DEPLOYED: true,
  
  // Replace with your deployed contract address from Remix
  ADDRESS: "0x1234567890abcdef1234567890abcdef12345678", // Replace with your actual contract address
  
  // Keep this as is for testnet
  NETWORK_ID: 97, // BNB Chain Testnet
  
  // Leave this as null, it will be loaded dynamically
  ABI: null,
};
```

## 2. Restart the Flash Loan Arbitrage Bot Workflow

1. After saving the changes to `index.js`, restart the bot workflow
2. The bot will now attempt to connect to your deployed contract
3. Check the logs to ensure the connection was successful

## 3. Verify Bot Operation

After restarting, the bot should:

1. Successfully connect to your deployed contract
2. Begin identifying arbitrage opportunities
3. Display contract statistics in the dashboard

## 4. Troubleshooting

If the bot fails to connect to your contract:

1. Verify the contract address is correct
2. Check that the contract was properly initialized in Remix
3. Ensure you're using the proxy address (if deployed as upgradeable)
4. Check the logs for any specific error messages

## 5. For Production Use

When moving to production:

1. Update `NETWORK_ID` to `56` for BNB Chain Mainnet
2. Update the DEX addresses to mainnet addresses in the contract
3. Ensure your wallet has sufficient BNB for gas fees
4. Set appropriate safety parameters in `src/utils/safetyManager.js`