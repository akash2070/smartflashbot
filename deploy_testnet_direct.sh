#!/bin/bash

# Direct testnet deployment script that bypasses Hardhat prompts
# This script uses ethers.js directly for deployment

echo "===== FlashLoanArbitrage_v5 Testnet Deployment Script ====="
echo "This script will deploy the FlashLoanArbitrage_v5 contract to BNB Chain Testnet"
echo ""

# Check if required environment variables are set
if [ -z "$PRIVATE_KEY" ]; then
  echo "ERROR: PRIVATE_KEY environment variable is not set."
  echo "Please ensure it is properly set in your environment secrets."
  exit 1
fi

# Ensure the build directory exists
mkdir -p build

# Execute the deployment script
echo "Starting deployment..."
echo ""
node scripts/deploy_testnet_direct.js

# Check if deployment was successful
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Deployment script executed successfully!"
  echo "Please update your index.js with the contract address as shown above."
else
  echo ""
  echo "❌ Deployment failed! Please check the error messages above."
fi