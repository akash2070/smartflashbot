#!/bin/bash

# Direct deployment script for FlashLoanArbitrage_v5 contract
# Uses Hardhat to deploy to BNB Chain Testnet

echo "===== FlashLoanArbitrage_v5 Deployment Script ====="
echo "This script will deploy the updated FlashLoanArbitrage_v5 contract to BNB Chain Testnet"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Error: .env file not found!"
  echo "Please create a .env file with PRIVATE_KEY and BNB_TESTNET_RPC_URL defined."
  exit 1
fi

# Check if PRIVATE_KEY is set in .env
if ! grep -q "PRIVATE_KEY" .env; then
  echo "Error: PRIVATE_KEY not found in .env file!"
  exit 1
fi

# Check if contract file exists
if [ ! -f contracts/FlashLoanArbitrage_v5.sol ]; then
  echo "Error: contracts/FlashLoanArbitrage_v5.sol not found!"
  echo "Please ensure the contract file exists before running this script."
  exit 1
fi

echo "Running deployment script..."
echo ""

# Execute the Hardhat deployment script
npx hardhat run scripts/deploy_v5.js --network bnbtestnet

# Check exit status of previous command
if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Deployment completed successfully!"
  echo "Please update the DEPLOYED_CONTRACT object in index.js with the address above."
else
  echo ""
  echo "❌ Deployment failed! Please check the error message above."
fi