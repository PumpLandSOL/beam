// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @notice minimal ERC-20 used only by the local anvil end-to-end tests
contract TestToken {
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance; uint8 public constant decimals = 18;
    constructor(uint256 supply) { balanceOf[msg.sender] = supply; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) { allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true; }
}
