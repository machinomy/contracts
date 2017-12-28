const FROM = process.env.FROM
const PASSWORD = process.env.PASSWORD

module.exports = {
  networks: {
    development: {
      network_id: "*",
      host: "localhost",
      port: 8545,
      gas: 2600000
    },
    ropsten: {
      network_id: 3,
      host: "localhost",
      port: 8545,
      gas: 2600000,
      from: FROM,
      password: PASSWORD
    },
    kovan: {
      network_id: 42,
      host: "localhost",
      port: 8545,
      gas: 2600000,
      from: FROM,
      password: PASSWORD
    }
  }
}
