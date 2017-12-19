var Broker = artifacts.require("./Broker.sol");
var TokenBroker = artifacts.require("./TokenBroker.sol")

module.exports = async function(deployer) {
  deployer.deploy(Broker, deployer.network_id);
  deployer.deploy(TokenBroker, deployer.network_id);
};
