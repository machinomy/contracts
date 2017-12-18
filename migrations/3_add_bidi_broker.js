var BidiBroker = artifacts.require("./BidiBroker.sol");

module.exports = async function(deployer) {
  deployer.deploy(BidiBroker, deployer.network_id);
};
