const { ethers } = require('ethers');
require('dotenv').config();

async function getContractAddress(txHash) {
  try {
    // Connect to testnet
    const provider = new ethers.providers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545/');
    
    // Get transaction receipt
    console.log(`Fetching transaction receipt for: ${txHash}`);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      console.log('Transaction not found or still pending');
      return null;
    }
    
    console.log('Transaction Receipt:', JSON.stringify(receipt, null, 2));
    
    // For contract creation, the contract address is in the receipt
    if (receipt.contractAddress) {
      console.log(`\nContract Address: ${receipt.contractAddress}`);
      return receipt.contractAddress;
    } else {
      console.log('\nThis is not a contract creation transaction');
      return null;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

async function main() {
  const txHash = '0x12dc19b6eb16bb6a61508999de9d84cb74a7981e46d7008f7f24a38e5faeb07f';
  await getContractAddress(txHash);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error in main:', error);
    process.exit(1);
  });