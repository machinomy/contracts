import Web3 = require('web3')
import { TransactionResult } from 'truffle-contract'
import BigNumber from 'bignumber.js'
import * as truffle from 'truffle-contract'

export const GAS_PRICE = new BigNumber(100000000000)

export async function transactionPrice(transactionResult: truffle.TransactionResult): Promise<BigNumber> {
  let amount = await transactionResult.receipt.gasUsed
  return GAS_PRICE.mul(amount)
}

export function getNetwork (web3: Web3): Promise<number> {
  return new Promise((resolve, reject) => {
    web3.version.getNetwork((error, result) => {
      if (error) {
        reject(error)
      } else {
        resolve(parseInt(result, 10))
      }
    })
  })
}

export interface GasolineEntry {
  testName: string
  functionCall: string
  gasUsed: number
}

export class Gasoline {
  items: Array<GasolineEntry>
  show: boolean

  constructor (show?: boolean) {
    this.show = show || !!process.env.SHOW_GASOLINE
    this.items = []
  }

  add(testName: string, name: string, tx: truffle.TransactionResult) {
    let item = {
      testName: testName,
      functionCall: name,
      gasUsed: tx.receipt.gasUsed
    }
    this.items.push(item)
  }
}

export namespace ERC20Example {
  const Json = require('../build/contracts/ERC20example.json')

  export interface Contract {
    address: string

    mint (receiver: string, amount: BigNumber|number, opts?: Web3.TxData): Promise<TransactionResult>
    balanceOf (address: string): Promise<BigNumber>
    approve (address: string, startChannelValue: BigNumber, opts?: Web3.TxData): Promise<TransactionResult>
    deposit (address: string, channelId: string, startChannelValue: BigNumber, opts?: Web3.TxData): Promise<TransactionResult>
  }

  export const deploy = function (provider?: Web3.Provider, opts?: Web3.TxData): Promise<Contract> {
    let instance = truffle<Contract>(Json)
    if (provider) {
      instance.setProvider(provider)
    }
    return instance.new(opts)
  }

  export function deployed (provider?: Web3.Provider): Promise<Contract> {
    let instance = truffle<Contract>(Json)
    if (provider) {
      instance.setProvider(provider)
    }
    return instance.deployed()
  }
}

declare global {
  export var artifacts: {
    require <A> (name: string): truffle.TruffleContract<A>
  }
}
