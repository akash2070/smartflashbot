// Simple reliable price dashboard for Flash Loan Arbitrage Bot
(function() {
  let socket;
  
  try {
    // Connect to the server using Socket.IO
    socket = io({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
  } catch (error) {
    console.error('Error initializing Socket.IO:', error);
    // Create fallback socket with mock emit method
    socket = {
      on: function(event, callback) {
        console.warn(`Socket.IO fallback: Event handler for "${event}" registered but socket is disconnected`);
      },
      emit: function(event, data) {
        console.warn(`Socket.IO fallback: Cannot emit "${event}" because socket is disconnected`);
        return false;
      }
    };
  }
  
  // Store for price data
  let tokenPairPrices = {};
  let arbitrageOpportunities = [];
  
  // Constants
  const MIN_ARBITRAGE_THRESHOLD = 0.5; // 0.5% threshold for highlighting opportunities
  const DEFAULT_GAS_PRICE = 0.002; // BNB
  
  // DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing simple price dashboard');
    
    try {
      // Setup event listeners
      setupEventListeners();
      
      // Setup socket listeners
      setupSocketListeners();
      
      // Request initial data
      requestPriceData();
      
      // Hide loading overlay with delay
      setTimeout(function() {
        try {
          const overlay = document.getElementById('loadingOverlay');
          if (overlay) {
            overlay.style.display = 'none';
          }
        } catch (error) {
          console.error('Error hiding loading overlay:', error);
        }
      }, 1500);
    } catch (error) {
      console.error('Error initializing dashboard:', error);
      // Try to hide loading overlay even if initialization failed
      try {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
          overlay.style.display = 'none';
        }
      } catch (overlayError) {
        console.error('Error hiding loading overlay after initialization error:', overlayError);
      }
    }
  });
  
  // Set up button and form event listeners
  function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refreshPrices');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        requestPriceData();
      });
    }
    
    // Token pair checkboxes
    const checkboxes = document.querySelectorAll('.token-pair-checkbox');
    if (checkboxes.length > 0) {
      checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
          renderPriceTable();
        });
      });
    }
    
    // Highlight toggle
    const highlightToggle = document.getElementById('highlightArbitrageToggle');
    if (highlightToggle) {
      highlightToggle.addEventListener('change', function() {
        renderPriceTable();
      });
    }
  }
  
  // Set up socket event listeners
  function setupSocketListeners() {
    try {
      // Connection events
      socket.on('connect', function() {
        console.log('Connected to server');
        updateConnectionStatus(true);
        
        // Request data when connected
        setTimeout(requestPriceData, 500);
      });
      
      socket.on('disconnect', function() {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
      });
      
      socket.on('connect_error', function(error) {
        console.error('Connection error:', error);
        updateConnectionStatus(false);
      });
      
      socket.on('connect_timeout', function() {
        console.error('Connection timeout');
        updateConnectionStatus(false);
      });
      
      // Listen for price data from server
      socket.on('tokenPairPrices', function(data) {
        console.log('Received price data:', data);
        
        try {
          if (data && data.prices) {
            tokenPairPrices = data.prices;
            renderPriceTable();
            updateCounters();
          }
          
          if (data && data.opportunities) {
            arbitrageOpportunities = data.opportunities;
            renderArbitragePaths();
          }
          
          // Update last updated timestamp
          updateTimestamp();
        } catch (error) {
          console.error('Error processing price data:', error);
        }
      });
      
      // Bot status updates
      socket.on('botStatus', function(data) {
        try {
          updateBotStatus(data);
        } catch (error) {
          console.error('Error updating bot status:', error);
        }
      });
    } catch (error) {
      console.error('Error setting up socket listeners:', error);
    }
  }
  
  // Update connection status UI
  function updateConnectionStatus(connected) {
    try {
      const statusIndicator = document.getElementById('botStatusBadge');
      if (statusIndicator) {
        if (connected) {
          statusIndicator.className = 'badge bg-success';
        } else {
          statusIndicator.className = 'badge bg-danger';
        }
      }
      
      const refreshBtn = document.getElementById('refreshPrices');
      if (refreshBtn) {
        refreshBtn.disabled = !connected;
      }
    } catch (error) {
      console.error('Error updating connection status UI:', error);
    }
  }
  
  // Request price data from server
  function requestPriceData() {
    console.log('Requesting price data from server');
    
    // Show loading indicator in table
    const tableBody = document.getElementById('pricesTableBody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">
            <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            Loading price data...
          </td>
        </tr>
      `;
    }
    
    // Request data via socket
    socket.emit('requestPrices');
  }
  
  // Render the price comparison table
  function renderPriceTable() {
    const tableBody = document.getElementById('pricesTableBody');
    if (!tableBody) return;
    
    // Get selected token pairs
    const selectedPairs = getSelectedTokenPairs();
    
    // If no price data available yet
    if (Object.keys(tokenPairPrices).length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-3">
            No price data available. Click refresh to update.
          </td>
        </tr>
      `;
      return;
    }
    
    // If no token pairs are selected
    if (selectedPairs.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-3">
            No token pairs selected. Please select at least one pair.
          </td>
        </tr>
      `;
      return;
    }
    
    // Clear table
    tableBody.innerHTML = '';
    
    // Get highlighting setting
    const highlightToggle = document.getElementById('highlightArbitrageToggle');
    const shouldHighlight = highlightToggle ? highlightToggle.checked : true;
    
    // Create rows for each selected token pair
    for (const pairName of selectedPairs) {
      if (!tokenPairPrices[pairName]) continue;
      
      const pairData = tokenPairPrices[pairName];
      
      // Extract prices
      const priceV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.price : null;
      const priceV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.price : null;
      const priceApe = pairData.apeswap ? pairData.apeswap.price : null;
      
      // Need at least 2 prices to compare
      const prices = [priceV2, priceV3, priceApe].filter(p => p !== null);
      if (prices.length < 2) continue;
      
      // Calculate price difference
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const diffPercent = ((maxPrice - minPrice) / minPrice) * 100;
      
      // Check if it's an arbitrage opportunity
      const isOpportunity = diffPercent >= MIN_ARBITRAGE_THRESHOLD;
      
      // Create row element
      const row = document.createElement('tr');
      
      // Add highlighting if it's an opportunity
      if (isOpportunity && shouldHighlight) {
        row.classList.add('arbitrage-opportunity');
      }
      
      // Format fees and slippage
      const feeV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.swapFee : null;
      const feeV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.swapFee : null;
      const feeApe = pairData.apeswap ? pairData.apeswap.swapFee : null;
      
      const slipV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.slippage : null;
      const slipV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.slippage : null;
      const slipApe = pairData.apeswap ? pairData.apeswap.slippage : null;
      
      // Format gas estimates
      const gasV2 = pairData.pancakeswapV2 ? pairData.pancakeswapV2.gasEstimate : null;
      const gasV3 = pairData.pancakeswapV3 ? pairData.pancakeswapV3.gasEstimate : null;
      const gasApe = pairData.apeswap ? pairData.apeswap.gasEstimate : null;
      
      // Calculate average gas
      const gasValues = [gasV2, gasV3, gasApe].filter(g => g !== null);
      const avgGas = gasValues.length > 0 
        ? gasValues.reduce((sum, val) => sum + val, 0) / gasValues.length 
        : null;
      
      // Calculate potential profit (simplified)
      let profit = 0;
      if (isOpportunity) {
        // Simple profit calculation (1 BNB worth)
        const buyAmount = 1.0; // 1 BNB
        const tokenAmount = buyAmount / minPrice;
        const sellAmount = tokenAmount * maxPrice;
        profit = sellAmount - buyAmount - DEFAULT_GAS_PRICE;
        profit = Math.max(0, profit); // No negative profits
      }
      
      // Format timestamp
      let timeStr = 'N/A';
      if (pairData.timestamp) {
        try {
          timeStr = moment(pairData.timestamp).fromNow();
        } catch (e) {
          console.error('Error formatting time:', e);
          timeStr = new Date(pairData.timestamp).toLocaleTimeString();
        }
      }
      
      // Helper function to format price cell
      function formatPriceCell(price, fee, slip) {
        if (price === null) return 'N/A';
        
        let html = formatPrice(price);
        if (fee !== null && slip !== null) {
          // Show fee with correct precision - display extra decimal places for ultra-low fees (0.01%, 0.015%)
          const feeDisplay = fee < 0.1 ? fee.toFixed(3) : fee.toFixed(2);
          html += `<br><small class="text-muted">${feeDisplay}% / ${slip.toFixed(2)}%</small>`;
        }
        return html;
      }
      
      // Set row HTML
      row.innerHTML = `
        <td><strong>${pairName}</strong></td>
        <td>${formatPriceCell(priceV2, feeV2, slipV2)}</td>
        <td>${formatPriceCell(priceV3, feeV3, slipV3)}</td>
        <td>${formatPriceCell(priceApe, feeApe, slipApe)}</td>
        <td>
          ${diffPercent.toFixed(2)}%
          ${isOpportunity ? '<span class="badge bg-success difference-badge">Opportunity</span>' : ''}
        </td>
        <td>${avgGas !== null ? avgGas.toFixed(4) + ' BNB' : 'N/A'}</td>
        <td>${profit > 0 ? profit.toFixed(4) + ' BNB' : 'N/A'}</td>
        <td>${timeStr}</td>
      `;
      
      // Add row to table
      tableBody.appendChild(row);
    }
  }
  
  // Render arbitrage path visualization
  function renderArbitragePaths() {
    try {
      const container = document.getElementById('arbitragePaths');
      if (!container) {
        console.warn('Arbitrage paths container not found');
        return;
      }
      
      // No opportunities
      if (!arbitrageOpportunities || arbitrageOpportunities.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4 text-muted">
            No arbitrage opportunities detected at this time
          </div>
        `;
        return;
      }
      
      // Build HTML for opportunities
      let html = '';
      
      arbitrageOpportunities.forEach((opp, index) => {
        try {
          if (!opp) return;
          
          const profit = opp.estimatedProfit || 0;
          const profitClass = profit > 0.01 ? 'text-success' : 'text-warning';
          
          html += `
            <div class="card mb-3">
              <div class="card-body">
                <h5 class="card-title">
                  Arbitrage Path #${index + 1}
                  <span class="badge bg-success float-end">${profit.toFixed(4)} BNB</span>
                </h5>
                <div class="d-flex justify-content-between align-items-center mt-3">
                  <div class="text-center">
                    <span class="badge bg-primary p-2">Start</span>
                    <h6 class="mt-2">${opp.startToken || 'Unknown'}</h6>
                    <small>${formatAmount(opp.startAmount)} tokens</small>
                  </div>
                  <div class="text-center">
                    <i class="bi bi-arrow-right fs-3 text-muted"></i>
                    <div>
                      <small class="${profitClass}">via ${opp.dex1 || 'Unknown'}</small>
                    </div>
                  </div>
                  <div class="text-center">
                    <span class="badge bg-secondary p-2">Intermediate</span>
                    <h6 class="mt-2">${opp.midToken || 'Unknown'}</h6>
                    <small>${formatAmount(opp.midAmount)} tokens</small>
                  </div>
                  <div class="text-center">
                    <i class="bi bi-arrow-right fs-3 text-muted"></i>
                    <div>
                      <small class="${profitClass}">via ${opp.dex2 || 'Unknown'}</small>
                    </div>
                  </div>
                  <div class="text-center">
                    <span class="badge bg-success p-2">End</span>
                    <h6 class="mt-2">${opp.endToken || 'Unknown'}</h6>
                    <small>${formatAmount(opp.endAmount)} tokens</small>
                  </div>
                </div>
                <div class="text-end mt-3">
                  <small class="text-muted">
                    Gas Cost: ~${opp.gasCost || '0.001'} BNB | 
                    Net Profit: ${(profit - (opp.gasCost || 0.001)).toFixed(4)} BNB
                  </small>
                </div>
              </div>
            </div>
          `;
        } catch (error) {
          console.error(`Error rendering arbitrage path #${index + 1}:`, error);
        }
      });
      
      container.innerHTML = html;
    } catch (error) {
      console.error('Error rendering arbitrage paths:', error);
    }
  }
  
  // Update counters in summary cards
  function updateCounters() {
    try {
      // Update tracked pairs count
      const trackedPairsCount = document.getElementById('trackedPairsCount');
      if (trackedPairsCount) {
        trackedPairsCount.innerText = Object.keys(tokenPairPrices).length;
      }
      
      // Count and update arbitrage opportunities
      const oppCount = document.getElementById('arbitrageOpportunitiesCount');
      if (oppCount) {
        let count = 0;
        
        try {
          // Count opportunities above threshold
          Object.values(tokenPairPrices).forEach(pair => {
            if (!pair) return;
            
            const priceV2 = pair.pancakeswapV2 ? pair.pancakeswapV2.price : null;
            const priceV3 = pair.pancakeswapV3 ? pair.pancakeswapV3.price : null;
            const priceApe = pair.apeswap ? pair.apeswap.price : null;
            
            const prices = [priceV2, priceV3, priceApe].filter(p => p !== null);
            if (prices.length < 2) return;
            
            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);
            const diffPercent = ((maxPrice - minPrice) / minPrice) * 100;
            
            if (diffPercent >= MIN_ARBITRAGE_THRESHOLD) {
              count++;
            }
          });
        } catch (error) {
          console.error('Error counting arbitrage opportunities:', error);
        }
        
        oppCount.innerText = count;
      }
      
      // Update max profit potential
      const maxProfitEl = document.getElementById('maxProfitPotential');
      if (maxProfitEl) {
        let maxProfit = 0;
        
        try {
          // Calculate total potential profit
          Object.values(tokenPairPrices).forEach(pair => {
            if (!pair) return;
            
            const priceV2 = pair.pancakeswapV2 ? pair.pancakeswapV2.price : null;
            const priceV3 = pair.pancakeswapV3 ? pair.pancakeswapV3.price : null;
            const priceApe = pair.apeswap ? pair.apeswap.price : null;
            
            const prices = [priceV2, priceV3, priceApe].filter(p => p !== null);
            if (prices.length < 2) return;
            
            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);
            const diffPercent = ((maxPrice - minPrice) / minPrice) * 100;
            
            if (diffPercent >= MIN_ARBITRAGE_THRESHOLD) {
              // Simple profit calculation (1 BNB worth)
              const buyAmount = 1.0; // 1 BNB
              const tokenAmount = buyAmount / minPrice;
              const sellAmount = tokenAmount * maxPrice;
              const profit = sellAmount - buyAmount - DEFAULT_GAS_PRICE;
              
              if (profit > 0) {
                maxProfit += profit;
              }
            }
          });
        } catch (error) {
          console.error('Error calculating max profit potential:', error);
        }
        
        maxProfitEl.innerText = maxProfit.toFixed(4) + ' BNB';
      }
    } catch (error) {
      console.error('Error updating counters:', error);
    }
  }
  
  // Update timestamp displays
  function updateTimestamp() {
    try {
      const lastUpdated = document.getElementById('lastUpdated');
      if (lastUpdated) {
        try {
          lastUpdated.innerText = moment().format('MMM D, YYYY HH:mm:ss');
        } catch (momentError) {
          console.error('Error using moment.js:', momentError);
          // Fallback to native Date formatting
          lastUpdated.innerText = new Date().toLocaleString();
        }
      }
      
      const lastPriceUpdate = document.getElementById('lastPriceUpdate');
      if (lastPriceUpdate) {
        try {
          lastPriceUpdate.innerText = moment().format('HH:mm:ss');
        } catch (momentError) {
          console.error('Error using moment.js for time:', momentError);
          // Fallback to native time formatting
          lastPriceUpdate.innerText = new Date().toLocaleTimeString();
        }
      }
    } catch (error) {
      console.error('Error updating timestamps:', error);
    }
  }
  
  // Update bot status display
  function updateBotStatus(data) {
    try {
      if (!data) {
        console.warn('No status data provided to updateBotStatus');
        return;
      }
      
      const status = data.status || 'unknown';
      const statusBadge = document.getElementById('botStatusBadge');
      const statusText = document.getElementById('botStatus');
      
      if (!statusBadge || !statusText) {
        console.warn('Bot status elements not found');
        return;
      }
      
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
    } catch (error) {
      console.error('Error updating bot status:', error);
    }
  }
  
  // Helper: Get selected token pairs
  function getSelectedTokenPairs() {
    try {
      const checkboxes = document.querySelectorAll('.token-pair-checkbox:checked');
      return Array.from(checkboxes).map(cb => cb.value);
    } catch (error) {
      console.error('Error getting selected token pairs:', error);
      return []; // Return empty array to avoid further errors
    }
  }
  
  // Helper: Format price display
  function formatPrice(price) {
    try {
      if (price === null || price === undefined) return 'N/A';
      
      // Ensure price is a number
      const numPrice = Number(price);
      if (isNaN(numPrice)) return 'Invalid';
      
      // Format based on magnitude
      if (numPrice < 0.001) return numPrice.toFixed(6);
      if (numPrice < 1) return numPrice.toFixed(4);
      if (numPrice < 1000) return numPrice.toFixed(2);
      return numPrice.toFixed(0);
    } catch (error) {
      console.error('Error formatting price:', error);
      return 'Error';
    }
  }
  
  // Helper: Format token amount with suffixes
  function formatAmount(amount) {
    try {
      if (!amount) return '0';
      
      // Ensure amount is a number
      const numAmount = Number(amount);
      if (isNaN(numAmount)) return 'Invalid';
      
      if (numAmount >= 1000000000) return (numAmount / 1000000000).toFixed(2) + 'B';
      if (numAmount >= 1000000) return (numAmount / 1000000).toFixed(2) + 'M';
      if (numAmount >= 1000) return (numAmount / 1000).toFixed(2) + 'K';
      return numAmount.toFixed(2);
    } catch (error) {
      console.error('Error formatting amount:', error);
      return 'Error';
    }
  }
})();