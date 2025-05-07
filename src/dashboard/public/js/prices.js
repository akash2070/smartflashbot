// Connect to the server using Socket.IO with reconnection
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: Infinity
});

// Track token pair prices
let tokenPairPrices = {};
let arbitrageOpportunities = [];

// Global configuration
const defaultGasPrice = 0.002; // BNB
const defaultTradeAmount = 1.0; // BNB
const minArbitrageThreshold = 1.0; // 1% difference for arbitrage opportunity

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing price dashboard');
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up Socket.IO event handlers
  setupSocketEvents();
  
  // Request initial price data
  requestPriceData();
  
  // Hide loading overlay
  setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }, 1000);
  
  // Set up auto-refresh timer (every 1 minute to reduce API calls)
  setInterval(requestPriceData, 60000); // 1 minute = 60,000ms
});

// Set up event listeners
function setupEventListeners() {
  // Refresh button click handler
  const refreshBtn = document.getElementById('refreshPrices');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      requestPriceData();
    });
  }
  
  // Token pair checkboxes change handler
  const checkboxes = document.querySelectorAll('.token-pair-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      updatePriceTable();
      updateArbitragePaths();
      updateOpportunityCounts();
    });
  });
  
  // Highlight arbitrage toggle
  const highlightToggle = document.getElementById('highlightArbitrageToggle');
  if (highlightToggle) {
    highlightToggle.addEventListener('change', function() {
      updatePriceTable();
    });
  }
}

// Set up Socket.IO event handlers
function setupSocketEvents() {
  // Price data update event
  socket.on('tokenPairPrices', function(data) {
    console.log('Received price update:', data);
    
    // Debug specific pair data
    if (data && data.prices) {
      console.log('WBNB/BUSD data:', data.prices['WBNB/BUSD']);
      
      // Check structure of each pair in prices
      Object.keys(data.prices).forEach(pairName => {
        console.log(`Data for ${pairName}:`, data.prices[pairName]);
      });
    }
    
    // Update token pair prices
    if (data && data.prices) {
      tokenPairPrices = data.prices;
      
      // Update UI
      updatePriceTable();
      updateOpportunityCounts();
      updateLastPriceUpdate();
    }
    
    // Update arbitrage opportunities
    if (data && data.arbitrageOpportunities) {
      arbitrageOpportunities = data.arbitrageOpportunities;
      updateArbitragePaths();
    }
  });
  
  // Bot status update event
  socket.on('botStatus', function(data) {
    updateBotStatus(data);
  });
}

