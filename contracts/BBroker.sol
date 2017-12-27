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

        bytes32 merkleRoot;

        uint32 settlingPeriod;
        uint256 settlingUntil;

        uint32 nonce;
    }

    mapping (bytes32 => PaymentChannel) public channels;

    uint32 public chainId;
    uint256 id;

    event DidOpen(bytes32 indexed channelId);
    event DidStartSettling(bytes32 indexed channelId);
    event DidWithdraw(bytes32 indexed channelId, int256 amount);
    event DidClose(bytes32 indexed channelId);

    function BBroker(uint32 _chainId) public {
        chainId = _chainId;
        id = 0;
    }

    function open(address receiver, uint32 settlingPeriod) public payable {
        bytes32 channelId = keccak256(block.number + id++);
        bytes32 merkleRoot = 0;
        uint256 settlingUntil = 0;
        uint32 nonce;
        channels[channelId] = PaymentChannel(
            msg.sender,
            receiver,
            msg.value,
            merkleRoot,
            settlingPeriod,
            settlingUntil,
            nonce
        );
        DidOpen(channelId);
    }

    function canStartSettling(bytes32 channelId, bytes32 merkleRoot, bytes senderSig, bytes receiverSig) public view returns(bool) {
        return isOpen(channelId) && isSignedPayment(channelId, merkleRoot, senderSig, receiverSig);
    }

    function startSettling(bytes32 channelId, bytes32 merkleRoot, bytes senderSig, bytes receiverSig) public {
        require(canStartSettling(channelId, merkleRoot, senderSig, receiverSig));
        var channel = channels[channelId];

        channel.merkleRoot = merkleRoot;
        channel.settlingUntil = block.number + channel.settlingPeriod;

        DidStartSettling(channelId);
    }

    function withdraw(bytes32 channelId, bytes proof, bytes32 preimage, int256 amount) public {
        var channel = channels[channelId];
        var hashlock = toHashlock(channelId, preimage, amount);
        require(checkProof(proof, channel.merkleRoot, hashlock));

        if (amount >= 0) {
            var payment = uint256(amount);
            channel.value -= payment;
            require(channel.receiver.send(payment));
        }

        DidWithdraw(channelId, amount);

        if (channel.value == 0) {
            delete channels[channelId];
            DidClose(channelId);
        }
    }

    /** Digest **/
    function isSignedPayment(bytes32 channelId, bytes32 merkleRoot, bytes senderSig, bytes receiverSig) public view returns(bool) {
        var channel = channels[channelId];
        var digest = signatureDigest(channelId, merkleRoot);
        bool isSignedBySender = channel.sender == ECRecovery.recover(digest, senderSig);
        bool isSignedByReceiver = channel.receiver == ECRecovery.recover(digest, receiverSig);
        return isSignedBySender && isSignedByReceiver;
    }

    function paymentDigest(bytes32 channelId, bytes32 merkleRoot) public constant returns(bytes32) {
        return keccak256(address(this), chainId, channelId, merkleRoot);
    }

    function signatureDigest(bytes32 channelId, bytes32 merkleRoot) public constant returns(bytes32) {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        return keccak256(prefix, paymentDigest(channelId, merkleRoot));
    }

    /** Hashlocks and Merkle Trees **/

    function toHashlock(bytes32 channelId, bytes32 preimage, int256 amount) public view returns (bytes32) {
        return keccak256(chainId, channelId, preimage, amount);
    }

    function checkProof(bytes proof, bytes32 merkleRoot, bytes32 hashlock) public pure returns (bool) {
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

        return cursor == merkleRoot;
    }

    /** Channel State **/
    function isPresent(bytes32 channelId) public view returns(bool) {
        var channel = channels[channelId];
        return channel.sender != 0;
    }

    function isSettling(bytes32 channelId) public view returns(bool) {
        var channel = channels[channelId];
        return channel.settlingUntil != 0;
    }

    function isOpen(bytes32 channelId) public view returns(bool) {
        return isPresent(channelId) && !isSettling(channelId);
    }
}
