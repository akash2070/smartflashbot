#!/bin/bash

# Set Hardhat analytics to disabled to avoid interactive prompts
export HARDHAT_ANALYTICS_DISABLED=1

# Check if the .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Please create one from .env.template"
    exit 1
fi

# Check if PRIVATE_KEY is set in .env
if ! grep -q "PRIVATE_KEY=" .env || grep -q "PRIVATE_KEY=$" .env; then
    echo "❌ Error: PRIVATE_KEY is not set in .env file"
    exit 1
fi

# Verify BNB Testnet RPC URL is set
if ! grep -q "BNB_TESTNET_RPC_URL=" .env || grep -q "BNB_TESTNET_RPC_URL=$" .env; then
    echo "❌ Error: BNB_TESTNET_RPC_URL is not set in .env file"
    exit 1
fi

# Running contract structure verification
echo "Running contract structure verification..."
node scripts/verify_contract.js

# Check verification result
if [ $? -ne 0 ]; then
    echo "❌ Contract verification failed, please fix the issues before deploying"
    exit 1
fi

# Start the deployment
echo "Starting deployment to BNB Chain Testnet..."
echo "This will deploy the upgradeable FlashLoanArbitrage contract"
echo "Estimated gas cost: ~2.3M gas (~0.0069 BNB at 3 Gwei)"
echo ""

# Execute the deployment with hardhat
echo "Executing: npx hardhat run scripts/deploy.js --network bnbtestnet"
npx hardhat run scripts/deploy.js --network bnbtestnet

# Check deployment result
if [ $? -ne 0 ]; then
    echo "❌ Deployment failed, please check the error messages above"
    exit 1
else
    echo "✅ Deployment command completed successfully"
    echo ""
    echo "Next steps:"
    echo "1. Record your contract addresses (both proxy and implementation)"
    echo "2. Update your application's .env file with the contract addresses"
    echo "3. Test the contract with small amounts before production use"
    echo ""
fi