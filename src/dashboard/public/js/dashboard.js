// Connect to the server using Socket.IO
const socket = io();

// Charts
let profitHistoryChart = null;
let opportunityChart = null;

// Cache for configuration
let configData = null;

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
  // Initialize charts
  initCharts();
  
  // Fetch initial data
  fetchConfig();
  fetchStats();
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up Socket.IO event handlers
  setupSocketEvents();
  
  // Hide loading overlay
  setTimeout(() => {
    document.getElementById('loadingOverlay').style.display = 'none';
  }, 1000);
});

// Initialize charts
function initCharts() {
  try {
    // Profit History Chart
    const profitHistoryCtx = document.getElementById('profitHistoryChart');
    if (profitHistoryCtx) {
      const ctx = profitHistoryCtx.getContext('2d');
      profitHistoryChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Profit (BNB)',
            data: [],
            backgroundColor: 'rgba(46, 204, 113, 0.2)',
            borderColor: 'rgba(46, 204, 113, 1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'hour',
                displayFormats: {
                  hour: 'HH:mm'
                }
              },
              title: {
                display: true,
                text: 'Time'
              }
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Profit (BNB)'
              }
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `Profit: ${context.parsed.y.toFixed(6)} BNB`;
                }
              }
            }
          }
        }
      });
    } else {
      console.warn('Profit History Chart element not found');
    }
    
    // Opportunity Distribution Chart
    const opportunityCtx = document.getElementById('opportunityChart');
    if (opportunityCtx) {
      const ctx = opportunityCtx.getContext('2d');
      opportunityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Executed', 'Failed', 'Not Profitable'],
          datasets: [{
            data: [0, 0, 0],
            backgroundColor: [
              'rgba(46, 204, 113, 0.7)',
              'rgba(231, 76, 60, 0.7)',
              'rgba(149, 165, 166, 0.7)'
            ],
            borderColor: [
              'rgba(46, 204, 113, 1)',
              'rgba(231, 76, 60, 1)',
              'rgba(149, 165, 166, 1)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    } else {
      console.warn('Opportunity Chart element not found');
    }
  } catch (error) {
    console.error('Error initializing charts:', error);
    // Continue with the application even if charts fail to initialize
  }
}

// Set up event listeners
function setupEventListeners() {
  // Time range selector for profit history chart
  document.getElementById('profitTimeRange').addEventListener('click', function(event) {
    if (event.target.tagName === 'BUTTON') {
      // Update active button
      const buttons = this.querySelectorAll('button');
      buttons.forEach(button => button.classList.remove('active'));
      event.target.classList.add('active');
      
      // Update chart with selected time range
      const range = event.target.getAttribute('data-range');
      updateProfitHistoryChart(range);
    }
  });
}

// Set up Socket.IO event handlers
function setupSocketEvents() {
  // Update stats when received from server
  socket.on('stats', function(stats) {
    updateDashboard(stats);
  });
  
  // Handle new transactions
  socket.on('transaction', function(transaction) {
    addTransactionToList(transaction);
  });
  
  // Handle bot status changes
  socket.on('botStatus', function(statusData) {
    updateBotStatus(statusData);
  });
  
  // Handle safety status updates
  socket.on('safetyStatus', function(safetyData) {
    updateSafetyStatus(safetyData);
  });
  
  // Connection events
  socket.on('connect', function() {
    console.log('Connected to server');
    updateConnectionStatus(true);
    
    // Initialize default gas price to 1.0 Gwei when connected
    const currentGasPriceElement = document.getElementById('currentGasPrice');
    if (currentGasPriceElement) {
      currentGasPriceElement.textContent = '1.0 Gwei';
    }
  });
  
  socket.on('disconnect', function() {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
  });
}

// Fetch configuration data
function fetchConfig() {
  fetch('/api/config')
    .then(response => response.json())
    .then(data => {
      configData = data;
      updateConfigDisplay(data);
    })
    .catch(error => {
      console.error('Error fetching config:', error);
    });
}

// Fetch statistics data
function fetchStats() {
  fetch('/api/stats')
    .then(response => response.json())
    .then(data => {
      updateDashboard(data);
    })
    .catch(error => {
      console.error('Error fetching stats:', error);
    });
}

// Update the dashboard with new stats
function updateDashboard(stats) {
  try {
    // Helper function to safely update element text content
    const safeUpdateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      } else {
        console.warn(`Element with id '${id}' not found`);
      }
    };

    // Update summary stats
    safeUpdateElement('totalProfit', Number(stats.totalProfit).toFixed(6));
    safeUpdateElement('executedArbitrages', stats.executedArbitrages);
    safeUpdateElement('successRate', stats.successRate + '%');
    safeUpdateElement('totalOpportunities', stats.totalOpportunities);
    
    // Update MEV stats if they exist
    if (stats.mevStats) {
      safeUpdateElement('backrunsDetected', stats.mevStats.backrunsDetected);
      safeUpdateElement('backrunsExecuted', stats.mevStats.backrunsExecuted);
      safeUpdateElement('sandwichesDetected', stats.mevStats.sandwichesDetected);
      safeUpdateElement('sandwichesExecuted', stats.mevStats.sandwichesExecuted);
      safeUpdateElement('hourlyMevProfit', Number(stats.mevStats.hourlyProfit).toFixed(6) + ' BNB');
    }
    
    // Update timestamp
    safeUpdateElement('lastUpdated', formatDate(stats.lastUpdated));
    
    // Update wallet address
    safeUpdateElement('walletAddress', stats.walletAddress || '-');
    
    // Update opportunity chart
    updateOpportunityChart(stats);
    
    // Update profit history chart if there's data
    if (stats.profitHistory && stats.profitHistory.length > 0) {
      updateProfitHistoryChartData(stats.profitHistory);
    }
    
    // Update recent transactions
    if (stats.recentTransactions && stats.recentTransactions.length > 0) {
      updateRecentTransactions(stats.recentTransactions);
    }
    
    // Update bot status badge
    updateBotStatus({ status: stats.botStatus, message: stats.statusMessage });
  } catch (error) {
    console.error('Error updating dashboard:', error);
  }
}

