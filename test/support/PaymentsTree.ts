import HexString from './HexString'
import * as BigNumber from 'bignumber.js'
import { toHashlock, hexProof } from './merkle'
import Address from './Address'
import MerkleTree from '../../src/MerkleTree'
import * as util from 'ethereumjs-util'

export interface PaymentLeaf {
  amount: BigNumber.BigNumber
  preimage?: HexString
  hashlock: Buffer
}

export class KnownPaymentLeaf implements PaymentLeaf {
  amount: BigNumber.BigNumber
  preimage: HexString
  hashlock: Buffer

  constructor (amount: BigNumber.BigNumber, preimage: HexString, hashlock: Buffer) {
    this.amount = amount
    this.preimage = preimage
    this.hashlock = hashlock
  }
}

export class UnknownPaymentLeaf implements PaymentLeaf {
  amount: BigNumber.BigNumber
  hashlock: Buffer

  constructor (amount: BigNumber.BigNumber, hashlock: Buffer) {
    this.amount = amount
    this.hashlock = hashlock
  }
}

export default class PaymentsTree {
  elements: Array<PaymentLeaf>
  channelId: HexString
  address: Address
  _merkleTree: MerkleTree

  get root (): HexString {
    return util.bufferToHex(this._merkleTree.root)
  }

  constructor (address: Address, channelId: HexString, elements?: Array<PaymentLeaf>) {
    this.address = address
    this.elements = elements ? elements : []
    this.channelId = channelId
    this.regenerateMerkleTree()
  }

  addPayment (amount: BigNumber.BigNumber, preimage: HexString) {
    let l = new KnownPaymentLeaf(amount, preimage, this.toHashlock(amount, preimage))
    this.elements.push(l)
    this.regenerateMerkleTree()
  }

  proof (leaf: KnownPaymentLeaf): HexString {
    let hashlock = leaf.hashlock
    let merkleProof = this._merkleTree.proof(hashlock)
    return hexProof(merkleProof)
  }

  toHashlock (amount: BigNumber.BigNumber, preimage: HexString): Buffer {
    return toHashlock(this.address, this.channelId, preimage, amount)
  }

  protected regenerateMerkleTree () {
    let buffers = this.elements.map(e => util.toBuffer(e.hashlock))
    this._merkleTree = new MerkleTree(buffers)
  }
}
