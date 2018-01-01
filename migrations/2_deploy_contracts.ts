import * as Deployer from 'truffle-deployer'

const Broker = artifacts.require('Broker.sol')
const ECRecovery = artifacts.require('zeppelin-solidity/contracts/ECRecovery.sol')
const MerkleProof = artifacts.require('zeppelin-solidity/contracts/MerkleProof.sol')

module.exports = async (deployer: Deployer) => {
  await deployer.deploy(ECRecovery)
  await deployer.link(ECRecovery, Broker)
  await deployer.deploy(MerkleProof)
  await deployer.link(MerkleProof, Broker)
  await deployer.deploy(Broker, deployer.network_id)
}
