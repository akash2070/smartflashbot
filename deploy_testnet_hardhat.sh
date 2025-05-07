#!/bin/bash

# Deploy contract using hardhat with analytics disabled
# This script bypasses the Hardhat analytics prompt

echo "===== FlashLoanArbitrage_v5 Testnet Deployment via Hardhat ====="
echo "This script will deploy the FlashLoanArbitrage_v5 contract to BNB Chain Testnet using Hardhat"
echo ""

# Check if required environment variables are set
if [ -z "$PRIVATE_KEY" ]; then
  echo "ERROR: PRIVATE_KEY environment variable is not set."
  echo "Please ensure it is properly set in your environment secrets."
  exit 1
fi

echo "Starting deployment with Hardhat (analytics disabled)..."
echo ""

# Set HARDHAT_ANALYTICS=false to bypass the prompt
export HARDHAT_ANALYTICS=false

# Run the hardhat deployment script
npx hardhat run scripts/deploy_v5.js --network bnbtestnet

# Check if deployment was successful
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Deployment script executed successfully!"
  echo "Please update your index.js with the contract address as shown above."
else
  echo ""
  echo "❌ Deployment failed! Please check the error messages above."
fi