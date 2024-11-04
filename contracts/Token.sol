// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./TokenVesting.sol";

/**
 * @title Token
 */
contract Token is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 private constant PRECISION_SCALE = 10000;  // 100.00%

    // State variables
    EnumerableSet.AddressSet private _blacklist;
    EnumerableSet.AddressSet private _whitelist;
    mapping(address => uint256) public _lockedUntil;
    mapping(address => bool) private _frozenAccounts;

    // Token parameters
    uint256 private _sellingTax;
    uint256 private _buyingTax;
    uint256 private _burnRate;
    bool private _burnEnabled;
    address private _treasury;
    TokenVesting private _vestingContract;

    // Errors
    // todo

    // Events
    event RecoveryExecuted(
        address indexed compromisedAccount,
        address indexed rightfulOwner,
        uint256 recoveredAmount,
        uint256 indexed executionTimestamp
    );

    event TokensLocked(address indexed account, uint256 untilTimestamp);
    event TokensUnlocked(address indexed account);

    /**
     * @dev Constructor
     */
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        uint256 sellingTax_,
        uint256 buyingTax_,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        // initialOwner is checked for zero address in `Ownable`

        _mint(initialOwner, initialSupply * (10 ** uint256(decimals())));
        _sellingTax = sellingTax_;
        _buyingTax = buyingTax_;

        _vestingContract = new TokenVesting(address(this), initialOwner);
    }

    // Basic operations
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) public override {
        super.burn(amount);
    }

    function burnFrom(address account, uint256 amount) public virtual override {
        require(account != address(0), "Cannot burn from zero address");
        require(amount > 0, "Amount must be greater than zero");
        require(balanceOf(account) >= amount, "Insufficient balance to burn");

        uint256 currentAllowance = allowance(account, _msgSender());
        require(currentAllowance >= amount, "Burn amount exceeds allowance");

        // checked for overflow upper
        unchecked {
            _approve(account, _msgSender(), currentAllowance - amount);
        }

        super.burn(amount);
    }

    // Pause functionality
    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    // todo: Tax management
    function setSellingTax(uint256 sellingTax_) public onlyOwner {
        _sellingTax = sellingTax_;
    }

    function setBuyingTax(uint256 buyingTax_) public onlyOwner {
        _buyingTax = buyingTax_;
    }

    // Lock management
    function lock(address account, uint256 time) public onlyOwner {
        require(account != address(0), "Cannot lock zero address");
        require(time > 0, "Lock time must be positive");

        uint256 unlockTime = block.timestamp + time;
        require(unlockTime > block.timestamp, "Lock time overflow");

        _lockedUntil[account] = unlockTime;
        emit TokensLocked(account, unlockTime);
    }

    function unlock(address account) public onlyOwner {
        require(account != address(0), "Cannot unlock zero address");
        require(_lockedUntil[account] > 0, "Account not locked");

        _lockedUntil[account] = 0;
        emit TokensUnlocked(account);
    }

    function isLocked(address account) public view returns (bool) {
        return block.timestamp <= _lockedUntil[account];
    }

    // Distribution and reclaim
    function distribute(
        address[] memory recipients,
        uint256[] memory values
    ) public onlyOwner {
        require(recipients.length == values.length, "ERC20: array lengths mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], values[i]);
        }
    }

    function reclaimToken(IERC20 other) public onlyOwner nonReentrant {
        uint256 balance = other.balanceOf(address(this));
        other.safeTransfer(owner(), balance);
    }

    // Treasury management
    function setTreasury(address treasury_) public onlyOwner {
        _treasury = treasury_;
    }

    // Burn management
    function setBurnRate(uint256 burnRate_) public onlyOwner {
        require(burnRate_ <= 100 * PRECISION_SCALE, "Token: burn rate cannot exceed 100%");

        _burnRate = burnRate_;
    }

    function enableBurn(bool burnEnabled_) public onlyOwner {
        _burnEnabled = burnEnabled_;
    }

    // Whitelist management
    function setWhitelist(address account, bool status) public onlyOwner {
        if (status) {
            _whitelist.add(account);
        } else {
            _whitelist.remove(account);
        }
    }

    function isWhitelisted(address account) public view returns (bool) {
        return _whitelist.contains(account);
    }

    // Blacklist management
    function setBlacklist(address account, bool status) public onlyOwner {
        if (status) {
            _blacklist.add(account);
        } else {
            _blacklist.remove(account);
        }
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklist.contains(account);
    }

    // Vesting functionality
    function createVestingSchedule(
        address account,
        uint256 amount,
        uint256 start,
        uint256 cliff,
        uint256 duration
    ) external onlyOwner {
        approve(address(_vestingContract), amount);
        _vestingContract.setVestingSchedule(account, amount, start, cliff, duration);
    }

    function claimVestedTokens() external {
        _vestingContract.claimVestedTokens(msg.sender);
    }

    function vestingContract() public view returns (TokenVesting) {
        return _vestingContract;
    }

    // Batch transfer
    function transferBatch(
        address[] memory recipients,
        uint256[] memory amounts
    ) public {
        require(recipients.length == amounts.length, "Array lengths do not match");
        require(recipients.length > 0, "Empty arrays");

        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Invalid recipient");
            require(amounts[i] > 0, "Invalid amount");
            _transfer(msg.sender, recipients[i], amounts[i]);
        }
    }

    // Recovery/freeze functionality
    function freezeAccount(address target) external onlyOwner {
        require(target != address(0), "Invalid address");
        require(!_frozenAccounts[target], "Account already frozen");

        _frozenAccounts[target] = true;
    }

    function executeRecovery(
        address target,
        address rightfulOwner
    ) external onlyOwner {
        require(target != address(0) && rightfulOwner != address(0), "Invalid address");
        require(_frozenAccounts[target], "Account not frozen");

        uint256 balance = balanceOf(target);
        _transfer(target, rightfulOwner, balance);

        _frozenAccounts[target] = false;

        emit RecoveryExecuted(target, rightfulOwner, balance, block.timestamp);
    }

    function freezeAccount(address target, bool freeze) public onlyOwner {
        require(target != address(0), "Invalid address");
        require(!isBlacklisted(target), "ERC20: account is blacklisted");
        require(!_frozenAccounts[target], "ERC20: account is already frozen");

        _frozenAccounts[target] = freeze;
    }

    // Override functions
    function transfer(
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        if (!_burnEnabled || isWhitelisted(msg.sender) || isWhitelisted(recipient)) {
            super.transfer(recipient, amount);
        } else {
            uint256 taxAmount = (amount * _burnRate * PRECISION_SCALE) / (100 * PRECISION_SCALE);
            uint256 sendAmount = amount - taxAmount;
            super.transfer(recipient, sendAmount);
            super.transfer(_treasury, taxAmount);
        }
        return true;
    }

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        require(!isBlacklisted(from) && !isBlacklisted(to), "ERC20: account is blacklisted");
        require(!_frozenAccounts[from], "Token: account is frozen");

        super._update(from, to, amount);
    }
}
