// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/**
 * @dev This is a standalone version of FlashLoanArbitrage contract with OpenZeppelin
 * libraries inlined for direct compilation with solc
 */

// ========== INLINED OPENZEPPELIN CONTRACTS ==========

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 */
abstract contract ContextUpgradeable {
    function __Context_init() internal {
        __Context_init_unchained();
    }

    function __Context_init_unchained() internal {
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
        __Ownable_init_unchained();
    }

    function __Ownable_init_unchained() internal {
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
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions anymore. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby removing any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
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
 * @dev This is a base contract to aid in writing upgradeable contracts, or any kind of contract that will be deployed
 * behind a proxy. Since proxied contracts do not make use of a constructor, it's common to move constructor logic to an
 * external initializer function, usually called `initialize`. It then becomes necessary to protect this initializer
 * function so it can only be called once. The {initializer} modifier provided by this contract will have this effect.
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
        __ReentrancyGuard_init_unchained();
    }

    function __ReentrancyGuard_init_unchained() internal {
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        // On the first call to nonReentrant, _notEntered will be true
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }
}

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 */
abstract contract PausableUpgradeable is ContextUpgradeable {
    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    bool private _paused;

    /**
     * @dev Initializes the contract in unpaused state.
     */
    function __Pausable_init() internal {
        __Pausable_init_unchained();
    }

    function __Pausable_init_unchained() internal {
        _paused = false;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        require(!paused(), "Pausable: paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        require(paused(), "Pausable: not paused");
        _;
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

/**
 * @dev Implementation of the IERC20 interface.
 *
 * This implementation is agnostic to the way tokens are created. This means
 * that a supply mechanism has to be added in a derived contract using {_mint}.
 */
interface IERC20Upgradeable {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * This test is non-exhaustive, and there may be false-negatives.
     *
     * For example, during the execution of a constructor, the `extcodesize` check
     * may return 0 for a contract that has code to be deployed.
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize, which returns 0 for contracts in
        // construction, since the code is only stored at the end of the
        // constructor execution.
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    /**
     * @dev Performs a function call using a low level `call`.
     *
     * Reverts with an error message upon reversion
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCall(target, data, "Address: low-level call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`], but with
     * `errorMessage` as a fallback revert reason when `target` reverts.
     */
    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    /**
     * @dev Same as {xref-Address-functionCallWithValue-address-bytes-uint256-}[`functionCallWithValue`], but
     * with `errorMessage` as a fallback revert reason when `target` reverts.
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        require(isContract(target), "Address: call to non-contract");

        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    /**
     * @dev Verifies result of a low-level call
     */
    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            // Look for revert reason and bubble it up if present
            if (returndata.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert(errorMessage);
            }
        }
    }
}

/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
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

    /**
     * @dev Deprecated. This function has issues similar to the ones found in
     * {IERC20-approve}, and its usage is discouraged.
     */
    function safeApprove(
        IERC20Upgradeable token,
        address spender,
        uint256 value
    ) internal {
        // safeApprove should only be called when setting an initial allowance,
        // or when resetting it to zero. To increase and decrease it, use
        // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value.
     *
     * A plain `call` is an unsafe replacement for a function call: use this function instead.
     */
    function _callOptionalReturn(IERC20Upgradeable token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves.

        // A Solidity high level call has three parts:
        //  1. The target address is checked to verify it contains contract code
        //  2. The call itself is made, and success asserted
        //  3. The return value is decoded, which in turn checks the size of the returned data.
        // solhint-disable-next-line max-line-length
        require(address(token).isContract(), "SafeERC20: call to non-contract");

        // solhint-disable-next-line avoid-low-level-calls
        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "SafeERC20: low-level call failed");

        if (returndata.length > 0) {
            // Return data is optional
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}

/**
 * @dev Implementation of a minimal UUPS proxy implementation.
 * This is used by our base UUPSUpgradeable but users can
 * implement their own proxies.
 */
abstract contract UUPSUpgradeable is Initializable {
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable state-variable-assignment
    address private immutable __self = address(this);

    /**
     * @dev Check that the execution is being performed through a delegatecall call.
     * This is necessary to ensure that the execution context is that of the proxy
     * and not the implementation.
     */
    modifier onlyProxy() {
        require(address(this) != __self, "Function must be called through delegatecall");
        _;
    }

    /**
     * @dev Check that the execution is not being performed through a delegate call.
     * This is necessary to ensure that the execution context is that of the
     * implementation and not a proxy.
     */
    modifier notDelegated() {
        require(address(this) == __self, "UUPSUpgradeable: must not be called through delegatecall");
        _;
    }

    /**
     * @dev Implementation of the ERC1822 logic. 
     * This function should return the address of the implementation contract.
     */
    function _getImplementation() internal view returns (address) {
        return __self;
    }

    /**
     * @dev Upgrades the proxy to a new implementation.
     * See {_authorizeUpgrade}
     */
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable virtual onlyProxy {
        _authorizeUpgrade(newImplementation);
        _upgradeToAndCallSecure(newImplementation, data);
    }

    /**
     * @dev Function that should revert when `msg.sender` is not authorized to upgrade the contract.
     * Called by {upgradeToAndCall}.
     *
     * Normally, this function should use an xref:access.adoc[access control] modifier such as {Ownable-onlyOwner}.
     */
    function _authorizeUpgrade(address newImplementation) internal virtual;

    /**
     * @dev Performs an implementation upgrade with additional setup call.
     * This should only be called from upgradeToAndCall.
     */
    function _upgradeToAndCallSecure(address newImplementation, bytes memory data) internal {
        // Initial upgrade and setup call
        _upgradeTo(newImplementation);
        if (data.length > 0) {
            (bool success,) = newImplementation.delegatecall(data);
            require(success, "Call to new implementation failed");
        }
    }

    /**
     * @dev Performs an implementation upgrade
     * Emits an {Upgraded} event
     */
    function _upgradeTo(address newImplementation) internal virtual {
        // Implementation slot is a storage slot that contains the address of the current implementation
        bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        assembly {
            sstore(slot, newImplementation)
        }
    }

    function __UUPSUpgradeable_init() internal {
        __UUPSUpgradeable_init_unchained();
    }

    function __UUPSUpgradeable_init_unchained() internal {
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

interface IApeSwapRouter {
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

interface IBiSwapRouter {
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
 * @title FlashLoanArbitrage
 * @dev Implements flash loan arbitrage functionality between multiple DEXs
 */
contract FlashLoanArbitrage is 
    Initializable, 
    OwnableUpgradeable, 
    UUPSUpgradeable, 
    ReentrancyGuardUpgradeable,
    PausableUpgradeable 
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    
    // DEX interfaces
    IPancakeV3Factory public pancakeV3Factory;
    IPancakeV2Router public pancakeV2Router;
    IApeSwapRouter public apeSwapRouter;
    IBiSwapRouter public biSwapRouter;
    
    // Fee tiers for PancakeSwap V3
    uint24 public constant POOL_FEE_TIER_ULTRA_LOWEST = 10;  // 0.01%
    uint24 public constant POOL_FEE_TIER_LOWEST = 100;       // 0.015%
    uint24 public constant POOL_FEE_TIER_LOW = 500;          // 0.05%
    uint24 public constant POOL_FEE_TIER_MEDIUM = 2500;      // 0.25%
    uint24 public constant POOL_FEE_TIER_HIGH = 10000;       // 1.00%
    
    // DEX Slippage caps (as basis points, 1 bp = 0.01%)
    uint256 public pancakeV3SlippageCap;
    uint256 public biSwapSlippageCap;
    uint256 public pancakeV2SlippageCap;
    uint256 public apeSwapSlippageCap;
    
    // MEV Protection settings
    bool public mevProtectionEnabled;
    bool public backrunEnabled;
    bool public frontrunEnabled;
    uint256 public priorityFeeMultiplier;
    
    // Transaction tracking
    uint256 public totalTrades;
    uint256 public successfulTrades;
    uint256 public totalProfit;
    
    // Events
    event ArbitrageExecuted(
        address tokenBorrow,
        uint256 amountBorrowed,
        uint256 profit,
        address buyDex,
        address sellDex
    );
    
    event Withdrawal(
        address token,
        address recipient,
        uint256 amount
    );
    
    event MevProtectionUpdated(
        bool enabled,
        bool backrunEnabled,
        bool frontrunEnabled
    );
    
    event SlippageCapUpdated(
        string dex,
        uint256 slippageCapBps
    );
    
    struct FlashCallbackData {
        address tokenBorrow;
        address tokenPay;
        uint256 amountBorrow;
        address buyDex;
        address sellDex;
        address[] buyPath;
        address[] sellPath;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @dev Initializes the contract with core dependencies and settings
     */
    function initialize(
        address _pancakeV3Factory,
        address _pancakeV2Router,
        address _apeSwapRouter,
        address _biSwapRouter
    ) public initializer {
        // Initialize OZ contracts 
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        
        // Set up DEX interfaces
        pancakeV3Factory = IPancakeV3Factory(_pancakeV3Factory);
        pancakeV2Router = IPancakeV2Router(_pancakeV2Router);
        apeSwapRouter = IApeSwapRouter(_apeSwapRouter);
        biSwapRouter = IBiSwapRouter(_biSwapRouter);
        
        // Set default slippage caps
        pancakeV3SlippageCap = 50;  // 0.5%
        biSwapSlippageCap = 70;     // 0.7%
        pancakeV2SlippageCap = 100; // 1.0%
        apeSwapSlippageCap = 120;   // 1.2%
        
        // Initialize MEV protection settings
        mevProtectionEnabled = true;
        backrunEnabled = true;
        frontrunEnabled = true;
        priorityFeeMultiplier = 130; // 1.3x default priority fee
        
        // Initialize counters
        totalTrades = 0;
        successfulTrades = 0;
        totalProfit = 0;
    }
    
    /**
     * @dev Required by UUPS proxy pattern
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    /**
     * @dev Execute arbitrage with flash loan
     */
    function executeArbitrage(
        address tokenBorrow,
        address tokenPay,
        uint256 amountToBorrow,
        uint24 poolFee,
        address buyDex,
        address sellDex,
        address[] calldata buyPath,
        address[] calldata sellPath
    ) external onlyOwner nonReentrant whenNotPaused {
        require(amountToBorrow > 0, "Amount must be greater than 0");
        require(buyDex != sellDex, "Buy and sell DEX must be different");
        
        // Find the appropriate V3 pool for the flash loan
        address poolAddress = pancakeV3Factory.getPool(tokenBorrow, tokenPay, poolFee);
        require(poolAddress != address(0), "Pool not found");
        
        // Prepare callback data
        FlashCallbackData memory data = FlashCallbackData({
            tokenBorrow: tokenBorrow,
            tokenPay: tokenPay,
            amountBorrow: amountToBorrow,
            buyDex: buyDex,
            sellDex: sellDex,
            buyPath: buyPath,
            sellPath: sellPath
        });
        
        // Determine which amounts to use for the flash loan
        uint256 amount0 = tokenBorrow < tokenPay ? amountToBorrow : 0;
        uint256 amount1 = tokenBorrow < tokenPay ? 0 : amountToBorrow;
        
        // Execute the flash loan
        IPancakeV3Pool(poolAddress).flash(
            address(this),
            amount0,
            amount1,
            abi.encode(data)
        );
    }
    
    /**
     * @dev PancakeSwap V3 flash loan callback function
     */
    function pancakeV3FlashCallback(
        uint256 fee0,
        uint256 fee1,
        bytes calldata data
    ) external nonReentrant {
        FlashCallbackData memory decoded = abi.decode(data, (FlashCallbackData));
        
        // Verify callback is from the correct pool
        address poolAddress = pancakeV3Factory.getPool(
            decoded.tokenBorrow,
            decoded.tokenPay,
            POOL_FEE_TIER_LOWEST
        );
        require(msg.sender == poolAddress, "Unauthorized callback");
        
        // Get the effective fee
        uint256 fee = decoded.tokenBorrow < decoded.tokenPay ? fee0 : fee1;
        uint256 amountToRepay = decoded.amountBorrow + fee;
        
        // Track balances to calculate profit
        uint256 initialBalance = IERC20Upgradeable(decoded.tokenBorrow).balanceOf(address(this));
        
        // Execute the arbitrage
        _executeSwaps(decoded);
        
        // Calculate profit
        uint256 finalBalance = IERC20Upgradeable(decoded.tokenBorrow).balanceOf(address(this));
        uint256 profit = finalBalance > amountToRepay ? finalBalance - amountToRepay : 0;
        
        // Repay the flash loan
        IERC20Upgradeable(decoded.tokenBorrow).safeTransfer(msg.sender, amountToRepay);
        
        // Update trade statistics
        totalTrades++;
        
        if (profit > 0) {
            successfulTrades++;
            totalProfit += profit;
            
            emit ArbitrageExecuted(
                decoded.tokenBorrow,
                decoded.amountBorrow,
                profit,
                decoded.buyDex,
                decoded.sellDex
            );
        }
    }
    
    /**
     * @dev Internal function to execute the swaps for arbitrage
     */
    function _executeSwaps(FlashCallbackData memory data) internal {
        // First approve the DEXes to spend the tokens
        IERC20Upgradeable(data.tokenBorrow).safeApprove(data.buyDex, 0);
        IERC20Upgradeable(data.tokenBorrow).safeApprove(data.buyDex, data.amountBorrow);
        
        // Get the middleware token (usually the second token in the path)
        address middlewareToken = data.buyPath[data.buyPath.length - 1];
        
        // Execute the first swap (buy)
        _executeBuySwap(data.buyDex, data.amountBorrow, data.buyPath);
        
        // Get the amount received from the first swap
        uint256 middlewareAmount = IERC20Upgradeable(middlewareToken).balanceOf(address(this));
        
        // Approve the second DEX to spend the middleware token
        IERC20Upgradeable(middlewareToken).safeApprove(data.sellDex, 0);
        IERC20Upgradeable(middlewareToken).safeApprove(data.sellDex, middlewareAmount);
        
        // Execute the second swap (sell)
        _executeSellSwap(data.sellDex, middlewareAmount, data.sellPath);
    }
    
    /**
     * @dev Execute a swap on the specified DEX with proper slippage control
     */
    function _executeBuySwap(
        address dexRouter,
        uint256 amountIn,
        address[] memory path
    ) internal {
        // Calculate minimum output with appropriate slippage based on the DEX
        uint256 slippageCap = _getSlippageCapForDex(dexRouter);
        uint256 amountOutMin = _calculateMinimumOutput(dexRouter, amountIn, path, slippageCap);
        
        // Execute the appropriate swap based on the DEX
        if (dexRouter == address(pancakeV2Router)) {
            pancakeV2Router.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300 // 5 minute deadline
            );
        } else if (dexRouter == address(apeSwapRouter)) {
            apeSwapRouter.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300
            );
        } else if (dexRouter == address(biSwapRouter)) {
            biSwapRouter.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300
            );
        }
    }
    
    /**
     * @dev Execute a sell swap on the specified DEX with proper slippage control
     */
    function _executeSellSwap(
        address dexRouter,
        uint256 amountIn,
        address[] memory path
    ) internal {
        // Calculate minimum output with appropriate slippage based on the DEX
        uint256 slippageCap = _getSlippageCapForDex(dexRouter);
        uint256 amountOutMin = _calculateMinimumOutput(dexRouter, amountIn, path, slippageCap);
        
        // Execute the appropriate swap based on the DEX
        if (dexRouter == address(pancakeV2Router)) {
            pancakeV2Router.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300 // 5 minute deadline
            );
        } else if (dexRouter == address(apeSwapRouter)) {
            apeSwapRouter.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300
            );
        } else if (dexRouter == address(biSwapRouter)) {
            biSwapRouter.swapExactTokensForTokens(
                amountIn,
                amountOutMin,
                path,
                address(this),
                block.timestamp + 300
            );
        }
    }
    
    /**
     * @dev Get the slippage cap for a specific DEX
     */
    function _getSlippageCapForDex(address dexRouter) internal view returns (uint256) {
        if (dexRouter == address(pancakeV2Router)) {
            return pancakeV2SlippageCap;
        } else if (dexRouter == address(apeSwapRouter)) {
            return apeSwapSlippageCap;
        } else if (dexRouter == address(biSwapRouter)) {
            return biSwapSlippageCap;
        } else {
            return pancakeV3SlippageCap; // Default to PancakeSwap V3 slippage cap
        }
    }
    
    /**
     * @dev Calculate minimum output for a swap with slippage
     */
    function _calculateMinimumOutput(
        address dexRouter,
        uint256 amountIn,
        address[] memory path,
        uint256 slippageBps
    ) internal view returns (uint256) {
        uint256[] memory amountsOut;
        
        // Get expected amounts from the appropriate router
        if (dexRouter == address(pancakeV2Router)) {
            amountsOut = pancakeV2Router.getAmountsOut(amountIn, path);
        } else if (dexRouter == address(apeSwapRouter)) {
            amountsOut = apeSwapRouter.getAmountsOut(amountIn, path);
        } else if (dexRouter == address(biSwapRouter)) {
            amountsOut = biSwapRouter.getAmountsOut(amountIn, path);
        } else {
            // Default to PancakeSwap V2 if unsupported DEX
            amountsOut = pancakeV2Router.getAmountsOut(amountIn, path);
        }
        
        // Apply slippage
        uint256 expectedOutput = amountsOut[amountsOut.length - 1];
        uint256 slippageAmount = (expectedOutput * slippageBps) / 10000;
        return expectedOutput - slippageAmount;
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
     * @dev Update slippage caps for DEXes
     */
    function updateSlippageCaps(
        uint256 _pancakeV3SlippageCap,
        uint256 _biSwapSlippageCap,
        uint256 _pancakeV2SlippageCap,
        uint256 _apeSwapSlippageCap
    ) external onlyOwner {
        // Validate slippage caps (allow a maximum of 5%)
        require(_pancakeV3SlippageCap <= 500, "Slippage cap too high");
        require(_biSwapSlippageCap <= 500, "Slippage cap too high");
        require(_pancakeV2SlippageCap <= 500, "Slippage cap too high");
        require(_apeSwapSlippageCap <= 500, "Slippage cap too high");
        
        pancakeV3SlippageCap = _pancakeV3SlippageCap;
        biSwapSlippageCap = _biSwapSlippageCap;
        pancakeV2SlippageCap = _pancakeV2SlippageCap;
        apeSwapSlippageCap = _apeSwapSlippageCap;
        
        emit SlippageCapUpdated("PancakeSwap V3", _pancakeV3SlippageCap);
        emit SlippageCapUpdated("BiSwap", _biSwapSlippageCap);
        emit SlippageCapUpdated("PancakeSwap V2", _pancakeV2SlippageCap);
        emit SlippageCapUpdated("ApeSwap", _apeSwapSlippageCap);
    }
    
    /**
     * @dev Update MEV protection settings
     */
    function updateMevProtection(
        bool _enabled,
        bool _backrunEnabled,
        bool _frontrunEnabled,
        uint256 _priorityFeeMultiplier
    ) external onlyOwner {
        require(_priorityFeeMultiplier >= 100 && _priorityFeeMultiplier <= 500, "Invalid multiplier");
        
        mevProtectionEnabled = _enabled;
        backrunEnabled = _backrunEnabled;
        frontrunEnabled = _frontrunEnabled;
        priorityFeeMultiplier = _priorityFeeMultiplier;
        
        emit MevProtectionUpdated(_enabled, _backrunEnabled, _frontrunEnabled);
    }
    
    /**
     * @dev Pause contract operations
     */
    function pauseContract() external onlyOwner {
        _pause();
    }
    
    /**
     * @dev Unpause contract operations
     */
    function unpauseContract() external onlyOwner {
        _unpause();
    }
    
    /**
     * @dev Get trading statistics
     */
    function getTradingStats() external view returns (
        uint256 _totalTrades,
        uint256 _successfulTrades,
        uint256 _totalProfit,
        uint256 _successRate
    ) {
        _totalTrades = totalTrades;
        _successfulTrades = successfulTrades;
        _totalProfit = totalProfit;
        _successRate = totalTrades > 0 ? (successfulTrades * 10000 / totalTrades) : 0; // In basis points
        
        return (_totalTrades, _successfulTrades, _totalProfit, _successRate);
    }
    
    /**
     * @dev Get current configuration
     */
    function getConfiguration() external view returns (
        bool _mevProtectionEnabled,
        bool _backrunEnabled, 
        bool _frontrunEnabled,
        uint256 _priorityFeeMultiplier,
        uint256 _pancakeV3SlippageCap,
        uint256 _biSwapSlippageCap,
        uint256 _pancakeV2SlippageCap,
        uint256 _apeSwapSlippageCap
    ) {
        return (
            mevProtectionEnabled,
            backrunEnabled,
            frontrunEnabled,
            priorityFeeMultiplier,
            pancakeV3SlippageCap,
            biSwapSlippageCap,
            pancakeV2SlippageCap,
            apeSwapSlippageCap
        );
    }
}