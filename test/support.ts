import * as Web3 from 'web3'
import * as truffle from 'truffle-contract'
import BigNumber from 'bignumber.js'

export const GAS_PRICE = new BigNumber(100000000000)

export function randomId (digits: number = 3) {
  const datePart = new Date().getTime() * Math.pow(10, digits)
  // 3 random digits
  const extraPart = Math.floor(Math.random() * Math.pow(10, digits))
  // 16 digits
  return datePart + extraPart
}

export async function transactionPrice (transactionResult: truffle.TransactionResult): Promise<BigNumber> {
  let amount = transactionResult.receipt.gasUsed
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

export function getBlock (web3: Web3, _number: string|number): Promise<Web3.BlockWithoutTransactionData> {
  return new Promise((resolve, reject) => {
    web3.eth.getBlock(_number, (error, block) => {
      if (error) {
        reject(error)
      } else {
        resolve(block)
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

  add (testName: string, name: string, tx: truffle.TransactionResult) {
    let item = {
      testName: testName,
      functionCall: name,
      gasUsed: tx.receipt.gasUsed
    }
    this.items.push(item)
  }
}
