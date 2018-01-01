"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Broker = artifacts.require('Broker.sol');
const ECRecovery = artifacts.require('zeppelin-solidity/contracts/ECRecovery.sol');
module.exports = async (deployer) => {
    await deployer.deploy(ECRecovery);
    await deployer.link(ECRecovery, Broker);
    await deployer.deploy(Broker, deployer.network_id);
};
//# sourceMappingURL=2_deploy_contracts.js.map