pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";


contract BidiBroker is Destructible {
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

    event DidCreateChannel(bytes32 indexed channelId);
    event DidDeposit(bytes32 indexed channelId);

    function BidiBroker(uint32 _chainId) public {
        chainId = _chainId;
        id = 0;
    }

    function createChannel(address receiver, uint32 duration, uint32 settlementPeriod) public payable returns(bytes32) {
        var channelId = keccak256(block.number + id++);
        var sender = msg.sender;
        channels[channelId] = PaymentChannel(
            sender,
            receiver,
            msg.value,
            0,
            settlementPeriod,
            now + duration,
            ChannelState.Open);

        DidCreateChannel(channelId);

        return channelId;
    }

    function deposit(bytes32 channelId) public payable {
        require(canDeposit(msg.sender, channelId));

        var channel = channels[channelId];
        if (channel.sender == msg.sender) {
            channel.senderDeposit += msg.value;
        } else if (channel.receiver == msg.sender) {
            channel.receiverDeposit += msg.value;
        }

        DidDeposit(channelId);
    }

    function canDeposit(address sender, bytes32 channelId) public constant returns(bool) {
        var channel = channels[channelId];
        return channel.state == ChannelState.Open && (channel.sender == sender || channel.receiver == sender);
    }
}
