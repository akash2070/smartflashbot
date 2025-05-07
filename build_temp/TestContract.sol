
    // SPDX-License-Identifier: MIT
    pragma solidity 0.8.21;
    
    contract TestContract {
      address public owner;
      uint256 public value;
      
      constructor() {
        owner = msg.sender;
        value = 0;
      }
      
      function setValue(uint256 _value) public {
        require(msg.sender == owner, "Only owner can set value");
        value = _value;
      }
      
      function getValue() public view returns (uint256) {
        return value;
      }
    }
    