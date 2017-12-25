pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ECRecovery.sol";


contract ABroker is Destructible {
    using SafeMath for uint256;

    enum ChannelState { Open }

    struct PaymentChannel {
        address sender;
        address receiver;
        uint256 value;

        ChannelState state;
    }

    mapping(bytes32 => PaymentChannel) public channels;

    uint32 public chainId;
    uint256 id;

    event DidCreateChannel(bytes32 channelId);

    function ABroker(uint32 _chainId) public {
        chainId = _chainId;
        id = 0;
    }

    function openChannel(address receiver) public payable {
        var channelId = keccak256(block.number + id++);
        channels[channelId] = PaymentChannel(
            msg.sender,
            receiver,
            msg.value,
            ChannelState.Open
        );

        DidCreateChannel(channelId);
    }
}
