pragma solidity ^0.4.15;

import "zeppelin-solidity/contracts/lifecycle/Destructible.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ECRecovery.sol";


contract ABroker is Destructible {
    using SafeMath for uint256;

    struct Settling {
        uint256 until;
    }

    struct PaymentChannel {
        address sender;
        address receiver;
        uint256 value;

        uint32 settlingPeriod;
    }

    mapping (bytes32 => PaymentChannel) public channels;
    mapping (bytes32 => Settling) public settlings;

    uint32 public chainId;
    uint256 id;

    event DidOpen(bytes32 channelId);
    event DidClaim(bytes32 channelId);
    event DidStartSettling(bytes32 channelId);
    event DidSettle(bytes32 channelId);

    function ABroker(uint32 _chainId) public {
        chainId = _chainId;
        id = 0;
    }

    function open(address receiver, uint32 settlingPeriod) public payable {
        var channelId = keccak256(block.number + id++);
        channels[channelId] = PaymentChannel(
            msg.sender,
            receiver,
            msg.value,
            settlingPeriod
        );

        DidOpen(channelId);
    }

    function canStartSettling(bytes32 channelId, address origin) public constant returns(bool) {
        var channel = channels[channelId];
        bool isSender = channel.sender == origin;
        return isOpen(channelId) && isSender;
    }

    function startSettling(bytes32 channelId) public {
        require(canStartSettling(channelId, msg.sender));

        settlings[channelId] = Settling(block.number + channels[channelId].settlingPeriod);

        DidStartSettling(channelId);
    }

    function canSettle(bytes32 channelId, address origin) public constant returns(bool) {
        var channel = channels[channelId];
        bool isSender = channel.sender == origin;
        var settling = settlings[channelId];
        bool isWaitingOver = block.number >= settling.until;
        return isSender && isSettling(channelId) && isWaitingOver;
    }

    function settle(bytes32 channelId) public {
        require(canSettle(channelId, msg.sender));
        var channel = channels[channelId];
        require(channel.sender.send(channel.value));

        delete settlings[channelId];
        delete channels[channelId];
        DidSettle(channelId);
    }

    function canClaim(bytes32 channelId, uint256 payment, address origin, bytes signature) public constant returns(bool) {
        var channel = channels[channelId];
        bool isReceiver = origin == channel.receiver;
        var hash = signatureDigest(channelId, payment);
        bool isSigned = channel.sender == ECRecovery.recover(hash, signature);

        return isReceiver && isSigned;
    }

    function claim(bytes32 channelId, uint256 payment, bytes signature) public {
        require(canClaim(channelId, payment, msg.sender, signature));

        var channel = channels[channelId];

        if (payment > channel.value) {
            require(channel.receiver.send(channel.value));
        } else {
            require(channel.receiver.send(payment));
            require(channel.sender.send(channel.value.sub(payment)));
        }

        delete channels[channelId];

        DidClaim(channelId);
    }

    function isPresent(bytes32 channelId) public constant returns(bool) {
        var channel = channels[channelId];
        return channel.sender != 0;
    }

    function isSettling(bytes32 channelId) public constant returns(bool) {
        var settling = settlings[channelId];
        return settling.until != 0;
    }

    function isOpen(bytes32 channelId) public constant returns(bool) {
        return isPresent(channelId) && !isSettling(channelId);
    }

    function paymentDigest(bytes32 channelId, uint256 payment) public constant returns(bytes32) {
        return keccak256(address(this), chainId, channelId, payment);
    }

    function signatureDigest(bytes32 channelId, uint256 payment) public constant returns(bytes32) {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        return keccak256(prefix, paymentDigest(channelId, payment));
    }
}
