// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/**
 * @title MinimalTestContract
 * @dev A simplified test contract to verify deployment pipeline
 */
contract MinimalTestContract {
    address public owner;
    bool public initialized;
    string public message;
    
    constructor() {
        owner = msg.sender;
        initialized = false;
    }
    
    function initialize(string memory _message) public {
        require(msg.sender == owner, "Only owner can initialize");
        require(!initialized, "Already initialized");
        
        message = _message;
        initialized = true;
    }
    
    function updateMessage(string memory _message) public {
        require(msg.sender == owner, "Only owner can update message");
        require(initialized, "Not yet initialized");
        
        message = _message;
    }
    
    function getContractInfo() public view returns (address, string memory, bool) {
        return (owner, message, initialized);
    }
}