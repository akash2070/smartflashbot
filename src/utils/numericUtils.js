/**
 * Utilities for safely handling numeric operations with ethers.js BigNumber
 */
const { ethers } = require('ethers');
const logger = require('./logger');

/**
 * Safely convert a BigNumber to a number with fallback value on errors
 * @param {BigNumber} bigNumber - The BigNumber to convert
 * @param {number} fallbackValue - Fallback value if conversion fails
 * @returns {number} - The converted number or fallback value
 */
function safeToNumber(bigNumber, fallbackValue = 0) {
  try {
    // Check if the value is too large to be safely converted
    if (bigNumber.gt(ethers.constants.MaxUint256.div(2))) {
      logger.warn('BigNumber too large for safe conversion, using fallback');
      return fallbackValue;
    }
    
    return bigNumber.toNumber();
  } catch (error) {
    logger.warn(`Error converting BigNumber to number: ${error.message}`);
    return fallbackValue;
  }
}

/**
 * Safely divide two BigNumbers with protection against division-by-zero
 * @param {BigNumber} numerator - The numerator BigNumber
 * @param {BigNumber} denominator - The denominator BigNumber
 * @param {BigNumber} fallbackValue - Fallback value if division fails
 * @returns {BigNumber} - The result of division or fallback value
 */
function safeDivide(numerator, denominator, fallbackValue = ethers.BigNumber.from(0)) {
  try {
    // Check for division by zero or very small numbers
    if (denominator.isZero() || denominator.eq(ethers.constants.Zero)) {
      logger.warn('Attempted division by zero, using fallback value');
      return fallbackValue;
    }
    
    return numerator.div(denominator);
  } catch (error) {
    logger.warn(`Error in BigNumber division: ${error.message}`);
    return fallbackValue;
  }
}

/**
 * Format a BigNumber for display with appropriate decimal places
 * @param {BigNumber} amount - The amount to format
 * @param {number} decimals - Number of decimals the token has
 * @param {number} displayDecimals - Number of decimals to display
 * @returns {string} - Formatted string representation
 */
function formatBigNumberForDisplay(amount, decimals = 18, displayDecimals = 6) {
  try {
    if (!amount) return '0';
    
    const formatted = ethers.utils.formatUnits(amount, decimals);
    
    // Parse to float and fix to desired display decimals
    const value = parseFloat(formatted);
    return value.toFixed(displayDecimals);
  } catch (error) {
    logger.warn(`Error formatting BigNumber: ${error.message}`);
    return '0';
  }
}

/**
 * Check if a BigNumber is safe to convert to a number
 * @param {BigNumber} bigNumber - The BigNumber to check
 * @returns {boolean} - True if safe to convert, false otherwise
 */
function isSafeNumber(bigNumber) {
  try {
    // Check if within safe range
    if (!bigNumber) return false;
    
    const MAX_SAFE = ethers.BigNumber.from(Number.MAX_SAFE_INTEGER);
    return bigNumber.lte(MAX_SAFE);
  } catch (error) {
    return false;
  }
}

/**
 * Calculate percentage difference between two BigNumbers
 * @param {BigNumber} a - First BigNumber
 * @param {BigNumber} b - Second BigNumber
 * @returns {number} - Percentage difference as a number
 */
function calculatePercentageDifference(a, b) {
  try {
    if (a.isZero() && b.isZero()) return 0;
    
    // Handle case where either value is zero
    if (a.isZero()) return 100;
    if (b.isZero()) return 100;
    
    // Use a precision factor of 10000 for calculation (0.01%)
    const precisionFactor = ethers.BigNumber.from(10000);
    
    // Calculate |a - b| / ((a + b) / 2) * 100
    const diff = a.gt(b) ? a.sub(b) : b.sub(a);
    const avg = a.add(b).div(2);
    if (avg.isZero()) return 0;
    
    const percentage = diff.mul(precisionFactor).mul(100).div(avg);
    return percentage.toNumber() / precisionFactor.toNumber();
  } catch (error) {
    logger.warn(`Error calculating percentage difference: ${error.message}`);
    return 0;
  }
}

module.exports = {
  safeToNumber,
  safeDivide,
  formatBigNumberForDisplay,
  isSafeNumber,
  calculatePercentageDifference
};