// Update opportunity chart
function updateOpportunityChart(stats) {
  try {
    if (!opportunityChart) {
      console.warn('Opportunity chart not initialized');
      return;
    }
    
    const executed = stats.executedArbitrages;
    const failed = stats.failedArbitrages;
    const notProfitable = stats.totalOpportunities > 0 
      ? (stats.totalOpportunities - stats.profitableOpportunities) 
      : 0;
    
    opportunityChart.data.datasets[0].data = [executed, failed, notProfitable];
    opportunityChart.update();
  } catch (error) {
    console.error('Error updating opportunity chart:', error);
  }
}

// Update profit history chart with new time range
function updateProfitHistoryChart(range) {
  try {
    if (!profitHistoryChart) {
      console.warn('Profit history chart not initialized');
      return;
    }
    
    if (!profitHistoryChart.data.labels.length) return;
    
    const now = moment();
    let rangeStart;
    
    switch(range) {
      case '1h':
        rangeStart = moment().subtract(1, 'hour');
        profitHistoryChart.options.scales.x.time.unit = 'minute';
        profitHistoryChart.options.scales.x.time.displayFormats = { minute: 'HH:mm' };
        break;
      case '6h':
        rangeStart = moment().subtract(6, 'hours');
        profitHistoryChart.options.scales.x.time.unit = 'hour';
        profitHistoryChart.options.scales.x.time.displayFormats = { hour: 'HH:mm' };
        break;
      case '24h':
        rangeStart = moment().subtract(24, 'hours');
        profitHistoryChart.options.scales.x.time.unit = 'hour';
        profitHistoryChart.options.scales.x.time.displayFormats = { hour: 'HH:mm' };
        break;
      default:
        rangeStart = moment().subtract(1, 'hour');
        break;
    }
    
    profitHistoryChart.update();
  } catch (error) {
    console.error('Error updating profit history chart range:', error);
  }
}

// Update profit history chart with new data
function updateProfitHistoryChartData(historyData) {
  try {
    if (!profitHistoryChart) {
      console.warn('Profit history chart not initialized');
      return;
    }
    
    const labels = historyData.map(item => new Date(item.timestamp));
    const data = historyData.map(item => parseFloat(item.profit));
    
    profitHistoryChart.data.labels = labels;
    profitHistoryChart.data.datasets[0].data = data;
    profitHistoryChart.update();
    
    // Also update current time range view
    const activeRangeBtn = document.querySelector('#profitTimeRange button.active');
    if (activeRangeBtn) {
      updateProfitHistoryChart(activeRangeBtn.getAttribute('data-range'));
    }
  } catch (error) {
    console.error('Error updating profit history chart data:', error);
  }
}

