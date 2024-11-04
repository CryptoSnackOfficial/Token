// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "hardhat/console.sol";


contract TokenVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        uint256 start;
        uint256 cliff;
        uint256 duration;
        uint256 amount;
        uint256 claimed;
    }

    mapping(address => VestingSchedule) private _vestingSchedules;
    IERC20 private immutable _token;

    constructor(address token, address initialOwner) Ownable(initialOwner) {
        _token = IERC20(token);
    }

    function setVestingSchedule(
        address account,
        uint256 amount,
        uint256 start,
        uint256 cliff,
        uint256 duration
    ) external onlyOwner {
        require(account != address(0), "Invalid beneficiary address");
        require(amount > 0, "Amount must be positive");
        require(
            cliff >= start && duration >= cliff,
            "TokenVesting: incorrect vesting timing"
        );

        // Verify existing schedule isn't being overwritten
        require(_vestingSchedules[account].amount == 0, "Schedule already exists");

        _vestingSchedules[account] = VestingSchedule(
            start,
            cliff,
            duration,
            amount,
            0
        );
    }

    function claimVestedTokens(address account) external nonReentrant {
        uint256 currentTime = block.timestamp;
        VestingSchedule storage schedule = _vestingSchedules[account];

        require(currentTime >= schedule.cliff, "TokenVesting: tokens are not yet vested");

        uint256 elapsedTime = currentTime - schedule.start;
        uint256 totalVestingTime = schedule.duration - schedule.start;

        elapsedTime = elapsedTime > totalVestingTime ? totalVestingTime : elapsedTime;

        uint256 tokensToClaim = ((schedule.amount * elapsedTime * 1e18) / totalVestingTime) / 1e18;
        tokensToClaim = tokensToClaim - schedule.claimed;

        require(tokensToClaim > 0, "TokenVesting: no tokens to claim");

        schedule.claimed += tokensToClaim;
        _token.safeTransfer(account, tokensToClaim);
    }

    function getVestingSchedule(address account) external view returns (VestingSchedule memory) {
        return _vestingSchedules[account];
    }
}