// Request price data from the server
function requestPriceData() {
  console.log('Requesting price data');
  
  // Show loading state
  const tableBody = document.getElementById('pricesTableBody');
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          Loading price data...
        </td>
      </tr>
    `;
  }
  
  // Emit request to server
  socket.emit('requestPrices');
}

// Update the price comparison table
function updatePriceTable() {
  const tableBody = document.getElementById('pricesTableBody');
  if (!tableBody) return;
  
  tableBody.innerHTML = '';
  
  // Get selected token pairs
  const selectedPairs = getSelectedTokenPairs();
  
  if (Object.keys(tokenPairPrices).length === 0) {
    // No price data yet
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-muted">
          No price data available yet. Click refresh to update.
        </td>
      </tr>
    `;
    return;
  }
  
  // Filter to only show selected pairs
  const availablePairs = Object.keys(tokenPairPrices);
  console.log('Available token pairs in data:', availablePairs);
  console.log('Selected token pairs from UI:', selectedPairs);
  
  const filteredPairs = availablePairs.filter(pairName => selectedPairs.includes(pairName));
  console.log('Filtered pairs after selection:', filteredPairs);
  
  // Debug for WBNB/BUSD specifically
  if (availablePairs.includes('WBNB/BUSD')) {
    console.log('WBNB/BUSD is available in the dataset');
    console.log('Is WBNB/BUSD selected?', selectedPairs.includes('WBNB/BUSD'));
  } else {
    console.log('WBNB/BUSD is missing from the dataset');
  }
  
  if (filteredPairs.length === 0) {
    // No selected pairs
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-muted">
          No token pairs selected. Please select at least one pair.
        </td>
      </tr>
    `;
    return;
  }
  
  // Get the highlight setting
  const highlightToggle = document.getElementById('highlightArbitrageToggle');
  const shouldHighlight = highlightToggle ? highlightToggle.checked : true;
  
  // Create table rows for each token pair
  filteredPairs.forEach(pairName => {
    const pairData = tokenPairPrices[pairName];
    if (!pairData) return;
    
    // Calculate price differences
    const pricesPV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.price : null;
    const pricesPV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.price : null;
    const pricesApe = pairData.apeswap ? pairData.apeswap.price : null;
    const pricesBiswap = pairData.biswap ? pairData.biswap.price : null;
    
    // Find max difference
    const prices = [pricesPV2, pricesPV3, pricesApe, pricesBiswap].filter(p => p !== null);
    
    // Special case for WBNB/BUSD - show it even with just one price source
    if (prices.length < 2 && pairName !== 'WBNB/BUSD') {
      // Not enough price data for comparison for non-WBNB/BUSD pairs
      console.log(`Skipping ${pairName} as it only has ${prices.length} price sources`);
      return;
    }
    
    // If it's WBNB/BUSD, always show it regardless of how many price sources we have
    if (pairName === 'WBNB/BUSD') {
      console.log(`Displaying WBNB/BUSD with ${prices.length} price sources`);
    }
    
    let maxPrice, minPrice, maxDiffPercent;
    
    if (pairName === 'WBNB/BUSD' && prices.length === 1) {
      // Special case: only one price source for WBNB/BUSD
      maxPrice = minPrice = prices[0];
      maxDiffPercent = 0;
      console.log('Only one price source for WBNB/BUSD, setting difference to 0%');
    } else {
      // Normal case with multiple prices
      maxPrice = Math.max(...prices);
      minPrice = Math.min(...prices);
      maxDiffPercent = ((maxPrice - minPrice) / minPrice) * 100;
    }
    
    // Determine if this is an arbitrage opportunity
    const isArbitrageOpportunity = maxDiffPercent >= minArbitrageThreshold;
    
    // Calculate profit potential
    let profitPotential = 0;
    if (isArbitrageOpportunity) {
      profitPotential = calculateProfitPotential(pairName, pricesPV2, pricesPV3, pricesApe, pricesBiswap);
    }
    
    // Create table row
    const row = document.createElement('tr');
    
    // Add arbitrage opportunity highlight class
    if (isArbitrageOpportunity && shouldHighlight) {
      row.classList.add('arbitrage-opportunity');
    }
    
    // Format timestamp
    let updatedTime = 'N/A';
    if (pairData.timestamp) {
      try {
        updatedTime = moment(pairData.timestamp).fromNow();
      } catch (e) {
        console.error('Error formatting time with moment:', e);
        updatedTime = new Date(pairData.timestamp).toLocaleTimeString();
      }
    }
    
    // Get fee and slippage info
    const feeV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.swapFee : null;
    const feeV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.swapFee : null;
    const feeApe = pairData.apeswap ? pairData.apeswap.swapFee : null;
    const feeBiswap = pairData.biswap ? pairData.biswap.swapFee : null;
    
    const slippageV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.slippage : null;
    const slippageV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.slippage : null;
    const slippageApe = pairData.apeswap ? pairData.apeswap.slippage : null;
    const slippageBiswap = pairData.biswap ? pairData.biswap.slippage : null;
    
    // Get gas estimates
    const gasEstV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.gasEstimate : null;
    const gasEstV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.gasEstimate : null;
    const gasEstApe = pairData.apeswap ? pairData.apeswap.gasEstimate : null;
    const gasEstBiswap = pairData.biswap ? pairData.biswap.gasEstimate : null;
    
    // Calculate average gas estimate
    const gasEstimates = [gasEstV2, gasEstV3, gasEstApe].filter(g => g !== null);
    let avgGasEstimate = null;
    if (gasEstimates.length > 0) {
      avgGasEstimate = gasEstimates.reduce((sum, val) => sum + val, 0) / gasEstimates.length;
    }
    
    // Helper function to format price info cell
    const formatPriceCell = (price, fee, slippage) => {
      let html = formatPrice(price);
      if (fee !== null && slippage !== null) {
        html += `<br><small class="text-muted">${fee}% / ${slippage.toFixed(2)}%</small>`;
      }
      return html;
    };
    
    // Create row HTML
    row.innerHTML = `
      <td>
        <strong>${pairName}</strong>
      </td>
      <td>
        ${formatPriceCell(pricesPV2, feeV2, slippageV2)}
      </td>
      <td>
        ${formatPriceCell(pricesPV3, feeV3, slippageV3)}
      </td>
      <td>
        ${formatPriceCell(pricesApe, feeApe, slippageApe)}
      </td>
      <td>
        ${formatPriceCell(pricesBiswap, feeBiswap, slippageBiswap)}
      </td>
      <td>
        ${maxDiffPercent.toFixed(2)}%
        ${isArbitrageOpportunity ? 
          `<span class="badge bg-success difference-badge">Opportunity</span>` : ''}
      </td>
      <td>
        ${avgGasEstimate !== null ? avgGasEstimate.toFixed(4) + ' BNB' : 'N/A'}
      </td>
      <td>${profitPotential > 0 ? profitPotential.toFixed(4) + ' BNB' : 'N/A'}</td>
      <td>${updatedTime}</td>
    `;
    
    tableBody.appendChild(row);
  });
}

// Update arbitrage opportunity counts
function updateOpportunityCounts() {
  const trackedPairsCount = document.getElementById('trackedPairsCount');
  const arbitrageOpportunitiesCount = document.getElementById('arbitrageOpportunitiesCount');
  const maxProfitPotential = document.getElementById('maxProfitPotential');
  
  if (!trackedPairsCount || !arbitrageOpportunitiesCount || !maxProfitPotential) {
    return;
  }
  
  // Count opportunities
  const opportunities = Object.values(tokenPairPrices).filter(pairData => {
    if (!pairData) return false;
    
    // Calculate price differences
    const pricesPV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.price : null;
    const pricesPV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.price : null;
    const pricesApe = pairData.apeswap ? pairData.apeswap.price : null;
    const pricesBiswap = pairData.biswap ? pairData.biswap.price : null;
    
    // Find max difference
    const prices = [pricesPV2, pricesPV3, pricesApe, pricesBiswap].filter(p => p !== null);
    
    // Special check for WBNB/BUSD pair
    const pairName = Object.keys(pairData.pancakeswapV2 || pairData.pancakeswapV3 || pairData.apeswap || pairData.biswap || {})[0];
    if (prices.length < 2) {
      if (pairName === 'WBNB/BUSD') {
        // Allow WBNB/BUSD with one price source but it's not an arbitrage opportunity
        return false;
      }
      return false;
    }
    
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const maxDiffPercent = ((maxPrice - minPrice) / minPrice) * 100;
    
    // Return true if difference is significant
    return maxDiffPercent >= minArbitrageThreshold;
  });
  
  // Update counts
  trackedPairsCount.innerText = Object.keys(tokenPairPrices).length;
  arbitrageOpportunitiesCount.innerText = opportunities.length;
  
  // Calculate max profit potential
  const maxProfit = calculateMaxProfitPotential();
  maxProfitPotential.innerText = `${maxProfit.toFixed(4)} BNB`;
}

// Update the last price update time
function updateLastPriceUpdate() {
  const lastPriceUpdate = document.getElementById('lastPriceUpdate');
  const lastUpdated = document.getElementById('lastUpdated');
  
  if (lastPriceUpdate) {
    lastPriceUpdate.innerText = moment().format('HH:mm:ss');
  }
  
  if (lastUpdated) {
    lastUpdated.innerText = moment().format('MMM D, YYYY HH:mm:ss');
  }
}

// Update arbitrage paths visualization
function updateArbitragePaths() {
  const container = document.getElementById('arbitragePaths');
  if (!container) return;
  
  if (!arbitrageOpportunities || arbitrageOpportunities.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-muted">
        No arbitrage opportunities detected at the moment
      </div>
    `;
    return;
  }
  
  // Build the HTML for arbitrage paths
  let pathsHtml = '';
  
  arbitrageOpportunities.forEach((opportunity, index) => {
    if (!opportunity) return;
    
    const profitAmount = opportunity.estimatedProfit || 0;
    const profitClass = profitAmount > 0.01 ? 'text-success' : 'text-warning';
    
    pathsHtml += `
      <div class="card mb-3">
        <div class="card-body">
          <h5 class="card-title">
            Arbitrage Path #${index + 1}
            <span class="badge bg-success float-end">${profitAmount.toFixed(4)} BNB</span>
          </h5>
          <div class="d-flex justify-content-between align-items-center mt-3">
            <div class="text-center">
              <span class="badge bg-primary p-2">Start</span>
              <h6 class="mt-2">${opportunity.startToken || 'Unknown'}</h6>
              <small>${formatAmount(opportunity.startAmount)} tokens</small>
            </div>
            <div class="text-center">
              <i class="bi bi-arrow-right fs-3 text-muted"></i>
              <div>
                <small class="${profitClass}">via ${opportunity.dex1 || 'Unknown'}</small>
              </div>
            </div>
            <div class="text-center">
              <span class="badge bg-secondary p-2">Intermediate</span>
              <h6 class="mt-2">${opportunity.midToken || 'Unknown'}</h6>
              <small>${formatAmount(opportunity.midAmount)} tokens</small>
            </div>
            <div class="text-center">
              <i class="bi bi-arrow-right fs-3 text-muted"></i>
              <div>
                <small class="${profitClass}">via ${opportunity.dex2 || 'Unknown'}</small>
              </div>
            </div>
            <div class="text-center">
              <span class="badge bg-success p-2">End</span>
              <h6 class="mt-2">${opportunity.endToken || 'Unknown'}</h6>
              <small>${formatAmount(opportunity.endAmount)} tokens</small>
            </div>
          </div>
          <div class="text-end mt-3">
            <small class="text-muted">
              Gas Cost: ~${opportunity.gasCost || '0.001'} BNB | 
              Net Profit: ${(profitAmount - (opportunity.gasCost || 0.001)).toFixed(4)} BNB
            </small>
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = pathsHtml;
}

// Update bot status
function updateBotStatus(data) {
  if (!data) return;
  
  const status = data.status || 'unknown';
  const statusBadge = document.getElementById('botStatusBadge');
  const statusText = document.getElementById('botStatus');
  
  if (!statusBadge || !statusText) return;
  
  statusText.innerText = status.charAt(0).toUpperCase() + status.slice(1);
  
  // Update badge color
  statusBadge.className = 'badge';
  
  switch (status) {
    case 'running':
      statusBadge.classList.add('bg-success');
      break;
    case 'paused':
      statusBadge.classList.add('bg-warning');
      break;
    case 'error':
      statusBadge.classList.add('bg-danger');
      break;
    default:
      statusBadge.classList.add('bg-secondary');
  }
}

// Helper function to get selected token pairs
function getSelectedTokenPairs() {
  const checkboxes = document.querySelectorAll('.token-pair-checkbox:checked');
  const selectedPairs = Array.from(checkboxes).map(cb => cb.value);
  console.log('Selected token pairs:', selectedPairs);
  
  // Debug the available token pairs
  console.log('Available token pairs in data:', Object.keys(tokenPairPrices));
  
  return selectedPairs;
}

// Helper function to format price
function formatPrice(price) {
  if (price === null || price === undefined) {
    return 'N/A';
  }
  
  // Format based on magnitude
  if (price < 0.001) {
    return price.toFixed(6);
  } else if (price < 1) {
    return price.toFixed(4);
  } else if (price < 1000) {
    return price.toFixed(2);
  } else {
    return price.toFixed(0);
  }
}

// Helper function to format amount
function formatAmount(amount) {
  if (!amount) return '0';
  
  // Format large numbers with abbreviations
  if (amount > 1000000000) {
    return (amount / 1000000000).toFixed(2) + 'B';
  } else if (amount > 1000000) {
    return (amount / 1000000).toFixed(2) + 'M';
  } else if (amount > 1000) {
    return (amount / 1000).toFixed(2) + 'K';
  } else {
    return amount.toFixed(2);
  }
}

// Calculate profit potential for a pair
function calculateProfitPotential(pairName, priceV2, priceV3, priceApe, priceBiswap) {
  // Get prices and filter out nulls
  const prices = [
    { dex: 'PancakeSwap V2', price: priceV2 },
    { dex: 'PancakeSwap V3', price: priceV3 },
    { dex: 'ApeSwap', price: priceApe },
    { dex: 'BiSwap', price: priceBiswap }
  ].filter(p => p.price !== null);
  
  // Need at least 2 prices to calculate
  if (prices.length < 2) return 0;
  
  // Sort by price
  prices.sort((a, b) => a.price - b.price);
  
  // Get lowest and highest
  const lowest = prices[0];
  const highest = prices[prices.length - 1];
  
  // Calculate potential profit (assuming 1 BNB worth of tokens)
  const buyAmount = defaultTradeAmount; // 1 BNB worth
  const tokenAmount = buyAmount / lowest.price;
  const sellAmount = tokenAmount * highest.price;
  const profitBeforeFees = sellAmount - buyAmount;
  
  // Estimate fees (0.3% per swap plus gas costs)
  const swapFees = buyAmount * 0.003 + sellAmount * 0.003;
  const gasCost = defaultGasPrice; // Estimated gas cost in BNB
  
  // Calculate net profit
  const netProfit = profitBeforeFees - swapFees - gasCost;
  
  // Return positive profit only
  return Math.max(0, netProfit);
}

// Calculate max profit potential across all pairs
function calculateMaxProfitPotential() {
  // Get selected token pairs
  const selectedPairs = getSelectedTokenPairs();
  
  // Calculate profit potential for each pair
  let totalProfit = 0;
  
  Object.keys(tokenPairPrices)
    .filter(pairName => selectedPairs.includes(pairName))
    .forEach(pairName => {
      const pairData = tokenPairPrices[pairName];
      if (!pairData) return;
      
      // Get prices
      const pricesPV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.price : null;
      const pricesPV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.price : null;
      const pricesApe = pairData.apeswap ? pairData.apeswap.price : null;
      const pricesBiswap = pairData.biswap ? pairData.biswap.price : null;
      
      // Calculate profit potential
      const profit = calculateProfitPotential(pairName, pricesPV2, pricesPV3, pricesApe, pricesBiswap);
      totalProfit += profit;
    });
  
  return totalProfit;
}

// Add CSS styles for the arbitrage opportunity highlight
document.addEventListener('DOMContentLoaded', function() {
  // Add custom CSS for the arbitrage-opportunity class
  const style = document.createElement('style');
  style.textContent = `
    .arbitrage-opportunity {
      background-color: rgba(25, 135, 84, 0.1) !important;
      font-weight: 500;
    }
    .price-card {
      transition: all 0.3s ease;
    }
    .price-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
    }
  `;
  document.head.appendChild(style);
});