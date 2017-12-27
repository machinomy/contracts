pragma solidity ^0.4.18;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ECRecovery.sol";


contract BBroker is Destructible {
    using SafeMath for uint256;

    struct PaymentChannel {
        address sender;
        address receiver;
        uint256 value;
    }

    mapping (bytes32 => PaymentChannel) public channels;

    uint32 public chainId;
    uint256 id;

    event DidOpen(bytes32 indexed channelId);

    function BBroker(uint32 _chainId) public {
        chainId = _chainId;
        id = 0;
    }

    function open(address receiver) public payable {
        var channelId = keccak256(block.number + id++);
        channels[channelId] = PaymentChannel(
            msg.sender,
            receiver,
            msg.value
        );
        DidOpen(channelId);
    }

    function toHashlock(bytes32 channelId, bytes32 preimage, int256 adjustment) public view returns (bytes32) {
        return keccak256(chainId, channelId, preimage, adjustment);
    }

    function checkProof(bytes proof, bytes32 root, bytes32 hashlock) public pure returns (bool) {
        bytes32 proofElement;
        bytes32 cursor = hashlock;

        for (uint256 i = 32; i <= proof.length; i += 32) {
            assembly { proofElement := mload(add(proof, i)) }

            if (cursor < proofElement) {
                cursor = keccak256(cursor, proofElement);
            } else {
                cursor = keccak256(proofElement, cursor);
            }
        }

        return cursor == root;
    }
}
