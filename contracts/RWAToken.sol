// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Snapshot} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Snapshot.sol";
import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IKYCRegistry} from "./interfaces/IKYCRegistry.sol";

contract RWAToken is
    ERC20,
    ERC20Snapshot,
    ERC20Burnable,
    AccessControlDefaultAdminRules,
    Pausable
{
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant SNAPSHOT_ROLE = keccak256("SNAPSHOT_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 private immutable _cap;
    IKYCRegistry public kycRegistry;
    bool public kycTransfersEnabled;

    event KycRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event KycTransfersEnabledUpdated(bool enabled);

    error CapExceeded();
    error NotKycAllowed();
    error ZeroAddress();

    /// @param cap_ Maximum supply (0 = uncapped).
    /// @param kycRegistryAddress Optional registry for transfer gating (address(0) = none).
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 cap_,
        address admin,
        address kycRegistryAddress,
        uint48 initialDelay
    ) ERC20(name_, symbol_) AccessControlDefaultAdminRules(initialDelay, admin) {
        if (admin == address(0)) revert ZeroAddress();
        _cap = cap_;
        if (kycRegistryAddress != address(0)) {
            kycRegistry = IKYCRegistry(kycRegistryAddress);
        }
        _grantRole(MINTER_ROLE, admin);
        _grantRole(SNAPSHOT_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function cap() external view returns (uint256) {
        return _cap;
    }

    function setKycRegistry(address newRegistry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address old = address(kycRegistry);
        kycRegistry = IKYCRegistry(newRegistry);
        emit KycRegistryUpdated(old, newRegistry);
    }

    function setKycTransfersEnabled(bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        kycTransfersEnabled = enabled;
        emit KycTransfersEnabledUpdated(enabled);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (_cap > 0 && totalSupply() + amount > _cap) revert CapExceeded();
        _mint(to, amount);
    }

    function snapshot() external onlyRole(SNAPSHOT_ROLE) returns (uint256) {
        return _snapshot();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20, ERC20Snapshot) whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);

        if (kycTransfersEnabled && address(kycRegistry) != address(0)) {
            if (from != address(0) && !kycRegistry.isAllowed(from)) {
                revert NotKycAllowed();
            }
            if (to != address(0) && !kycRegistry.isAllowed(to)) {
                revert NotKycAllowed();
            }
        }
    }
}
