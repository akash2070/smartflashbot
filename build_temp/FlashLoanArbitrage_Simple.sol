// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/**
 * @dev This is a simplified standalone version of FlashLoanArbitrage contract with OpenZeppelin
 * libraries inlined for direct compilation with solc. Simplified for testnet deployment.
 */

// ========== INLINED OPENZEPPELIN CONTRACTS ==========

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data.
 */
abstract contract ContextUpgradeable {
    function __Context_init() internal {
    }

    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 */
abstract contract OwnableUpgradeable is ContextUpgradeable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    function __Ownable_init() internal {
        __Context_init();
        _transferOwnership(_msgSender());
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

/**
 * @dev This is a base contract to aid in writing upgradeable contracts
 */
abstract contract Initializable {
    /**
     * @dev Indicates that the contract has been initialized.
     */
    bool private _initialized;

    /**
     * @dev Indicates that the contract is in the process of being initialized.
     */
    bool private _initializing;

    /**
     * @dev Modifier to protect an initializer function from being invoked twice.
     */
    modifier initializer() {
        require(_initializing || !_initialized, "Initializable: contract is already initialized");

        bool isTopLevelCall = !_initializing;
        if (isTopLevelCall) {
            _initializing = true;
            _initialized = true;
        }

        _;

        if (isTopLevelCall) {
            _initializing = false;
        }
    }

    /**
     * @dev Internal function that should be called from the constructor to 
     * initialize the implementation contract (not the proxy).
     */
    function _disableInitializers() internal {
        _initialized = true;
    }
}

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 */
abstract contract ReentrancyGuardUpgradeable {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    function __ReentrancyGuard_init() internal {
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     */
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/**
 * @dev Implementation of the ERC20 interface.
 */
interface IERC20Upgradeable {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    function isContract(address account) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }
}

/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure.
 */
library SafeERC20Upgradeable {
    using Address for address;

    function safeTransfer(
        IERC20Upgradeable token,
        address to,
        uint256 value
    ) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(
        IERC20Upgradeable token,
        address from,
        address to,
        uint256 value
    ) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    function safeApprove(
        IERC20Upgradeable token,
        address spender,
        uint256 value
    ) internal {
        // Checking for zero allowance is needed here (otherwise we'd overwrite a non-zero value with zero)
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    function _callOptionalReturn(IERC20Upgradeable token, bytes memory data) private {
        require(address(token).isContract(), "SafeERC20: call to non-contract");
        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "SafeERC20: low-level call failed");
        
        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}

// PancakeSwap V3 interfaces
interface IPancakeV3Pool {
    function flash(
        address recipient,
        uint256 amount0,
        uint256 amount1,
        bytes calldata data
    ) external;
}

interface IPancakeV3Factory {
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}

interface IPancakeV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    
    function getAmountsOut(
        uint amountIn, 
        address[] calldata path
    ) external view returns (uint[] memory amounts);
}

/**
 * @title FlashLoanArbitrage (Simplified Version)
 * @dev Implements flash loan arbitrage functionality for testing
 */
contract FlashLoanArbitrage is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    
    // DEX interfaces
    IPancakeV3Factory public pancakeV3Factory;
    IPancakeV2Router public pancakeV2Router;
    
    // Fee tiers for PancakeSwap V3
    uint24 public constant POOL_FEE_TIER_LOWEST = 100;  // 0.015%
    uint24 public constant POOL_FEE_TIER_LOW = 500;     // 0.05%
    
    // Transaction tracking
    uint256 public totalTrades;
    uint256 public successfulTrades;
    uint256 public totalProfit;
    
    // Status flag to prevent reinitialization
    bool public isSetup;
    
    // Events
    event ArbitrageExecuted(
        address tokenBorrow,
        uint256 amountBorrowed,
        uint256 profit
    );
    
    event Withdrawal(
        address token,
        address recipient,
        uint256 amount
    );
    
    event ContractInitialized(
        address owner,
        address pancakeV3Factory,
        address pancakeV2Router
    );
    
    struct FlashCallbackData {
        address tokenBorrow;
        address tokenPay;
        uint256 amountBorrow;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initializes the contract with core dependencies
     */
    function initialize(address _pancakeV3Factory, address _pancakeV2Router) public initializer {
        // Initialize OpenZeppelin contracts
        __Ownable_init();
        __ReentrancyGuard_init();
        
        // Set DEX interfaces
        pancakeV3Factory = IPancakeV3Factory(_pancakeV3Factory);
        pancakeV2Router = IPancakeV2Router(_pancakeV2Router);
        
        // Setup status
        isSetup = true;
        
        // Initialize counters
        totalTrades = 0;
        successfulTrades = 0;
        totalProfit = 0;
        
        // Log initialization event
        emit ContractInitialized(owner(), _pancakeV3Factory, _pancakeV2Router);
    }
    
    /**
     * @dev Test function that verifies contract is properly initialized
     */
    function getContractInfo() external view returns (
        address _owner,
        address _pancakeV3Factory,
        address _pancakeV2Router,
        bool _isSetup
    ) {
        return (
            owner(),
            address(pancakeV3Factory),
            address(pancakeV2Router),
            isSetup
        );
    }
    
    /**
     * @dev Withdraw tokens from the contract
     */
    function withdrawToken(
        address token,
        uint256 amount,
        address recipient
    ) external onlyOwner {
        require(recipient != address(0), "Cannot withdraw to zero address");
        
        uint256 balance = IERC20Upgradeable(token).balanceOf(address(this));
        uint256 withdrawAmount = amount > 0 ? amount : balance;
        
        require(withdrawAmount <= balance, "Insufficient balance");
        
        IERC20Upgradeable(token).safeTransfer(recipient, withdrawAmount);
        
        emit Withdrawal(token, recipient, withdrawAmount);
    }
    
    /**
     * @dev Get trading statistics
     */
    function getTradingStats() external view returns (
        uint256 _totalTrades,
        uint256 _successfulTrades,
        uint256 _totalProfit
    ) {
        return (totalTrades, successfulTrades, totalProfit);
    }
}