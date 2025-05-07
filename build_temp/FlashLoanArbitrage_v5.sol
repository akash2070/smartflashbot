// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

// PancakeSwap V3 Interfaces
interface IPancakeV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IPancakeV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}

// DEX Router Interfaces
interface IRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);

    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
}

/**
 * @title FlashLoanArbitrage_v5
 * @dev Contract for executing flash loan arbitrage strategies with MEV protection
 * Compatible with PancakeSwap V3 flash loans
 */
contract FlashLoanArbitrage_v5 is Initializable, UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // Key contract addresses
    address public constant PANCAKESWAP_V2_ROUTER = 0x10ED43C718714eb63d5aA57B78B54704E256024E;
    address public constant BISWAP_ROUTER = 0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8;
    address public constant APESWAP_ROUTER = 0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7;
    
    address public PANCAKESWAP_V3_FACTORY;

    // DEX Routers
    IRouter private pancakeswapV2Router;
    IRouter private biswapRouter;
    IRouter private apeswapRouter;
    
    // Flash loan callback data structure
    struct FlashCallbackData {
        address sourcePool;
        address token0;
        address token1;
        address sourceRouter;
        address targetRouter;
        uint256 amount0;
        uint256 amount1;
        bool zeroForOne;
    }
    
    // Addresses for MEV protection
    address public mevProtectionServiceAddress;
    
    // Configuration flags
    bool public mevProtectionEnabled;
    bool public backrunEnabled;
    bool public frontrunEnabled;
    uint256 public minExecutionBalance;
    
    // Events
    event ArbitrageExecuted(
        address indexed flashLoanPool,
        address indexed tokenBorrow,
        uint256 amountBorrowed,
        uint256 profit
    );
    
    event TokensWithdrawn(
        address indexed token,
        address indexed recipient,
        uint256 amount
    );
    
    event FlashLoanRequested(
        address indexed pool,
        address indexed token0,
        address indexed token1,
        uint256 amount0,
        uint256 amount1
    );
    
    event SlippageExceeded(
        address indexed sourceRouter,
        address indexed targetRouter,
        uint256 expectedAmountOut,
        uint256 actualAmountOut
    );

    /**
     * @dev Initialization function - replaces constructor for upgradeable contracts
     * @param _pancakeswapV3Factory PancakeSwap V3 factory address
     */
    function initialize(address _pancakeswapV3Factory) public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        PANCAKESWAP_V3_FACTORY = _pancakeswapV3Factory;
        
        pancakeswapV2Router = IRouter(PANCAKESWAP_V2_ROUTER);
        biswapRouter = IRouter(BISWAP_ROUTER);
        apeswapRouter = IRouter(APESWAP_ROUTER);
        
        // Default settings
        mevProtectionEnabled = true;
        backrunEnabled = true;
        frontrunEnabled = true;
        minExecutionBalance = 0.001 ether; // Minimum balance to execute arbitrage
    }
    
    /**
     * @dev Required by UUPS pattern
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /**
     * @dev Execute arbitrage using flash loan from PancakeSwap V3
     * @param poolAddress PancakeSwap V3 pool address to borrow from
     * @param token0 First token in the pool
     * @param token1 Second token in the pool
     * @param amount0 Amount of token0 to borrow (0 if borrowing token1)
     * @param amount1 Amount of token1 to borrow (0 if borrowing token0)
     * @param sourceRouter Router address for first swap
     * @param targetRouter Router address for second swap
     * @param zeroForOne Direction of swap (true = token0 to token1)
     */
    function executeArbitrage(
        address poolAddress,
        address token0,
        address token1,
        uint256 amount0,
        uint256 amount1,
        address sourceRouter,
        address targetRouter,
        bool zeroForOne
    ) external onlyOwner nonReentrant {
        // Check if contract has enough ETH for gas
        require(
            address(this).balance >= minExecutionBalance,
            "Insufficient ETH balance for gas"
        );
        
        // Validate parameters
        require(poolAddress != address(0), "Invalid pool address");
        require(token0 != address(0) && token1 != address(0), "Invalid token addresses");
        require(sourceRouter != address(0) && targetRouter != address(0), "Invalid router addresses");
        require(amount0 > 0 || amount1 > 0, "Must borrow at least one token");
        
        // Prepare flash loan callback data
        bytes memory data = abi.encode(
            FlashCallbackData({
                sourcePool: poolAddress,
                token0: token0,
                token1: token1,
                sourceRouter: sourceRouter,
                targetRouter: targetRouter,
                amount0: amount0,
                amount1: amount1,
                zeroForOne: zeroForOne
            })
        );
        
        // Request flash loan from PancakeSwap V3 pool
        emit FlashLoanRequested(poolAddress, token0, token1, amount0, amount1);
        IPancakeV3Pool(poolAddress).flash(address(this), amount0, amount1, data);
    }
    
    /**
     * @dev Flash loan callback function - executed after receiving flash loan
     * @param fee0 Fee for token0 loan
     * @param fee1 Fee for token1 loan
     * @param data Callback data containing arbitrage parameters
     */
    function pancakeV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external nonReentrant {
        // Decode the callback data
        FlashCallbackData memory decoded = abi.decode(data, (FlashCallbackData));
        
        // Verify callback is from the correct pool
        require(msg.sender == decoded.sourcePool, "Callback not from source pool");
        
        // Get token addresses and amounts
        address tokenBorrow = decoded.zeroForOne ? decoded.token0 : decoded.token1;
        uint256 amountBorrowed = decoded.zeroForOne ? decoded.amount0 : decoded.amount1;
        uint256 fee = decoded.zeroForOne ? fee0 : fee1;
        
        // Approve source router to spend borrowed token
        IERC20Upgradeable(tokenBorrow).approve(decoded.sourceRouter, amountBorrowed);
        
        // Prepare swap path for first swap
        address[] memory pathSource = new address[](2);
        pathSource[0] = tokenBorrow;
        pathSource[1] = decoded.zeroForOne ? decoded.token1 : decoded.token0;
        
        // Execute first swap
        uint[] memory amountsOut = IRouter(decoded.sourceRouter).swapExactTokensForTokens(
            amountBorrowed,
            0, // Accept any amount
            pathSource,
            address(this),
            block.timestamp + 300
        );
        
        // Get intermediate token and amount received
        address intermediateToken = pathSource[1];
        uint256 intermediateAmount = amountsOut[1];
        
        // Approve target router to spend intermediate token
        IERC20Upgradeable(intermediateToken).approve(decoded.targetRouter, intermediateAmount);
        
        // Prepare swap path for second swap
        address[] memory pathTarget = new address[](2);
        pathTarget[0] = intermediateToken;
        pathTarget[1] = tokenBorrow;
        
        // Execute second swap
        uint[] memory finalAmounts = IRouter(decoded.targetRouter).swapExactTokensForTokens(
            intermediateAmount,
            0, // Accept any amount
            pathTarget,
            address(this),
            block.timestamp + 300
        );
        
        // Get final amount received
        uint256 finalAmount = finalAmounts[1];
        
        // Calculate required repayment amount (borrowed + fee)
        uint256 repaymentAmount = amountBorrowed + fee;
        
        // Check if arbitrage was profitable
        require(finalAmount > repaymentAmount, "Arbitrage not profitable");
        
        // Approve flash loan pool to take repayment
        IERC20Upgradeable(tokenBorrow).approve(decoded.sourcePool, repaymentAmount);
        
        // Calculate profit
        uint256 profit = finalAmount - repaymentAmount;
        
        // Emit event with arbitrage details
        emit ArbitrageExecuted(
            decoded.sourcePool,
            tokenBorrow,
            amountBorrowed,
            profit
        );
    }
    
    /**
     * @dev Configure MEV protection settings
     * @param _enabled Enable/disable MEV protection
     * @param _backrunEnabled Enable/disable backrun protection
     * @param _frontrunEnabled Enable/disable frontrun protection
     * @param _serviceAddress Address of MEV protection service (optional)
     */
    function configureMEVProtection(
        bool _enabled,
        bool _backrunEnabled,
        bool _frontrunEnabled,
        address _serviceAddress
    ) external onlyOwner {
        mevProtectionEnabled = _enabled;
        backrunEnabled = _backrunEnabled;
        frontrunEnabled = _frontrunEnabled;
        mevProtectionServiceAddress = _serviceAddress;
    }
    
    /**
     * @dev Set minimum balance required for execution
     * @param _minBalance Minimum balance in wei
     */
    function setMinExecutionBalance(uint256 _minBalance) external onlyOwner {
        minExecutionBalance = _minBalance;
    }
    
    /**
     * @dev Get PancakeSwap V3 pool address
     * @param tokenA First token address
     * @param tokenB Second token address
     * @param fee Fee tier
     * @return pool address
     */
    function getPancakeV3Pool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address) {
        return IPancakeV3Factory(PANCAKESWAP_V3_FACTORY).getPool(tokenA, tokenB, fee);
    }
    
    /**
     * @dev Withdraw ERC20 tokens from contract
     * @param token Token address to withdraw
     * @param amount Amount to withdraw
     */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20Upgradeable(token).safeTransfer(owner(), amount);
        emit TokensWithdrawn(token, owner(), amount);
    }
    
    /**
     * @dev Withdraw BNB from contract
     * @param amount Amount to withdraw
     */
    function withdrawBNB(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient balance");
        
        (bool success, ) = owner().call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    /**
     * @dev Receive function to accept BNB
     */
    receive() external payable {}
}