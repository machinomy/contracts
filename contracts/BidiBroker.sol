pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";


contract BidiBroker is Destructible {
    using SafeMath for uint256;

    enum ChannelState { Open, Settling, Settled }

    struct Settlement {
        uint32 paymentId;
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
            channel.senderDeposit = channel.senderDeposit.add(msg.value);
        } else if (channel.receiver == msg.sender) {
            channel.receiverDeposit = channel.receiverDeposit.add(msg.value);
        }

        DidDeposit(channelId);
    }

    function canDeposit(address sender, bytes32 channelId) public constant returns(bool) {
        var channel = channels[channelId];
        return channel.state == ChannelState.Open && (channel.sender == sender || channel.receiver == sender);
    }

    function canClaim(bytes32 channelId, address signor) public constant returns(bool) {
        var channel = channels[channelId];
        return (channel.state == ChannelState.Open || channel.state == ChannelState.Settling) &&
            (channel.sender == signor || channel.receiver == signor);
    }

    function recoverSignor(bytes32 channelId, uint32 paymentId, uint256 payment, uint8 v, bytes32 r, bytes32 s) public constant returns(address) {
        var channel = channels[channelId];
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(prefix, keccak256(channelId, payment, address(this), chainId));
        return ecrecover(prefixedHash, v, r, s);
    }

    function claim(bytes32 channelId, uint32 paymentId, uint256 payment, uint8 v, bytes32 r, bytes32 s) public {
        var signor = recoverSignor(channelId, paymentId, payment, v, r, s);
        require(canClaim(channelId, signor));
        var channel = channels[channelId];
        if (channel.state == ChannelState.Open) {
            if (channel.sender == signor) {
                settlements[channelId] = Settlement(paymentId, 0, payment);
            } else if (channel.receiver == signor) {
                settlements[channelId] = Settlement(paymentId, payment, 0);
            }
            channel.state = ChannelState.Settling;
        } else if (channel.state == ChannelState.Settling) {
            var settlement = settlements[channelId];
            require(paymentId > settlement.paymentId);
            var total = channel.senderDeposit.add(channel.receiverDeposit);
            if (signor == channel.sender && settlement.toReceiver == 0) {
                settlement.toReceiver = payment;
                settlement.toSender = total.sub(payment);
            } else if (signor == channel.receiver && settlement.toSender == 0) {
                settlement.toSender = payment;
                settlement.toReceiver = total.sub(payment);
            }
            require(channel.receiver.send(settlement.toReceiver));
            require(channel.sender.send(settlement.toSender));
            delete channels[channelId];
            delete settlements[channelId];
        }
    }
}
