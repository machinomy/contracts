pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";


contract BidirectionalBroker is Destructible {
    enum ChannelState { Open, Settling, Settled }

    struct Settlement {
        bytes32 channelId;
        uint64 paymentId;
        uint256 toSender;
        uint256 toReceiver;
    }

    struct PaymentChannel {
        address sender;
        address receiver;
        uint256 senderDeposit;
        uint256 receiverDeposit;

        uint256 settlementPeriod;
        uint256 validUntil;

        ChannelState state;
    }

    mapping(bytes32 => PaymentChannel) public channels;
    mapping(bytes32 => Settlement) public settlements;

    uint32 chainId;
    uint256 id;

    event DidCreateChannel(bytes32 channelId);

    function Broker(uint32 _chainId) public {
        chainId = _chainId;
        id = 0;
    }
}
