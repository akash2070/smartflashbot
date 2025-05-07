# Flash Loan Arbitrage Bot for BNB Chain

An advanced autonomous blockchain trading bot leveraging sophisticated MEV (Miner Extractable Value) strategies on BNB Chain, with intelligent arbitrage capabilities and dynamic exchange interactions.

## Features

- **Flash Loan Arbitrage**: Automatically detects price differences between DEXes and executes profitable arbitrage trades using flash loans
- **Multiple DEX Support**: Integrates with PancakeSwap (V2 & V3), ApeSwap, and BiSwap
- **Ultra-Low Fee Optimization**: Leverages PancakeSwap V3's 0.01% and 0.015% fee tiers for stable pairs
- **Intelligent Position Sizing**: Dynamic calculation of optimal flash loan size based on liquidity and market conditions
- **Real-time Dashboard**: Monitor performance metrics, arbitrage opportunities, and profit history
- **Safety Mechanisms**: Built-in protections against network congestion, MEV attacks, and unfavorable market conditions

## Technologies Used

- **Blockchain**: BNB Chain
- **Exchanges**: PancakeSwap (V2 & V3), ApeSwap, BiSwap
- **Core Technologies**: Ethers.js, Express, Socket.IO, Node.js
- **Key Capabilities**: Advanced Trading Algorithms, Smart Router Integration, DEX Strategy Optimization

## Dashboard Features

- Real-time price comparison across exchanges
- Arbitrage opportunity detection and execution tracking
- Fee tier visualization for different token pairs
- Performance metrics and profit tracking
- Network status and safety monitoring

## Architecture

The bot follows a modular architecture with separate components for:
- DEX interactions (`src/dex/`)
- Arbitrage calculations (`src/arbitrage/`)
- Flash loan execution (`src/flashloan/`)
- Dashboard visualization (`src/dashboard/`)
- Safety monitoring (`src/utils/safetyManager.js`)

## Setup and Configuration

### Prerequisites
- Node.js v16+
- BNB Chain RPC URL
- Private key for transaction signing

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/flash-loan-arbitrage-bot.git
cd flash-loan-arbitrage-bot
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
Create a `.env` file with the following:
```
BNB_RPC_URL_KEY=https://your-bnb-chain-rpc-url
PRIVATE_KEY=your-private-key-without-0x-prefix
```

### Running the Bot

Start the arbitrage bot:
```bash
node index.js
```

Start the dashboard server:
```bash
node dashboard-server.js
```

Access the dashboard at http://localhost:5000

## Railway Deployment

To deploy the Flash Loan Arbitrage Bot on Railway:

1. Create a new project on Railway
2. Connect your GitHub repository
3. Configure the following environment variables:
   - `PRIVATE_KEY`: Your wallet private key (without 0x prefix)
   - `BNB_RPC_URL_KEY`: A reliable BNB Chain RPC URL
   - `SESSION_SECRET`: A secure random string for dashboard authentication
   - `WEBSOCKET_ENDPOINT_1`: (Optional) WebSocket endpoint for real-time updates
   - `MEV_PROTECTION_ENABLED`: Set to "true" to enable MEV protection
   - Other settings as needed from the .env.template file

Railway will automatically use the Procfile to start both the dashboard (web) and the bot (worker) processes.

**Note**: The bot is designed to handle temporary RPC connection issues and will automatically retry connections.

## Safety Features

- Cooldown periods after failed transactions
- Network congestion detection
- Competitive MEV bot detection
- Maximum slippage caps by DEX
- Flash loan size limits based on liquidity

## Fee Structure by DEX

- ApeSwap: 0.3% swap fee, 1.2% max slippage
- PancakeSwap V2: 0.25% swap fee, 1.0% max slippage
- BiSwap: 0.2% swap fee, 0.7% max slippage
- PancakeSwap V3: Variable fees (0.01% for stable pairs, 0.05% for popular pairs, etc.), 0.5% max slippage

## License

[MIT](LICENSE)

## Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves significant risk. Use at your own risk.
