var Broker = artifacts.require('BBroker.sol')
var ECRecovery = artifacts.require('zeppelin-solidity/contracts/ECRecovery.sol')

module.exports = async function(deployer) {
  await deployer.deploy(ECRecovery)
  await deployer.link(ECRecovery, Broker)
  await deployer.deploy(Broker, deployer.network_id)
};
