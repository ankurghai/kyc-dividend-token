// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/AccessControlDefaultAdminRules.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IKYCRegistry} from "./interfaces/IKYCRegistry.sol";
import {RWAToken} from "./RWAToken.sol";

contract DividendDistributor is AccessControlDefaultAdminRules, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    RWAToken public immutable token;
    IERC20 public immutable dividendToken;
    IKYCRegistry public kycRegistry;

    /// @notice Sum of (totalPool - distributed) across non-reclaimed epochs.
    uint256 public accountedDividendBalance;

    uint256 public reclaimWindow;

    struct Epoch {
        uint256 snapshotId;
        uint256 totalPool;
        uint256 supplyAt;
        uint256 createdAt;
        uint256 distributed;
        uint256 escrowedTotal;
        uint256 reclaimWindow;
        bool reclaimed;
    }

    Epoch[] public epochs;

    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    mapping(uint256 => mapping(address => uint256)) public escrow;

    event EpochCreated(
        uint256 indexed epoch,
        uint256 snapshotId,
        uint256 totalPool,
        uint256 supplyAt,
        uint256 reclaimWindow
    );
    event Paid(uint256 indexed epoch, address indexed recipient, uint256 amount);
    event Escrowed(uint256 indexed epoch, address indexed recipient, uint256 amount);
    event Skipped(uint256 indexed epoch, address indexed recipient, string reason);
    event EscrowClaimed(uint256 indexed epoch, address indexed recipient, uint256 amount);
    event Reclaimed(uint256 indexed epoch, address indexed to, uint256 amount);
    event ReclaimWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event KycRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event TokenRescued(address indexed token, address indexed to, uint256 amount);

    error InvalidEpoch();
    error AlreadyClaimed();
    error EpochReclaimed();
    error ReclaimWindowActive();
    error EscrowClaimWindowExpired();
    error NoEscrowBalance();
    error NotKycAllowed();
    error ZeroSupply();
    error ZeroAddress();
    error ZeroAmount();
    error ZeroWindow();
    error InsufficientRescuableBalance();

    constructor(
        address rwaTokenAddress,
        address dividendTokenAddress,
        address kycRegistryAddress,
        uint256 initialReclaimWindow,
        address admin,
        address operator,
        uint48 initialAdminDelay
    ) AccessControlDefaultAdminRules(initialAdminDelay, admin) {
        if (rwaTokenAddress == address(0)) revert ZeroAddress();
        if (dividendTokenAddress == address(0)) revert ZeroAddress();
        if (kycRegistryAddress == address(0)) revert ZeroAddress();
        if (admin == address(0)) revert ZeroAddress();
        if (operator == address(0)) revert ZeroAddress();
        if (initialReclaimWindow == 0) revert ZeroWindow();

        token = RWAToken(rwaTokenAddress);
        dividendToken = IERC20(dividendTokenAddress);
        kycRegistry = IKYCRegistry(kycRegistryAddress);
        reclaimWindow = initialReclaimWindow;

        _grantRole(OPERATOR_ROLE, operator);
        _grantRole(PAUSER_ROLE, admin);
    }

    function epochCount() external view returns (uint256) {
        return epochs.length;
    }

    function setKycRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newRegistry == address(0)) revert ZeroAddress();
        address old = address(kycRegistry);
        kycRegistry = IKYCRegistry(newRegistry);
        emit KycRegistryUpdated(old, newRegistry);
    }

    function setReclaimWindow(uint256 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newWindow == 0) revert ZeroWindow();
        uint256 oldWindow = reclaimWindow;
        reclaimWindow = newWindow;
        emit ReclaimWindowUpdated(oldWindow, newWindow);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @notice Sweep stray tokens. For the dividend token, only amounts above
    /// the accounted epoch obligations can be rescued.
    function rescueToken(address token_, uint256 amount, address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        if (token_ == address(dividendToken)) {
            uint256 balance = dividendToken.balanceOf(address(this));
            uint256 rescuable = balance > accountedDividendBalance
                ? balance - accountedDividendBalance
                : 0;
            if (amount > rescuable) revert InsufficientRescuableBalance();
        }

        IERC20(token_).safeTransfer(to, amount);
        emit TokenRescued(token_, to, amount);
    }

    function createEpoch(uint256 totalPool)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
        returns (uint256 epoch)
    {
        if (totalPool == 0) revert ZeroAmount();

        uint256 snapshotId = token.snapshot();
        uint256 supplyAt = token.totalSupplyAt(snapshotId);
        if (supplyAt == 0) revert ZeroSupply();

        uint256 balanceBefore = dividendToken.balanceOf(address(this));
        dividendToken.safeTransferFrom(msg.sender, address(this), totalPool);
        uint256 received = dividendToken.balanceOf(address(this)) - balanceBefore;
        if (received == 0) revert ZeroAmount();

        accountedDividendBalance += received;

        uint256 window = reclaimWindow;
        epoch = epochs.length;
        epochs.push(
            Epoch({
                snapshotId: snapshotId,
                totalPool: received,
                supplyAt: supplyAt,
                createdAt: block.timestamp,
                distributed: 0,
                escrowedTotal: 0,
                reclaimWindow: window,
                reclaimed: false
            })
        );

        emit EpochCreated(epoch, snapshotId, received, supplyAt, window);
    }

    function distribute(uint256 epoch, address[] calldata recipients)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        nonReentrant
    {
        _requireValidEpoch(epoch);
        uint256 length = recipients.length;
        for (uint256 i = 0; i < length; ) {
            address recipient = recipients[i];
            if (hasClaimed[epoch][recipient]) {
                emit Skipped(epoch, recipient, "already claimed");
            } else {
                _settle(epoch, recipient);
            }
            unchecked {
                ++i;
            }
        }
    }

    function claim(uint256 epoch) external whenNotPaused nonReentrant {
        _requireValidEpoch(epoch);
        if (hasClaimed[epoch][msg.sender]) revert AlreadyClaimed();
        _settle(epoch, msg.sender);
    }

    function claimEscrow(uint256 epoch) external whenNotPaused nonReentrant {
        if (epoch >= epochs.length) revert InvalidEpoch();
        Epoch storage e = epochs[epoch];
        if (e.reclaimed) revert EpochReclaimed();
        if (block.timestamp > e.createdAt + e.reclaimWindow) revert EscrowClaimWindowExpired();

        uint256 amount = escrow[epoch][msg.sender];
        if (amount == 0) revert NoEscrowBalance();
        if (!kycRegistry.isAllowed(msg.sender)) revert NotKycAllowed();

        escrow[epoch][msg.sender] = 0;
        e.escrowedTotal -= amount;
        e.distributed += amount;
        accountedDividendBalance -= amount;

        dividendToken.safeTransfer(msg.sender, amount);
        emit EscrowClaimed(epoch, msg.sender, amount);
    }

    /// @dev whenNotPaused so a pauser cannot freeze claimEscrow through the
    /// window's expiry and then sweep escrow that holders were unable to claim.
    function reclaim(uint256 epoch, address to)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenNotPaused
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (epoch >= epochs.length) revert InvalidEpoch();
        Epoch storage e = epochs[epoch];
        if (e.reclaimed) revert EpochReclaimed();
        if (block.timestamp <= e.createdAt + e.reclaimWindow) revert ReclaimWindowActive();

        uint256 remaining = e.totalPool - e.distributed;
        e.reclaimed = true;
        accountedDividendBalance -= remaining;

        if (remaining > 0) {
            dividendToken.safeTransfer(to, remaining);
        }

        emit Reclaimed(epoch, to, remaining);
    }

    function entitlement(uint256 epoch, address account) external view returns (uint256) {
        if (epoch >= epochs.length) revert InvalidEpoch();
        if (hasClaimed[epoch][account]) return 0;
        return _entitlement(epoch, account);
    }

    function _requireValidEpoch(uint256 epoch) internal view {
        if (epoch >= epochs.length) revert InvalidEpoch();
        if (epochs[epoch].reclaimed) revert EpochReclaimed();
    }

    function _entitlement(uint256 epoch, address account) internal view returns (uint256) {
        Epoch storage e = epochs[epoch];
        uint256 balance = token.balanceOfAt(account, e.snapshotId);
        if (balance == 0) {
            return 0;
        }

        uint256 pending = e.totalPool - e.distributed - e.escrowedTotal;
        if (pending == 0) {
            return 0;
        }

        uint256 amount = (balance * e.totalPool) / e.supplyAt;
        if (amount > pending) {
            amount = pending;
        }
        return amount;
    }

    function _settle(uint256 epoch, address account) internal {
        hasClaimed[epoch][account] = true;

        uint256 amount = _entitlement(epoch, account);
        if (amount == 0) {
            emit Skipped(epoch, account, "zero balance");
            return;
        }

        Epoch storage e = epochs[epoch];

        if (kycRegistry.isAllowed(account)) {
            e.distributed += amount;
            accountedDividendBalance -= amount;
            dividendToken.safeTransfer(account, amount);
            emit Paid(epoch, account, amount);
        } else {
            escrow[epoch][account] = amount;
            e.escrowedTotal += amount;
            emit Escrowed(epoch, account, amount);
        }
    }
}
