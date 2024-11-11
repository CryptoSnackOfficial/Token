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
    uint256 private constant TAX_PRECISION = 10000; // used to set taxes with 2 decimals precision
    uint256 private constant MAX_TAX = 2500; // 25.00%

    uint256 private constant MAX_BATCH_SIZE = 200; // for multi-transfers

    // Errors
    error ArraysLengthMismatch();
    error InvalidBatchLength();
    error BlacklistedAccount(address account);
    error InvalidTaxWallet();
    error TaxTooHigh(uint256 tax);
    error InvalidDexAddress();
    error TransferFailed();
    error AccountNotFrozen();
    error AccountAlreadyFrozen();
    error FrozenAccount(address account);

    // Events
    event TokensMinted(address indexed to, uint256 amount);
    event TaxWalletUpdated(address indexed oldWallet, address indexed newWallet);
    event TaxesEnabled();
    event TaxesDisabled();
    event TaxesUpdated(uint16 buyTax, uint16 sellTax);
    event DexStatusChanged(address indexed dex, bool status);
    event BlacklistStatusChanged(address indexed account, bool status);
    event WhitelistStatusChanged(address indexed account, bool status);
    event AccountFrozen(address indexed account, uint256 until);
    event TokensRecovered(address indexed from, address indexed to, uint256 amount);

    // State variables
    mapping(address => bool) private _blacklist;
    mapping(address => bool) private _whitelist;
    mapping(address => bool) private _isDex;
    mapping(address => uint256) private _frozenUntil;

    // Token parameters
    uint16 private _sellingTax; // up to 10000
    uint16 private _buyingTax;  // up to 10000
    bool private _taxEnabled;
    address private _taxWallet;

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint16 sellingTax_,
        uint16 buyingTax_,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        if (sellingTax_ >= MAX_TAX) revert TaxTooHigh(sellingTax_);
        if (buyingTax_ >= MAX_TAX) revert TaxTooHigh(buyingTax_);

        _mint(initialOwner, initialSupply * (10 ** uint256(decimals())));
        _sellingTax = sellingTax_;
        _buyingTax = buyingTax_;
        _taxEnabled = sellingTax_ > 0 || buyingTax_ > 0;
    }

    // Basic operations
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    // burn methods are implemented in ERC20Burnable

    // Views
    function getBuyingTax() public view returns (uint256) {
        return _buyingTax;
    }

    function getSellingTax() public view returns (uint256) {
        return _sellingTax;
    }

    function isTaxEnabled() public view returns (bool) {
        return _taxEnabled;
    }

    function isDex(address account) public view returns (bool) {
        return _isDex[account];
    }

    function getTaxWallet() public view returns (address) {
        return _taxWallet;
    }

    // Mass distribution (e.g. for airdrops)
    function multiTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) public onlyOwner nonReentrant whenNotPaused {
        if (recipients.length != amounts.length) revert ArraysLengthMismatch();
        if (recipients.length > MAX_BATCH_SIZE) revert InvalidBatchLength();
        if (recipients.length == 0) revert InvalidBatchLength();

        for (uint256 i = 0; i < recipients.length; i++) {
            transfer(recipients[i], amounts[i]);
        }
    }

    function multiTransferEqual(
        address[] calldata recipients,
        uint256 amount
    ) public onlyOwner nonReentrant whenNotPaused {
        if (recipients.length > MAX_BATCH_SIZE) revert InvalidBatchLength();
        if (recipients.length == 0) revert InvalidBatchLength();
        if (balanceOf(owner()) < amount * recipients.length) revert TransferFailed();

        for (uint256 i = 0; i < recipients.length; i++) {
            transfer(recipients[i], amount);
        }
    }

    // Pause functionality
    function pause() public onlyOwner {
        _pause(); // emits Paused
    }

    function unpause() public onlyOwner {
        _unpause(); // emits Unpaused
    }

    // Tax + DEX management
    function setSellingTax(uint16 sellingTax_) public onlyOwner {
        if (sellingTax_ >= MAX_TAX) revert TaxTooHigh(sellingTax_);
        _sellingTax = sellingTax_;
        emit TaxesUpdated(_buyingTax, sellingTax_);
    }

    function setBuyingTax(uint16 buyingTax_) public onlyOwner {
        if (buyingTax_ >= MAX_TAX) revert TaxTooHigh(buyingTax_);
        _buyingTax = buyingTax_;
        emit TaxesUpdated(buyingTax_, _sellingTax);
    }

    function setTaxEnabled(bool status) public onlyOwner {
        _taxEnabled = status;
        if (status) emit TaxesEnabled();
        else emit TaxesDisabled();
    }

    function setDex(address dex, bool status) public onlyOwner {
        if (dex == address(0)) revert InvalidDexAddress();
        _isDex[dex] = status;
        emit DexStatusChanged(dex, status);
    }

    function setTaxWallet(address taxWallet) public onlyOwner {
        if (taxWallet == address(0)) revert InvalidTaxWallet();
        address oldWallet = _taxWallet;
        _taxWallet = taxWallet;
        emit TaxWalletUpdated(oldWallet, taxWallet);
    }

    // Whitelist management
    function setWhitelist(address account, bool status) public onlyOwner {
        _whitelist[account] = status;
        emit WhitelistStatusChanged(account, status);
    }

    function isWhitelisted(address account) public view returns (bool) {
        return _whitelist[account];
    }

    // Blacklist management
    function setBlacklist(address account, bool status) public onlyOwner {
        _blacklist[account] = status;
        emit BlacklistStatusChanged(account, status);
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklist[account];
    }

    // Token recovery
    function freezeAccount(address account) public onlyOwner {
        if (_frozenUntil[account] > block.timestamp) revert AccountAlreadyFrozen();

        uint256 freezeTime = block.timestamp + 24 hours;
        _frozenUntil[account] = freezeTime;
        emit AccountFrozen(account, freezeTime);
    }

    function recoverStolenTokens(
        address from,
        address to,
        uint256 amount
    ) public onlyOwner {
        if (_frozenUntil[from] <= block.timestamp) revert AccountNotFrozen();

        // Transfer tokens and reset freeze
        _transfer(from, to, amount);
        _frozenUntil[from] = 0;

        emit TokensRecovered(from, to, amount);
    }

    function isFrozen(address account) public view returns (bool) {
        return _frozenUntil[account] > block.timestamp;
    }

    function getFreezeTime(address account) public view returns (uint256) {
        return _frozenUntil[account];
    }

    // Override functions
    function transfer(address to, uint256 value) public override returns (bool) {
        address sender = _msgSender();
        _transferWithTax(sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, value); // would revert if insufficient balance
        _transferWithTax(from, to, value);
        return true;
    }

    function _calculateTax(uint256 amount, uint256 taxRate) internal pure returns (uint256) {
        return (amount * taxRate) / TAX_PRECISION;
    }

    function _transferWithTax(address from, address to, uint256 value) internal {
        if (_whitelist[from] || _whitelist[to] || !_taxEnabled) {
            super._transfer(from, to, value);
            return;
        }

        uint256 taxAmount = 0;
        if (_isDex[from] && _buyingTax > 0) {
            taxAmount = _calculateTax(value, _buyingTax);
        } else if (_isDex[to] && _sellingTax > 0) {
            taxAmount = _calculateTax(value, _sellingTax);
        }

        if (taxAmount > 0) {
            if (_taxWallet == address(0)) revert InvalidTaxWallet();
            super._transfer(from, _taxWallet, taxAmount);
            super._transfer(from, to, value - taxAmount);
        } else {
            super._transfer(from, to, value);
        }
    }

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        if (_blacklist[from]) revert BlacklistedAccount(from);
        if (_blacklist[to]) revert BlacklistedAccount(to);

        // bypass check for tokens recovery
        if (_msgSender() != owner()) {
            if (from != address(0) && _frozenUntil[from] > block.timestamp) revert FrozenAccount(from);
            if (to != address(0) && _frozenUntil[to] > block.timestamp) revert FrozenAccount(to);
        }

        super._update(from, to, amount);
    }

    // Utilities
    function reclaimToken(IERC20 token) public onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);
    }

    function reclaimBNB() public onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        if (!success) revert TransferFailed();
    }

    // To receive BNB
    receive() external payable {}
}
