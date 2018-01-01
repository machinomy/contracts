import * as Deployer from 'truffle-deployer'

const Migrations = artifacts.require('Migrations.sol')

module.exports = function (deployer: Deployer) {
  deployer.deploy(Migrations)
}
