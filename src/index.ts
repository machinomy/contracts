import * as util from 'ethereumjs-util'
import * as Web3 from 'web3'
import * as abi from 'ethereumjs-abi'
import BigNumber from 'bignumber.js'

import Broker from '../build/wrappers/Broker'
import TokenBroker from '../build/wrappers/TokenBroker'
import ERC20 from '../build/wrappers/ERC20'
import ABroker from '../build/wrappers/ABroker'
import BBroker from '../build/wrappers/BBroker'
import MerkleTree from './MerkleTree'

const BN = require('bn.js')

export {
  Broker,
  TokenBroker,
  ERC20,
  ABroker,
  BBroker,
  MerkleTree
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
