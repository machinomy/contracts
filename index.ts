import * as util from 'ethereumjs-util'
import * as Web3 from 'web3'
import * as abi from 'ethereumjs-abi'

const BN = require('bn.js')
import BigNumber from 'bignumber.js'

import Broker from './build/wrappers/Broker'
import TokenBroker from './build/wrappers/TokenBroker'
import ERC20 from './build/wrappers/ERC20'
import BidiBroker from './build/wrappers/BidiBroker'

export {
  Broker,
  TokenBroker,
  ERC20,
  BidiBroker
}

export interface Signature {
  v: number
  r: Buffer
  s: Buffer
}

export function sign (web3: Web3, sender: string, digest: string): Promise<Signature> {
  return new Promise<Signature>((resolve, reject) => {
    web3.eth.sign(sender, digest, (error, signature) => {
      if (error) {
        reject(error)
      } else {
        resolve(util.fromRpcSig(signature))
      }
    })
  })
}

export function paymentDigest (channelId: string, value: BigNumber, contractAddress: string, chainId: number): string {
  let digest = abi.soliditySHA3(
    ['bytes32', 'uint256', 'address', 'uint32'],
    [channelId.toString(), new BigNumber(value).toString(), new BN(contractAddress, 16), chainId]
  )
  return util.bufferToHex(digest)
}

export function bidiPaymentDigest (channelId: string, nonce: number, payment: number|BigNumber, contractAddress: string, chainId: number): string {
  let digest = abi.soliditySHA3(
    ['bytes32', 'uint32', 'uint256', 'address', 'uint32'],
    [channelId, nonce, payment.toString(), contractAddress, chainId]
  )
  return util.bufferToHex(digest)
}
