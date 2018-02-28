const GAS = 2700000

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*" // Match any network id
    },
    ropsten: {
      host: "localhost",
      port: 8545,
      network_id: 3,
      from: '0x5D20CFdC322827519bDfC362Add9A98d65922e2C',
      gas: GAS
    },
    kovan: {
      host: "localhost",
      port: 8545,
      network_id: 42,
      from: '0x1edfecaa5c2ebcccc2a7f200619333d05beaaa69',
      gas: GAS
    },
    main: {
      host: "localhost",
      port: 8545,
      network_id: 1,
      gas: GAS,
      from: '0xa59eb37750f9c8f2e11aac6700e62ef89187e4ed',
      gasPrice: 15000000000
    },
    rinkeby: {
      host: "localhost",
      port: 8545,
      network_id: 4,
      from: '0xb5660e3210b398befaf228337f82c67d240f367c',
      gas: GAS
    },
  }
};
