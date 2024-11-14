// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CryptoSnack Vesting
 */
contract CryptoSnackVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct VestingSchedule {
        uint256 totalAmount;
        uint256 startTime;
        uint256 cliff;
        uint256 duration;
        uint256 releasedAmount;
        bool revocable;
        bool revoked;
    }

    // Constants
    uint32 private constant MAX_VESTING_TIME = 315360000; // 10 years (10 * 365 * 24 * 60 * 60)

    // Errors
    error InvalidBeneficiary();
    error NoVestingSchedule();
    error VestingAlreadyExists();
    error InvalidVestingParameters();
    error InsufficientTokenBalance();
    error NotRevocable();
    error AlreadyRevoked();
    error NothingToRelease();
    error TransferFailed();

    // Events
    event VestingScheduleCreated(
        address indexed beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliff,
        uint256 duration
    );
    event TokensReleased(address indexed beneficiary, uint256 amount);
    event TokensRefunded(uint256 amount);
    event VestingRevoked(address indexed beneficiary);

    // State variables
    mapping(address => VestingSchedule) private _vestingSchedules;
    uint256 private _totalAllocated;

    // Token parameters
    IERC20 private immutable _token;

    constructor(address tokenAddress) Ownable(msg.sender) {
        _token = IERC20(tokenAddress);
    }

    // Views
    function getToken() external view returns (IERC20) {
        return _token;
    }

    function getVestingSchedule(address beneficiary) external view returns (VestingSchedule memory) {
        return _vestingSchedules[beneficiary];
    }

    function getTotalAllocated() external view returns (uint256) {
        return _totalAllocated;
    }

    // Vesting
    function createVestingSchedule(
        address beneficiary,
        uint256 amount,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 vestingDuration,
        bool revocable
    ) external onlyOwner {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (amount == 0) revert InvalidVestingParameters();
        if (startTime < block.timestamp) revert InvalidVestingParameters();
        if (cliffDuration == 0) revert InvalidVestingParameters();
        if (vestingDuration == 0) revert InvalidVestingParameters();
        if (cliffDuration > vestingDuration) revert InvalidVestingParameters();
        if (vestingDuration > MAX_VESTING_TIME) revert InvalidVestingParameters();
        if (_vestingSchedules[beneficiary].totalAmount != 0) revert VestingAlreadyExists();
        if (_token.balanceOf(address(this)) < amount + _totalAllocated) revert InsufficientTokenBalance();

        uint256 cliff = startTime + cliffDuration;

        _vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: amount,
            startTime: startTime,
            cliff: cliff,
            duration: vestingDuration,
            releasedAmount: 0,
            revocable: revocable,
            revoked: false
        });

        _totalAllocated += amount;

        emit VestingScheduleCreated(
            beneficiary,
            amount,
            startTime,
            cliff,
            vestingDuration
        );
    }

    function release() external nonReentrant {
        address beneficiary = msg.sender;
        VestingSchedule storage schedule = _vestingSchedules[beneficiary];

        if (schedule.totalAmount == 0) revert NoVestingSchedule();
        if (schedule.revoked) revert AlreadyRevoked();

        uint256 releasable = _getReleasableAmount(beneficiary);
        if (releasable == 0) revert NothingToRelease();

        schedule.releasedAmount += releasable;
        _totalAllocated -= releasable;
        _token.safeTransfer(beneficiary, releasable);
        emit TokensReleased(beneficiary, releasable);
    }

    /// @notice Would automatically transfer releasable tokens to the beneficiary and then transfer the remaining tokens to the owner
    function revoke(address beneficiary) external onlyOwner nonReentrant {
        VestingSchedule storage schedule = _vestingSchedules[beneficiary];

        if (schedule.totalAmount == 0) revert NoVestingSchedule();
        if (!schedule.revocable) revert NotRevocable();
        if (schedule.revoked) revert AlreadyRevoked();

        uint256 releasable = _getReleasableAmount(beneficiary);
        if (releasable > 0) {
            schedule.releasedAmount += releasable;
            _totalAllocated -= releasable;
            _token.safeTransfer(beneficiary, releasable);
            emit TokensReleased(beneficiary, releasable);
        }

        uint256 remaining = schedule.totalAmount - schedule.releasedAmount;
        if (remaining > 0) {
            _totalAllocated -= remaining;
            _token.safeTransfer(owner(), remaining);
            emit TokensRefunded(remaining);
        }

        schedule.revoked = true;
        emit VestingRevoked(beneficiary);
    }

    function _getReleasableAmount(address beneficiary) private view returns (uint256) {
        VestingSchedule memory schedule = _vestingSchedules[beneficiary];

        if (block.timestamp < schedule.cliff) {
            return 0;
        }

        if (schedule.revoked) {
            return 0;
        }

        uint256 vestedAmount;
        if (block.timestamp >= schedule.startTime + schedule.duration) {
            vestedAmount = schedule.totalAmount;
        } else {
            vestedAmount = (schedule.totalAmount * (block.timestamp - schedule.startTime)) / schedule.duration;
        }

        return vestedAmount - schedule.releasedAmount;
    }

    function getReleasableAmount(address beneficiary) external view returns (uint256) {
        return _getReleasableAmount(beneficiary);
    }

    /**
     * @dev Returns the current time.
     * @return the current timestamp in seconds.
     */
    function getCurrentTime() internal view virtual returns (uint256) {
        return block.timestamp;
    }

    // Utilities
    function reclaimToken(IERC20 token) external onlyOwner {
        if (token == _token) revert TransferFailed();

        uint256 balance = token.balanceOf(address(this));
        token.safeTransfer(owner(), balance);
    }

    function reclaimBNB() external onlyOwner {
        (bool success,) = owner().call{value: address(this).balance}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @dev This function is called for plain Ether transfers, i.e. for every call with empty calldata.
     */
    receive() external payable {}

    /**
     * @dev Fallback function is executed if none of the other functions match the function
     * identifier or no data was provided with the function call.
     */
    fallback() external payable {}
}
