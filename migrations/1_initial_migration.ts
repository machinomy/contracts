import * as Deployer from 'truffle-deployer'

const Migrations = artifacts.require('Migrations.sol')

module.exports = async (deployer: Deployer) => {
  await deployer.deploy(Migrations)
}
