var TokenBroker = artifacts.require("./TokenBroker.sol")

module.exports = async function(deployer) {
  deployer.deploy(TokenBroker, deployer.network_id);
};
