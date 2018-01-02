import * as abi from 'ethereumjs-abi'
import * as util from 'ethereumjs-util'
import HexString from './HexString'
import Address from "./Address"
import * as BigNumber from 'bignumber.js'

export function hexProof (proof: Array<Buffer>): HexString {
  return '0x' + proof.map(e => e.toString('hex')).join('')
}

export function toHashlock(address: Address, channelId: HexString, preimage: HexString, amount: BigNumber.BigNumber): Buffer {
  return abi.soliditySHA3(
    ['address', 'bytes32', 'bytes32', 'int256'],
    [address, channelId, preimage, amount.toString()]
  )
}
