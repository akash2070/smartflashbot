/**
 * Logger utility for Flash Loan Arbitrage Bot
 */
const winston = require('winston');
require('winston-mongodb'); // MongoDB transport

const useMongoDBLogs = process.env.MONGODB_URI ? true : false;
const mongoDBOptions = {
  db: process.env.MONGODB_URI || 'mongodb://localhost:27017/smartflashbot',
  collection: process.env.MONGODB_COLLECTION || 'logs',
  options: {
    useUnifiedTopology: true,
  },
  storeHost: true,
  capped: true,
  cappedSize: 10000000, // 10MB size cap
  metaKey: 'meta'
};

const transports = [
  // Write logs to console
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, service }) => {
        return `${timestamp} [${service}] ${level}: ${message}`;
      })
    )
  })
];

if (!useMongoDBLogs) {
  // Create log directory if it doesn't exist
  const fs = require('fs');
  const path = require('path');
  const logDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
  
  transports.push(
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
} else {
  transports.push(
    new winston.transports.MongoDB(mongoDBOptions)
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'flash-loan-arbitrage-bot' },
  transports: transports
});

if (useMongoDBLogs) {
  logger.info(`Logging to MongoDB at ${mongoDBOptions.db}, collection: ${mongoDBOptions.collection}`);
}

// Create log directory if it doesn't exist
const fs = require('fs');
const path = require('path');
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Additional helper methods
logger.startOperation = function(operationName) {
  this.info(`Starting operation: ${operationName}`);
  return {
    end: (result) => {
      this.info(`Completed operation: ${operationName} - ${result}`);
    },
    error: (err) => {
      this.error(`Failed operation: ${operationName} - ${err.message}`);
    }
  };
};

logger.logTradeAttempt = function(opportunity) {
  this.info(`[TRADE ATTEMPT] ${opportunity.route} | Expected profit: ${opportunity.expectedProfit}`);
};

logger.logTradeSuccess = function(txHash, profit) {
  this.info(`[TRADE SUCCESS] Transaction: ${txHash} | Profit: ${profit}`);
};

logger.logTradeFailure = function(error, opportunity) {
  this.error(`[TRADE FAILURE] ${opportunity.route} | Error: ${error.message}`);
};

logger.logArbitrageOpportunity = function(opportunity) {
  this.info(`[OPPORTUNITY] ${opportunity.buyDex} -> ${opportunity.sellDex} | ${opportunity.pair} | Profit: ${opportunity.expectedProfit}`);
};

module.exports = logger;