// Update recent transactions list
function updateRecentTransactions(transactions) {
  const transactionsContainer = document.getElementById('recentTransactions');
  
  // Clear current content
  transactionsContainer.innerHTML = '';
  
  // Add transactions
  if (transactions.length === 0) {
    transactionsContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        No transactions recorded yet
      </div>
    `;
    return;
  }
  
  transactions.forEach(tx => {
    addTransactionToList(tx, transactionsContainer);
  });
}

// Add a single transaction to the list
function addTransactionToList(tx, container = null) {
  if (!container) {
    container = document.getElementById('recentTransactions');
  }
  
  // Remove placeholder if it exists
  const placeholder = container.querySelector('.text-center.text-muted.py-5');
  if (placeholder) {
    placeholder.remove();
  }
  
  const txElement = document.createElement('div');
  txElement.className = `transaction-item ${tx.success ? 'transaction-success' : 'transaction-failed'}`;
  
  const formattedProfit = tx.profit ? parseFloat(tx.profit).toFixed(6) + ' BNB' : 'N/A';
  
  // Create and append HTML content
  txElement.innerHTML = `
    <div class="d-flex justify-content-between align-items-start">
      <div>
        <strong>${tx.route ? tx.route.join(' → ') : 'Transaction'}</strong>
        ${tx.type ? `<span class="badge mev-strategy-badge">${tx.type}</span>` : ''}
        ${tx.profit ? `<span class="badge arb-profit-badge">+${formattedProfit}</span>` : ''}
      </div>
      <span class="badge ${tx.success ? 'bg-success' : 'bg-danger'}">
        ${tx.success ? 'Success' : 'Failed'}
      </span>
    </div>
    <div class="timestamp mt-1">
      ${tx.timestamp ? formatDate(tx.timestamp) : ''}
      ${tx.txHash ? `<a href="https://bscscan.com/tx/${tx.txHash}" target="_blank" class="ms-2">View on BSCScan</a>` : ''}
    </div>
  `;
  
  // Insert at the beginning of the list
  if (container.firstChild) {
    container.insertBefore(txElement, container.firstChild);
  } else {
    container.appendChild(txElement);
  }
  
  // Limit to 10 transactions
  const items = container.querySelectorAll('.transaction-item');
  if (items.length > 10) {
    container.removeChild(items[items.length - 1]);
  }
}

// Update bot status badge
function updateBotStatus(statusData) {
  try {
    const statusBadge = document.getElementById('botStatusBadge');
    const statusText = document.getElementById('botStatus');
    
    if (!statusBadge || !statusText) {
      console.warn('Bot status elements not found');
      return;
    }
    
    statusText.textContent = capitalizeFirstLetter(statusData.status);
    
    // Update badge color
    statusBadge.className = 'badge';
    
    switch (statusData.status) {
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
    
    // Update tooltip if message provided
    if (statusData.message) {
      statusBadge.title = statusData.message;
    }
  } catch (error) {
    console.error('Error updating bot status:', error);
  }
}

// Update safety features status
function updateSafetyStatus(safetyData) {
  try {
    // Helper function to safely update element text content
    const safeUpdateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      } else {
        console.warn(`Element with id '${id}' not found`);
      }
    };

    // Helper function to update badge status
    const updateBadgeStatus = (id, isActive, activeText, inactiveText) => {
      const badge = document.getElementById(id);
      if (!badge) {
        console.warn(`Badge element with id '${id}' not found`);
        return;
      }

      badge.textContent = isActive ? activeText : inactiveText;
      badge.className = 'badge ' + (isActive ? 'bg-warning' : 'bg-success');
    };

    // Update cooldown status
    const isCooldownActive = safetyData.cooldown && safetyData.cooldown.active;
    updateBadgeStatus('cooldownStatus', isCooldownActive, 'Active', 'Inactive');

    // Update cooldown details row visibility and remaining time
    const cooldownDetailsRow = document.getElementById('cooldownDetailsRow');
    if (cooldownDetailsRow) {
      cooldownDetailsRow.style.display = isCooldownActive ? 'table-row' : 'none';
      if (isCooldownActive && safetyData.cooldown.remainingTime) {
        safeUpdateElement('cooldownRemainingTime', Math.ceil(safetyData.cooldown.remainingTime / 60) + ' min');
      }
    }

    // Update consecutive failures
    safeUpdateElement('consecutiveFailures', safetyData.consecutiveFailures || '0');

    // Update network congestion status
    const isNetworkCongested = safetyData.networkCongestion && safetyData.networkCongestion.isHighGasPrice;
    updateBadgeStatus('networkCongestionStatus', isNetworkCongested, 'High', 'Normal');

    // Update current gas price
    if (safetyData.networkCongestion && safetyData.networkCongestion.currentGasPrice !== undefined) {
      // Ensure minimum 1.0 Gwei on BNB Chain even if we get 0 from backend
      let gasPriceValue = 1.0; // Default minimum value for BNB Chain
      
      // Only change if we get a valid value that's at least 1.0
      if (safetyData.networkCongestion.currentGasPrice) {
        const parsedValue = parseFloat(safetyData.networkCongestion.currentGasPrice);
        if (!isNaN(parsedValue) && parsedValue >= 1.0) {
          gasPriceValue = parsedValue;
        }
      }
      
      const gasPrice = gasPriceValue.toFixed(1);
      safeUpdateElement('currentGasPrice', `${gasPrice} Gwei`);
      console.log(`Gas price updated from blockchain: ${gasPrice} Gwei`);
      
      // Update timestamp to show when this data was last updated
      if (safetyData.networkCongestion.lastUpdated) {
        const lastUpdated = new Date(safetyData.networkCongestion.lastUpdated);
        const now = new Date();
        const secondsAgo = Math.floor((now - lastUpdated) / 1000);
        
        let updateMsg = "Updated just now";
        if (secondsAgo > 5) {
          updateMsg = `Updated ${secondsAgo} seconds ago`;
        }
        
        const networkStatusElement = document.getElementById('networkCongestionStatus').parentNode.nextElementSibling;
        if (networkStatusElement) {
          const updateSpan = document.createElement('small');
          updateSpan.className = 'text-muted ml-2';
          updateSpan.innerText = updateMsg;
          
          // Replace existing update info if any
          const existingUpdate = networkStatusElement.querySelector('small.text-muted');
          if (existingUpdate) {
            existingUpdate.innerText = updateMsg;
          } else {
            networkStatusElement.appendChild(updateSpan);
          }
        }
      }
    }

    // Update competitive bot detection status
    const isCompetitiveBotDetected = safetyData.competitiveBots && safetyData.competitiveBots.detected;
    updateBadgeStatus('competitiveBotStatus', isCompetitiveBotDetected, 'Detected', 'Not Detected');
    
    // Update timestamp to show when competitive bot data was last updated
    if (safetyData.competitiveBots && safetyData.competitiveBots.lastUpdated) {
      const lastUpdated = new Date(safetyData.competitiveBots.lastUpdated);
      const now = new Date();
      const secondsAgo = Math.floor((now - lastUpdated) / 1000);
      
      let updateMsg = "Updated just now";
      if (secondsAgo > 5) {
        updateMsg = `Updated ${secondsAgo} seconds ago`;
      }
      
      const botStatusElement = document.getElementById('competitiveBotStatus').parentNode.nextElementSibling;
      if (botStatusElement) {
        const updateSpan = document.createElement('small');
        updateSpan.className = 'text-muted ml-2';
        updateSpan.innerText = updateMsg;
        
        // Replace existing update info if any
        const existingUpdate = botStatusElement.querySelector('small.text-muted');
        if (existingUpdate) {
          existingUpdate.innerText = updateMsg;
        } else {
          botStatusElement.appendChild(updateSpan);
        }
      }
    }

    // Update slippage multiplier row visibility and value
    const slippageDetailsRow = document.getElementById('slippageDetailsRow');
    if (slippageDetailsRow) {
      slippageDetailsRow.style.display = isCompetitiveBotDetected ? 'table-row' : 'none';
      if (isCompetitiveBotDetected && safetyData.competitiveBots.slippageMultiplier) {
        safeUpdateElement('slippageMultiplier', 
          parseFloat(safetyData.competitiveBots.slippageMultiplier).toFixed(1) + 'x');
      }
    }
  } catch (error) {
    console.error('Error updating safety status:', error);
  }
}

// Update connection status indication
function updateConnectionStatus(connected) {
  try {
    const networkBadge = document.getElementById('networkBadge');
    
    if (!networkBadge) {
      console.warn('Network badge element not found');
      return;
    }
    
    if (connected) {
      networkBadge.classList.remove('bg-danger');
      networkBadge.classList.add('network-badge');
    } else {
      networkBadge.classList.remove('network-badge');
      networkBadge.classList.add('bg-danger');
    }
  } catch (error) {
    console.error('Error updating connection status:', error);
  }
}

// Update config display
function updateConfigDisplay(config) {
  try {
    // Helper function to safely update element text content
    const safeUpdateElement = (id, value) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value;
      } else {
        console.warn(`Config element with id '${id}' not found`);
      }
    };
    
    if (!config) {
      console.warn('Config data is missing or invalid');
      return;
    }
    
    // Environment
    if (config.environment) {
      safeUpdateElement('environmentMode', config.environment.devMode ? 'Development' : 'Production');
      safeUpdateElement('networkName', config.environment.network || 'BNB Chain');
    }
    
    // MEV Protection
    if (config.mev && config.mev.protection) {
      safeUpdateElement('mevProtection', config.mev.protection.enabled ? 'Enabled' : 'Disabled');
    }
    
    // Strategies
    if (config.mev && config.mev.strategies) {
      safeUpdateElement('backrunStrategy', 
        (config.mev.strategies.enabled && config.mev.strategies.backrunning) ? 'Enabled' : 'Disabled');
      
      safeUpdateElement('sandwichStrategy', 
        (config.mev.strategies.enabled && config.mev.strategies.sandwiching) ? 'Enabled' : 'Disabled');
    }
    
    // Monitoring interval
    if (config.monitoring) {
      safeUpdateElement('monitoringInterval', `${config.monitoring.interval}s`);
    }
  } catch (error) {
    console.error('Error updating config display:', error);
  }
}

// Helper function to format dates
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}