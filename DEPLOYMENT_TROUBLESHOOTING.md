# Flash Loan Arbitrage - Deployment Troubleshooting Guide

This guide addresses common issues encountered when deploying and using the Flash Loan Arbitrage contract on BNB Chain testnet and mainnet.

## Table of Contents

1. [Deployment Issues](#deployment-issues)
2. [Contract Interaction Problems](#contract-interaction-problems)
3. [Flash Loan Execution Failures](#flash-loan-execution-failures)
4. [Gas and Transaction Cost Problems](#gas-and-transaction-cost-problems)
5. [Network and RPC Issues](#network-and-rpc-issues)

## Deployment Issues

### Hardhat Analytics Prompt Interrupting Scripts

**Problem**: The Hardhat analytics prompt interrupts automated deployment.

**Solutions**:
- Use the `HARDHAT_ANALYTICS_DISABLED=1` environment variable before all Hardhat commands
- Use the provided `deploy_testnet.sh` script which sets this for you
- Create a `.hardhatrc.json` file in your home directory with `{"analytics": false}`

### Contract Verification Failing

**Problem**: Contract deployment completes but verification on BscScan fails.

**Solutions**:
- Check network selection (testnet vs. mainnet)
- Verify you're using the implementation address (not proxy)
- Ensure you have a flattened contract version if using manual verification
- Try the following command for verification:
  ```
  npx hardhat verify --network bnbtestnet IMPLEMENTATION_ADDRESS
  ```

### Out of Gas Errors

**Problem**: Deployment transaction fails with "out of gas" error.

**Solutions**:
- Increase gas limit in `hardhat.config.js` for the network
- Remove unused functions or optimize contract code
- Verify compiler optimization is enabled with sufficient runs

### Failed Proxy Deployment

**Problem**: Upgradeable proxy deployment fails with initialization errors.

**Solutions**:
- Verify the initialize function is correctly defined and accessible
- Check constructor is empty or only calls `_disableInitializers()`
- Ensure you're not calling initialize twice
- Verify all imported contracts are compatible with OpenZeppelin's upgradeable pattern

## Contract Interaction Problems

### Cannot Connect to Deployed Contract

**Problem**: Unable to interact with contract after deployment.

**Solutions**:
- Verify you're using the proxy address (not the implementation)
- Check contract ABI is matching the deployed contract
- Ensure your wallet has sufficient BNB for transaction fees
- Try a different RPC endpoint for the network

### Unauthorized Access Errors

**Problem**: Function calls revert with unauthorized access errors.

**Solutions**:
- Verify you're using the wallet that deployed the contract (owner)
- Check that the function has the `onlyOwner` modifier if expected
- If using multiple wallets, transfer ownership using:
  ```javascript
  await arbitrage.transferOwnership("NEW_OWNER_ADDRESS");
  ```

## Flash Loan Execution Failures

### "Pool Not Initialized" Error

**Problem**: Flash loan execution fails with "pool not initialized" error.

**Solutions**:
- Verify the token pair has a valid pool on PancakeSwap V3
- Check pool fee tier matches the actual fee on-chain
- Try different fee tiers (10, 100, 500, 3000, 10000)
- Use the following fee tiers for common pairs:
  - WBNB/BUSD: 100 (0.01%) or 500 (0.05%)
  - WBNB/USDT: 100 (0.01%) or 500 (0.05%)
  - CAKE/WBNB: 2500 (0.25%) or 10000 (1%)

### "Insufficient Output Amount" Error

**Problem**: Flash loan successfully borrows but fails to repay due to insufficient output.

**Solutions**:
- Increase slippage tolerance in the contract
- Check price difference is sufficient to cover fees
- Verify the token path is correct (no address errors)
- Test with smaller flash loan amounts first

### "Only Pool Can Call" Error

**Problem**: Flash loan callback fails with permissions error.

**Solutions**:
- Verify the `pancakeV3FlashCallback` function is correctly implemented
- Check all function parameters are passed correctly
- Ensure the contract's logic allows for successful repayment
- Test with a smaller flash loan amount to reduce slippage impact

## Gas and Transaction Cost Problems

### High Gas Costs

**Problem**: Transactions require extremely high gas amounts.

**Solutions**:
- Use the `gasEstimator` function before executing flash loans
- Optimize token paths to reduce steps
- Remove unused state variables and functions
- Consider the following gas saving techniques:
  - Use `calldata` instead of `memory` for function parameters
  - Reduce state variable updates
  - Use unchecked blocks for arithmetic operations where safe

### Transaction Underpriced Error

**Problem**: Transactions fail with "transaction underpriced" error.

**Solutions**:
- Increase gas price in `hardhat.config.js`
- During network congestion, use priority gas auction:
  ```javascript
  const tx = await arbitrage.executeArbitrage(
    // parameters...
    { gasPrice: ethers.utils.parseUnits("5", "gwei") }
  );
  ```
- Use maxFeePerGas and maxPriorityFeePerGas for EIP-1559 transactions

## Network and RPC Issues

### RPC Connection Timeouts

**Problem**: Deployment or transactions fail with timeout errors.

**Solutions**:
- Switch to a different RPC endpoint:
  ```
  # Alternative BNB Testnet RPC URLs
  BNB_TESTNET_RPC_URL=https://bsc-testnet.publicnode.com
  BNB_TESTNET_RPC_URL=https://endpoints.omniatech.io/v1/bsc/testnet/public
  
  # Alternative BNB Mainnet RPC URLs  
  BNB_RPC_URL_KEY=https://bsc-mainnet.gateway.pokt.network/v1/lb/YOUR_KEY
  BNB_RPC_URL_KEY=https://bsc.meowrpc.com
  ```
- Increase the network timeout in `hardhat.config.js`:
  ```javascript
  networks: {
    bnbtestnet: {
      // other settings
      timeout: 120000 // 2 minutes
    }
  }
  ```
- Use a dedicated RPC provider service for production

### Nonce Too Low / Already Used

**Problem**: Transactions fail with nonce errors.

**Solutions**:
- Reset account nonce in MetaMask or wallet
- Use the following code to get the correct nonce:
  ```javascript
  const nonce = await ethers.provider.getTransactionCount(signer.address);
  const tx = await arbitrage.executeArbitrage(
    // parameters...
    { nonce: nonce }
  );
  ```
- Clear pending transactions in your wallet