import * as Deployer from 'truffle-deployer'

const Broker = artifacts.require('Broker.sol')
const ECRecovery = artifacts.require('zeppelin-solidity/contracts/ECRecovery.sol')
const MerkleProof = artifacts.require('zeppelin-solidity/contracts/MerkleProof.sol')

module.exports = function (deployer: Deployer) {
  deployer.deploy(ECRecovery)
  deployer.deploy(MerkleProof)
  deployer.link(ECRecovery, Broker)
  deployer.link(MerkleProof, Broker)
  deployer.deploy(Broker, deployer.network_id)
}
