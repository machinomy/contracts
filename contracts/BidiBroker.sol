pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ECRecovery.sol";

// @title Bi-directional payment channels broker
// @author Sergey Ukustov <sergey.ukustov@machinomy.com>


contract BidiBroker is Destructible {
    using SafeMath for uint256;

    enum ChannelState { Open, Settling, Settled }

    struct Settlement {
        uint32 nonce;
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
            now + duration, // solium-disable-line
            ChannelState.Open
        );

        DidCreateChannel(channelId);

        return channelId;
    }

    //** Deposit functions. Let contract client decide what to call **//

    function canSenderDeposit(bytes32 channelId, address sender) public constant returns(bool) {
        var channel = channels[channelId];
        return (channel.sender == sender && channel.state == ChannelState.Open);
    }

    function senderDeposit(bytes32 channelId) public payable {
        require(canSenderDeposit(channelId, msg.sender));
        var channel = channels[channelId];
        channel.senderDeposit = channel.senderDeposit.add(msg.value);
        DidDeposit(channelId);
    }

    function canReceiverDeposit(bytes32 channelId, address receiver) public constant returns(bool) {
        var channel = channels[channelId];
        return (channel.receiver == receiver && channel.state == ChannelState.Open);
    }

    function receiverDeposit(bytes32 channelId) public payable {
        require(canReceiverDeposit(channelId, msg.sender));
        var channel = channels[channelId];
        channel.receiverDeposit = channel.receiverDeposit.add(msg.value);
        DidDeposit(channelId);
    }

    //** Ancillary **//

    function signatory(bytes32 channelId, uint32 nonce, uint256 payment, bytes signature) public constant returns(address) {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 hash = keccak256(prefix, keccak256(channelId, nonce, payment, address(this), chainId));
        return ECRecovery.recover(hash, signature);
    }

    //---------------//

    function canClaim(bytes32 channelId, address signor) public constant returns(bool) {
        var channel = channels[channelId];
        return (channel.state == ChannelState.Open || channel.state == ChannelState.Settling) &&
            (channel.sender == signor || channel.receiver == signor);
    }

    function recoverSignor(
        bytes32 channelId,
        uint32 nonce,
        uint256 payment,
        uint8 v,
        bytes32 r,
        bytes32 s) public constant returns(address)
    {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(prefix, keccak256(channelId, nonce, payment, address(this), chainId));
        return ecrecover(prefixedHash, v, r, s);
    }

    function claim(
        bytes32 channelId,
        uint32 nonce,
        uint256 payment,
        uint8 v,
        bytes32 r,
        bytes32 s) public
    {
        var signor = recoverSignor(
            channelId,
            nonce,
            payment,
            v,
            r,
            s
        );
        require(canClaim(channelId, signor));
        var channel = channels[channelId];
        if (channel.state == ChannelState.Open) {
            if (channel.sender == signor) {
                settlements[channelId] = Settlement(nonce, 0, payment);
            } else if (channel.receiver == signor) {
                settlements[channelId] = Settlement(nonce, payment, 0);
            }
            channel.state = ChannelState.Settling;
        } else if (channel.state == ChannelState.Settling) {
            var settlement = settlements[channelId];
            require(nonce > settlement.nonce);
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
