pragma solidity ^0.4.11;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ECRecovery.sol";

// @title Bi-directional payment channels broker
// @author Sergey Ukustov <sergey.ukustov@machinomy.com>


contract BidiBroker is Destructible {
    using SafeMath for uint256;

    enum ChannelState { Open, Settling }

    struct Balance {
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
    mapping(bytes32 => Balance) public balances;

    uint32 chainId;
    uint256 id;

    event DidCreateChannel(bytes32 indexed channelId);
    event DidDeposit(bytes32 indexed channelId);
    event DidUpdateBalance(bytes32 indexed channelId, uint32 nonce, uint256 toSender, uint256 toReceiver);
    event DidStartSettle(bytes32 indexed channelId);

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

    //** Update balance functions. Let contract client decide what to call **//

    function receiverUpdateBalance(bytes32 channelId, uint32 nonce, uint256 payment, bytes signature) public {
        var channel = channels[channelId];
        var balance = balances[channelId];

        var isBiggerNonce = nonce > balance.nonce;
        var isSignedBySender = channel.sender == signatory(channelId, nonce, payment, signature);
        var isCalledByReceiver = msg.sender == channel.receiver;
        require(isCalledByReceiver && isBiggerNonce && isSignedBySender);

        balance.toReceiver = payment;
        balance.toSender = channel.senderDeposit.add(channel.receiverDeposit).sub(payment);
        DidUpdateBalance(channelId, nonce, toSender, toReceiver);
    }

    function senderUpdateBalance(bytes32 channelId, uint32 nonce, uint256 payment, bytes signature) public {
        var channel = channels[channelId];
        var balance = balances[channelId];

        require(nonce > balance.nonce && channel.receiver == signatory(channelId, nonce, payment, signature));

        balance.toSender = payment;
        balance.toReceiver = channel.senderDeposit.add(channel.receiverDeposit).sub(payment);
        DidUpdateBalance(channelId, nonce, toSender, toReceiver);
    }

    //** Settle. Let contract client decide what to call **//

    function senderClaim(bytes32 channelId, uint32 nonce, uint256 payment, bytes signature) public {
        var channel = channels[channelId];
        require(channel.state == ChannelState.Open);
        senderUpdateBalance(channelId, nonce, payment, signature);

        channels[channelId].state = ChannelState.Settling;
        DidStartSettle(channelId);
    }

    function receiverClaim(bytes32 channelId, uint32 nonce, uint256 payment, bytes signature) public {
        var channel = channels[channelId];
        require(channel.state == ChannelState.Open);
        receiverUpdateBalance(channelId, nonce, payment, signature);

        channels[channelId].state = ChannelState.Settling;
        DidStartSettle(channelId);
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
                balances[channelId] = Balance(nonce, 0, payment);
            } else if (channel.receiver == signor) {
                balances[channelId] = Balance(nonce, payment, 0);
            }
            channel.state = ChannelState.Settling;
        } else if (channel.state == ChannelState.Settling) {
            var balance = balances[channelId];
            require(nonce > balance.nonce);
            var total = channel.senderDeposit.add(channel.receiverDeposit);
            if (signor == channel.sender && balance.toReceiver == 0) {
                balance.toReceiver = payment;
                balance.toSender = total.sub(payment);
            } else if (signor == channel.receiver && balance.toSender == 0) {
                balance.toSender = payment;
                balance.toReceiver = total.sub(payment);
            }
            require(channel.receiver.send(balance.toReceiver));
            require(channel.sender.send(balance.toSender));
            delete channels[channelId];
            delete balances[channelId];
        }
    }
}
