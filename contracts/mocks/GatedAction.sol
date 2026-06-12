// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";

/// @dev Demo helper — not used in production deployments.
contract GatedAction {
    IKYCRegistry public immutable kycRegistry;

    event ActionPerformed(address indexed caller);

    constructor(address kycRegistryAddress) {
        kycRegistry = IKYCRegistry(kycRegistryAddress);
    }

    function performAction() external {
        require(kycRegistry.isAllowed(msg.sender), "KYC required");
        emit ActionPerformed(msg.sender);
    }
}
