var Broker = artifacts.require("./Broker.sol");

module.exports = async function(deployer) {
  deployer.deploy(Broker, deployer.network_id);
};
