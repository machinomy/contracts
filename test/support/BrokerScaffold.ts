import * as BigNumber from 'bignumber.js'
import * as Web3 from 'web3'
import Broker from '../../build/wrappers/Broker'
import Address from './Address'
import PaymentChannel from './PaymentChannel'
import * as truffle from 'truffle-contract'
import HexString from './HexString'
import PaymentUpdate from './PaymentUpdate'
import { randomId } from '../support'
import * as uuid from 'uuid'
import * as util from 'ethereumjs-util'

export const FAKE_CHANNEL_ID = '0xdeadbeaf'

export interface Opts {
  instance: Broker.Contract
  channelValue: BigNumber.BigNumber
  sender: Address
  receiver: Address
  alien: Address
  web3: Web3
}

export interface OpenChannelOpts {
  sender?: Address
  receiver?: Address
  settlingPeriod?: number
  value?: BigNumber.BigNumber
}

export class BrokerScaffold {
  instance: Broker.Contract
  channelValue: BigNumber.BigNumber
  sender: Address
  receiver: Address
  alien: Address
  web3: Web3

  constructor (opts: Opts) {
    this.instance = opts.instance
    this.channelValue = opts.channelValue
    this.sender = opts.sender
    this.receiver = opts.receiver
    this.alien = opts.alien
    this.web3 = opts.web3
  }

  async openChannel (opts: OpenChannelOpts = {}): Promise<string> {
    let options = {
      value: opts.value || this.channelValue,
      from: opts.sender || this.sender
    }
    let receiver = opts.receiver || this.receiver
    let settlementPeriod = opts.settlingPeriod || 0
    let log = await this.instance.open(receiver, settlementPeriod, options)
    let logEvent = log.logs[0]
    if (Broker.isDidOpenEvent(logEvent)) {
      return logEvent.args.channelId
    } else {
      return Promise.reject(log.receipt)
    }
  }

  async readChannel (channelId: string): Promise<PaymentChannel> {
    let raw = await this.instance.channels(channelId)
    let [ sender, receiver, value, root, settlingPeriod, settlingUntil, nonce ] = raw
    return { sender, receiver, value, root, settlingPeriod, settlingUntil, nonce }
  }

  async nextUpdate (channelId: HexString, merkleRoot: HexString, _sender?: Address, _receiver?: Address, _nonce?: number): Promise<PaymentUpdate> {
    let channel = await this.readChannel(channelId)
    let nextNonce = (_nonce || _nonce === 0) ? _nonce : channel.nonce.toNumber() + 1
    let fingerprint = await this.instance.updateFingerprint(channelId, nextNonce, merkleRoot)
    return this.genericUpdate(channelId, merkleRoot, fingerprint, _sender, _receiver)
  }

  async nextSettleUpdate (channelId: HexString, merkleRoot: HexString, _sender?: Address, _receiver?: Address, _nonce?: number): Promise<PaymentUpdate> {
    let channel = await this.readChannel(channelId)
    let nextNonce = (_nonce || _nonce === 0) ? _nonce : channel.nonce.toNumber() + 1
    let fingerprint = await this.instance.settleFingerprint(channelId, nextNonce, merkleRoot)
    return this.genericUpdate(channelId, merkleRoot, fingerprint, _sender, _receiver)
  }

  async canUpdate (update: PaymentUpdate): Promise<boolean> {
    return this.instance.canUpdate(update.channelId, update.nonce, update.merkleRoot, update.senderSig, update.receiverSig)
  }

  async update (update: PaymentUpdate): Promise<truffle.TransactionResult> {
    return this.instance.update(update.channelId, update.nonce, update.merkleRoot, update.senderSig, update.receiverSig)
  }

  async settle (update: PaymentUpdate, from?: Address): Promise<truffle.TransactionResult> {
    let opts: Web3.CallData = {}
    if (from) {
      opts.from = from
    }
    return this.instance.settle(update.channelId, update.nonce, update.merkleRoot, update.senderSig, update.receiverSig, opts)
  }

  async startSettling (channelId: string, _origin?: string): Promise<truffle.TransactionResult> {
    let origin = _origin || this.sender
    return this.instance.startSettling(channelId, {from: origin})
  }

  async sign (origin: Address, digest: HexString): Promise<HexString> {
    return new Promise<string>((resolve, reject) => {
      this.web3.eth.sign(origin, digest, (error, signature) => {
        error ? reject(error) : resolve(signature)
      })
    })
  }

  protected async genericUpdate (channelId: HexString, merkleRoot: HexString, fingerprint: HexString, _sender?: Address, _receiver?: Address, _nonce?: number): Promise<PaymentUpdate> {
    let channel = await this.readChannel(channelId)
    let nextNonce = (_nonce || _nonce === 0) ? _nonce : channel.nonce.toNumber() + 1
    let sender = _sender || this.sender
    let receiver = _receiver || this.receiver
    let senderSig = await this.sign(sender, fingerprint)
    let receiverSig = await this.sign(receiver, fingerprint)
    return {
      channelId: channelId,
      nonce: nextNonce,
      merkleRoot: merkleRoot,
      senderSig: senderSig,
      receiverSig: receiverSig
    }
  }
}

export async function inSequence (times: number, fn: () => Promise<void>): Promise<void> {
  await Array.from(Array(times)).reduce(prev => {
    return prev.then(async () => {
      await fn()
    })
  }, Promise.resolve())
}

export function randomPreimage (): string {
  let raw = uuid() + randomId().toString()
  return util.bufferToHex(util.sha3(raw))
}
