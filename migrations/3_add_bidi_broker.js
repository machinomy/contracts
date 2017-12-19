var BidiBroker = artifacts.require("BidiBroker.sol");
var ECRecovery = artifacts.require("zeppelin-solidity/contracts/ECRecovery.sol");

module.exports = async function(deployer) {
  deployer.deploy(ECRecovery);
  deployer.link(ECRecovery, BidiBroker);
  deployer.deploy(BidiBroker, deployer.network_id);
};
