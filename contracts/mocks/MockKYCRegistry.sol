// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IKYCRegistry} from "../interfaces/IKYCRegistry.sol";

contract MockKYCRegistry is IKYCRegistry {
    mapping(address => bool) private _allowed;

    function setAllowed(address account, bool allowed) external {
        _allowed[account] = allowed;
    }

    function isAllowed(address account) external view returns (bool) {
        return _allowed[account];
    }
}
