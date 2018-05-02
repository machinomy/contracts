import * as BigNumber from 'bignumber.js'
import * as truffle from 'truffle-contract'
import * as Web3 from 'web3'

export function txPrice (web3: Web3, log: truffle.TransactionResult): BigNumber.BigNumber {
  return web3.eth.getTransaction(log.tx).gasPrice.mul(log.receipt.gasUsed)
}

const LOG_GAS_COST = true // Boolean(process.env.LOG_GAS_COST)
const GAS_COST_IN_USD = 0.000012 // 1 ETH = 600 USD

export class Gaser {
  web3: Web3

  constructor (_web3: Web3) {
    this.web3 = _web3
  }

  async gasDiff<A> (name: string, account: string, fn: () => A, forceLog: boolean = false) {
    let before = this.web3.eth.getBalance(account)
    let result = fn()
    let after = this.web3.eth.getBalance(account)
    let gasCost = before.minus(after).div(this.web3.eth.gasPrice.div(0.2)).toNumber()
    this.log(gasCost, name, forceLog)
    return result
  }

  async logGas (name: string, promisedTx: Promise<truffle.TransactionResult>, forceLog: boolean = false) {
    let tx = await promisedTx
    this.log(tx.receipt.gasUsed, name, forceLog)
    return tx
  }

  private log (gasCost: number, name: string, forceLog: boolean = false) {
    if (LOG_GAS_COST || forceLog) {
      console.log(`GAS: ${name}: ($${(gasCost * GAS_COST_IN_USD).toFixed(2)})`, gasCost)
    }
  }
}
