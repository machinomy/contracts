var TokenBroker = artifacts.require("./TokenBroker.sol")

module.exports = function(deployer) {
  deployer.deploy(TokenBroker, parseInt(deployer.network_id));
};
