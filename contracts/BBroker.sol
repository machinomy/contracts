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

        bytes hashlocks;

        uint32 settlingPeriod;
        uint256 settlingUntil;
    }

    mapping (bytes32 => PaymentChannel) public channels;

    uint32 public chainId;
    uint256 id;

    event DidOpen(bytes32 indexed channelId);

    function BBroker(uint32 _chainId) public {
        chainId = _chainId;
        id = 0;
    }

    function open(address receiver, bytes32 lock, uint32 settlingPeriod) public payable {
        var channelId = keccak256(block.number + id++);
        var hashlocks = toHashlock(lock, -1 * int256(msg.value));
        channels[channelId] = PaymentChannel(
            msg.sender,
            receiver,
            msg.value,
            hashlocks,
            settlingPeriod,
            0
        );
        DidOpen(channelId);
    }

    function toHashlock(bytes32 lock, int256 adjustment) public pure returns (bytes b) {
        b = new bytes(64);
        assembly {
            mstore(add(b, 32), lock)
            mstore(add(b, 64), adjustment)
        }
    }
}
