// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CryptoSnackToken
 */
contract CryptoSnackToken is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Constants
    uint16 private constant TAX_PRECISION  = 10000; // used to set taxes with 2 decimals precision
    uint16 private constant MAX_TAX        = 2500;  // 25.00%
    uint8  private constant MAX_BATCH_SIZE = 200;   // for multi-transfers

    // Errors
    error BurnDisallowed();
    error ArraysLengthMismatch();
    error InvalidBatchLength();
    error BlacklistedAccount(address account);
    error InvalidTaxWallet();
    error TaxTooHigh(uint16 tax);
    error InvalidDexAddress();
    error TransferFailed();
    error AccountNotFrozen();
    error AccountAlreadyFrozen();
    error FrozenAccount(address account);

    // Events
    event BurnEnabled();
    event BurnDisabled();
    event TokensMinted(address indexed to, uint256 value);
    event TaxWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event TaxesEnabled();
    event TaxesDisabled();
    event TaxesUpdated(uint16 buyTax, uint16 sellTax);
    event DexStatusChanged(address indexed dex, bool status);
    event BlacklistStatusChanged(address indexed account, bool status);
    event WhitelistStatusChanged(address indexed account, bool status);
    event AccountFrozen(address indexed account, uint256 until);
    event TokensRecovered(address indexed from, address indexed to, uint256 value);

    // State variables
    mapping(address => bool)    private _blacklist;
    mapping(address => bool)    private _whitelist;
    mapping(address => bool)    private _isDex;
    mapping(address => uint256) private _frozenUntil;

    // Token parameters
    uint16  private _sellingTax;  // up to 10000
    uint16  private _buyingTax;   // up to 10000
    bool    private _taxEnabled;
    address private _taxWallet;
    bool    private _burnEnabled; // restricts token burn to owner only

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint16 sellingTax,
        uint16 buyingTax,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        if (sellingTax > MAX_TAX) revert TaxTooHigh(sellingTax);
        if (buyingTax > MAX_TAX) revert TaxTooHigh(buyingTax);

        _mint(initialOwner, initialSupply * (10 ** uint256(decimals())));
        _sellingTax = sellingTax;
        _buyingTax = buyingTax;
        _taxEnabled = sellingTax > 0 || buyingTax > 0;
        _burnEnabled = false;
    }

    // Basic operations
    function mint(address to, uint256 value) external onlyOwner {
        _mint(to, value);
        emit TokensMinted(to, value);
    }

    // Burn
    function burn(uint256 value) public override {
        if (!_burnEnabled && _msgSender() != owner()) revert BurnDisallowed();
        super.burn(value);
    }

    function burnFrom(address account, uint256 value) public override {
        if (!_burnEnabled && _msgSender() != owner()) revert BurnDisallowed();
        super.burnFrom(account, value);
    }

    function setBurnEnabled(bool burnEnabled) external onlyOwner {
        _burnEnabled = burnEnabled;
        if (burnEnabled) emit BurnEnabled();
        else emit BurnDisabled();
    }

    // Views
    function getBuyingTax() external view returns (uint256) {
        return _buyingTax;
    }

    function getSellingTax() external view returns (uint256) {
        return _sellingTax;
    }

    function isTaxEnabled() external view returns (bool) {
        return _taxEnabled;
    }

    function isDex(address account) external view returns (bool) {
        return _isDex[account];
    }

    function getTaxWallet() external view returns (address) {
        return _taxWallet;
    }

    function getBurnEnabled() external view returns (bool) {
        return _burnEnabled;
    }

    // Mass distribution (e.g. for airdrops)
    function multiTransfer(
        address[] calldata recipients,
        uint256[] calldata values
    ) external onlyOwner nonReentrant whenNotPaused {
        uint256 length = recipients.length;
        if (length != values.length) revert ArraysLengthMismatch();
        if (length == 0 || length > MAX_BATCH_SIZE) revert InvalidBatchLength();

        address sender = _msgSender();
        uint256 totalValue;

        for (uint256 i = 0; i < length;) {
            totalValue += values[i];
            unchecked {++i;}
        }

        if (balanceOf(sender) < totalValue) revert TransferFailed();

        for (uint256 i = 0; i < length;) {
            // intended behavior: shouldn't revert if recipient is blacklisted
            if (!_blacklist[recipients[i]]) {
                _transfer(sender, recipients[i], values[i]);
            }
            unchecked {++i;}
        }
    }

    function multiTransferEqual(
        address[] calldata recipients,
        uint256 value
    ) external onlyOwner nonReentrant whenNotPaused {
        uint256 length = recipients.length;
        if (length == 0 || length > MAX_BATCH_SIZE) revert InvalidBatchLength();

        address sender = _msgSender();
        uint256 totalValue = value * length;
        if (balanceOf(sender) < totalValue) revert TransferFailed();

        for (uint256 i = 0; i < length;) {
            // intended behavior: shouldn't revert if recipient is blacklisted
            if (!_blacklist[recipients[i]]) {
                _transfer(sender, recipients[i], value);
            }
            unchecked {++i;}
        }
    }

    // Pause functionality
    function pause() external onlyOwner {
        _pause(); // emits Paused
    }

    function unpause() external onlyOwner {
        _unpause(); // emits Unpaused
    }

    // Tax + DEX management
    function setSellingTax(uint16 sellingTax) external onlyOwner {
        if (sellingTax > MAX_TAX) revert TaxTooHigh(sellingTax);
        _sellingTax = sellingTax;
        emit TaxesUpdated(_buyingTax, sellingTax);
    }

    function setBuyingTax(uint16 buyingTax) external onlyOwner {
        if (buyingTax > MAX_TAX) revert TaxTooHigh(buyingTax);
        _buyingTax = buyingTax;
        emit TaxesUpdated(buyingTax, _sellingTax);
    }

    function setTaxEnabled(bool taxEnabled) external onlyOwner {
        _taxEnabled = taxEnabled;
        if (taxEnabled) emit TaxesEnabled();
        else emit TaxesDisabled();
    }

    function setDex(address dex, bool status) external onlyOwner {
        if (dex == address(0)) revert InvalidDexAddress();
        _isDex[dex] = status;
        emit DexStatusChanged(dex, status);
    }

    function setTaxWallet(address taxWallet) external onlyOwner {
        if (taxWallet == address(0)) revert InvalidTaxWallet();
        address oldWallet = _taxWallet;
        _taxWallet = taxWallet;
        emit TaxWalletUpdated(oldWallet, taxWallet);
    }

    // Whitelist management
    function setWhitelist(address account, bool status) external onlyOwner {
        _whitelist[account] = status;
        emit WhitelistStatusChanged(account, status);
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _whitelist[account];
    }

    // Blacklist management
    function setBlacklist(address account, bool status) external onlyOwner {
        _blacklist[account] = status;
        emit BlacklistStatusChanged(account, status);
    }

    function isBlacklisted(address account) external view returns (bool) {
        return _blacklist[account];
    }

    // Token recovery
    function freezeAccount(address account) external onlyOwner {
        if (_frozenUntil[account] > block.timestamp) revert AccountAlreadyFrozen();

        uint256 freezeTime = block.timestamp + 24 hours;
        _frozenUntil[account] = freezeTime;
        emit AccountFrozen(account, freezeTime);
    }

    function recoverStolenTokens(address from, address to, uint256 value) external onlyOwner nonReentrant {
        if (_frozenUntil[from] <= block.timestamp) revert AccountNotFrozen();

        // Transfer tokens and reset freeze
        _transfer(from, to, value);
        _frozenUntil[from] = 0;

        emit TokensRecovered(from, to, value);
    }

    function isFrozen(address account) public view returns (bool) {
        return _frozenUntil[account] > block.timestamp;
    }

    function getFreezeTime(address account) public view returns (uint256) {
        return _frozenUntil[account];
    }

    // Override functions
    function transfer(address to, uint256 value) public override returns (bool) {
        _transferWithTax(_msgSender(), to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _spendAllowance(from, _msgSender(), value); // would revert if insufficient balance
        _transferWithTax(from, to, value);
        return true;
    }

    function _calculateTax(uint256 value, uint256 taxRate) private pure returns (uint256) {
        return (value * taxRate) / TAX_PRECISION;
    }

    function _transferWithTax(address from, address to, uint256 value) private {
        if (!_taxEnabled || _whitelist[from] || _whitelist[to]) {
            _transfer(from, to, value);
            return;
        }

        uint256 taxAmount = 0;
        if (_isDex[from] && _buyingTax > 0) {
            taxAmount = _calculateTax(value, _buyingTax);
        } else if (_isDex[to] && _sellingTax > 0) {
            taxAmount = _calculateTax(value, _sellingTax);
        }

        if (taxAmount > 0) {
            address taxWallet = _taxWallet;
            if (taxWallet == address(0)) revert InvalidTaxWallet();
            _transfer(from, taxWallet, taxAmount);
            _transfer(from, to, value - taxAmount);
        } else {
            _transfer(from, to, value);
        }
    }

    function _update(address from, address to, uint256 value) internal virtual override(ERC20, ERC20Pausable) {
        if (_blacklist[from]) revert BlacklistedAccount(from);
        if (_blacklist[to]) revert BlacklistedAccount(to);

        // bypass check for tokens recovery
        if (_msgSender() != owner()) {
            if (from != address(0) && _frozenUntil[from] > block.timestamp) revert FrozenAccount(from);
            if (to != address(0) && _frozenUntil[to] > block.timestamp) revert FrozenAccount(to);
        }

        super._update(from, to, value);
    }

    // Utilities
    function reclaimToken(IERC20 token) external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);
    }

    function reclaimBNB() external onlyOwner {
        (bool success,) = owner().call{value: address(this).balance}("");
        if (!success) revert TransferFailed();
    }

    // To receive BNB
    receive() external payable {}
}
