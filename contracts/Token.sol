// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "hardhat/console.sol";
import "./TokenVesting.sol";

contract Token is
ERC20,
ERC20Burnable,
ERC20Pausable,
Ownable,
ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    EnumerableSet.AddressSet private _blacklist;
    EnumerableSet.AddressSet private _whitelist;

    mapping(address => uint256) public lockedUntil;

    uint256 public sellingTax;
    uint256 public buyingTax;
    address public treasury;
    uint256 public burnRate;
    bool public burnEnabled;
    uint8 private _decimals;
    TokenVesting public vestingContract;

    mapping(address => bool) private _frozenAccounts;
    

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        uint256 initialSupply,
        uint256 _sellingTax,
        uint256 _buyingTax,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        require(
            initialOwner != address(0),
            "Token: owner must be non-zero address"
        );

        _decimals = decimals_;
        _mint(initialOwner, initialSupply * (10 ** uint256(decimals_)));
        sellingTax = _sellingTax;
        buyingTax = _buyingTax;

        vestingContract = new TokenVesting(address(this), initialOwner);
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function burn(uint256 amount) public override {
        super.burn(amount);
    }

    function burnFrom(address account, uint256 amount) public virtual override {
        uint256 decreasedAllowance = allowance(account, _msgSender()) - amount;
        _approve(account, _msgSender(), decreasedAllowance);
        super.burn(amount);
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function setSellingTax(uint256 _sellingTax) public onlyOwner {
        sellingTax = _sellingTax;
    }

    function setBuyingTax(uint256 _buyingTax) public onlyOwner {
        buyingTax = _buyingTax;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function lock(address account, uint256 time) public onlyOwner {
        lockedUntil[account] = block.timestamp + time;
    }

    function unlock(address account) public onlyOwner {
        lockedUntil[account] = 0;
    }

    function isLocked(address account) public view returns (bool) {
        return block.timestamp <= lockedUntil[account];
    }

    function distribute(
        address[] memory recipients,
        uint256[] memory values
    ) public onlyOwner {
        require(
            recipients.length == values.length,
            "Array lengths do not match"
        );

        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], values[i]);
        }
    }

    function reclaimToken(
        IERC20 other
    ) public onlyOwner nonReentrant {
        uint256 balance = other.balanceOf(address(this));
        other.safeTransfer(owner(), balance);
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }

    function blacklist(address account) public onlyOwner {
        _blacklist.add(account);
    }

    function unblacklist(address account) public onlyOwner {
        _blacklist.remove(account);
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklist.contains(account);
    }

    function setBurnRate(uint256 rate) public onlyOwner {
        burnRate = rate;
    }

    function enableBurn(bool enable) public onlyOwner {
        burnEnabled = enable;
    }

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

    function createVestingSchedule(
        address account,
        uint256 amount,
        uint256 start,
        uint256 cliff,
        uint256 duration
    ) external onlyOwner {
        approve(address(vestingContract), amount);
        vestingContract.setVestingSchedule(account, amount, start, cliff, duration);
    }

    function claimVestedTokens() external {
        vestingContract.claimVestedTokens(msg.sender);
    }

    function transferBatch(
        address[] memory recipients,
        uint256[] memory amounts
    ) public {
        require(
            recipients.length == amounts.length,
            "Token: Array lengths do not match"
        );
        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(msg.sender, recipients[i], amounts[i]);
        }
    }

    function recoverStolenTokens(
        address thief,
        address rightfulOwner,
        uint256 amount
    ) public onlyOwner {
        _transfer(thief, rightfulOwner, amount);
    }

    function freezeAccount(address target, bool freeze) public onlyOwner {
        _frozenAccounts[target] = freeze;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        if (isWhitelisted(msg.sender) || isWhitelisted(recipient)) {
            super.transfer(recipient, amount);
        } else {
            uint256 taxAmount = (amount * burnRate) / 100;
            uint256 sendAmount = amount - taxAmount;
            super.transfer(recipient, sendAmount);
            super.transfer(treasury, taxAmount);
        }
        return true;
    }

    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        require(
            !isBlacklisted(from) && !isBlacklisted(to),
            "ERC20: account is blacklisted"
        );

        require(!_frozenAccounts[from], "Token: account is frozen");

        super._update(from, to, amount);
    }
}
