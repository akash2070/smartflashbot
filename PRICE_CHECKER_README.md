# DEX Price Checker Utility

This standalone utility allows you to check token prices across different decentralized exchanges (DEXes) on the BNB Chain (Binance Smart Chain). It uses a fallback mechanism to handle RPC rate limits and provides price comparison analysis.

## Features

- Checks prices across multiple DEXes (PancakeSwap V2, PancakeSwap V3, ApeSwap)
- Automatic fallback to alternative RPC endpoints when rate limits are hit
- Tries multiple fee tiers for PancakeSwap V3 to find the best pool
- Calculates potential arbitrage opportunities and factors in exchange fees
- Shows whether price differences would be profitable after fees

## Usage

```bash
node check-prices.js
```

## Output Example

```
=======================================
  BNB Chain DEX Price Checker Utility  
=======================================

Connected to BNB Chain: bnb (Chain ID: 56)
Current gas price: 1.0 Gwei
Current block: 49161352

========== CAKE/WBNB ==========
TokenA: 0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82
TokenB: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
PancakeSwap V2: 0.003308584521342076 (Fee: 0.25%)
PancakeSwap V3: N/A - No active pool found
ApeSwap: 0.003303944778165 (Fee: 0.3%)

📊 Price Differences:
  0.14% difference between PancakeSwap V2 and ApeSwap
  → Buy at ApeSwap (0.003304) and sell at PancakeSwap V2 (0.003309)
  → Total fees: 0.55%
  → Net profit: -0.41%
  ❌ Not profitable after fees

==============================

========== WBNB/BUSD ==========
TokenA: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
TokenB: 0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56
PancakeSwap V2: 598.912585702293207513 (Fee: 0.25%)
PancakeSwap V3: 0.000000000000000599 (Fee: 0.01%)
ApeSwap: 598.548609253217345139 (Fee: 0.3%)

📊 Price Differences:
  0.06% difference between PancakeSwap V2 and ApeSwap
  → Buy at ApeSwap (598.548609) and sell at PancakeSwap V2 (598.912586)
  → Total fees: 0.55%
  → Net profit: -0.49%
  ❌ Not profitable after fees
```

## RPC Endpoints

The utility uses multiple RPC endpoints to avoid rate limiting issues:

1. Premium endpoints:
   - Infura
   - Chainstack
   - QuikNode

2. Public fallback endpoints:
   - Binance public nodes
   - PublicNode.com

## Token Pairs Checked

- CAKE/WBNB (PancakeSwap token / Wrapped BNB)
- WBNB/BUSD (Wrapped BNB / Binance USD)
- WBNB/USDT (Wrapped BNB / Tether USD)
- BUSD/USDT (Binance USD / Tether USD)

## Interpreting Results

For each pair, the utility shows:
1. Current prices across different DEXes with their respective fees
2. Price differences between DEXes as a percentage
3. Direction for potential arbitrage (which DEX to buy on, which to sell on)
4. Total fees that would be incurred for the round trip trade
5. Net profit percentage after fees
6. Clear indication if the opportunity is profitable or not

## Troubleshooting

If you encounter errors:

1. RPC rate limiting: The utility will automatically try alternative RPC endpoints
2. "No active pool found": The pair may not have liquidity on that particular DEX or fee tier
3. "division-by-zero": Typically occurs when trying to get prices from PancakeSwap V3 pools that don't exist