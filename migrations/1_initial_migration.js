"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Migrations = artifacts.require('Migrations.sol');
module.exports = async (deployer) => {
    await deployer.deploy(Migrations);
};
//# sourceMappingURL=1_initial_migration.js.map