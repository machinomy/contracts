import * as Web3 from 'web3'
import BigNumber from 'bignumber.js'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as abi from 'ethereumjs-abi'
import * as util from 'ethereumjs-util'

import {BBroker} from '../src/index'
import {getNetwork, randomUnlock} from './support'
import ECRecovery from '../build/wrappers/ECRecovery'
import BN = require('bn.js');

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3

interface PaymentChannel {
  sender: string
  receiver: string
  value: BigNumber
  hashlocks: string,
  settlingPeriod: BigNumber
  settlingUntil: BigNumber
}

interface Hashlock {
  lock: string
  adjustment: BigNumber
}

contract('BBroker', accounts => {
  let sender = accounts[0]
  let receiver = accounts[1]
  let alien = accounts[2]
  let channelValue = new BigNumber(web3.toWei(1, 'ether'))

  async function deployed (): Promise<BBroker.Contract> {
    let ecrecovery = artifacts.require<ECRecovery.Contract>('zeppelin-solidity/contracts/ECRecovery.sol')
    let contract = artifacts.require<BBroker.Contract>('BBroker.sol')
    if (contract.isDeployed()) {
      return contract.deployed()
    } else {
      let networkId = await getNetwork(web3)
      contract.link(ecrecovery)
      return contract.new(networkId, {from: sender, gas: 1800000})
    }
  }

  async function openChannel (instance: BBroker.Contract, unlock: string, _settlingPeriod?: number|BigNumber): Promise<string> {
    let options = { value: channelValue, from: sender }
    let lock = web3.sha3(unlock)
    let settlingPeriod = _settlingPeriod || 0
    let log = await instance.open(receiver, lock, settlingPeriod, options)
    let logEvent = log.logs[0]
    if (BBroker.isDidOpenEvent(logEvent)) {
      return logEvent.args.channelId
    } else {
      return Promise.reject(log.receipt)
    }
  }

  async function readChannel (instance: BBroker.Contract, channelId: string): Promise<PaymentChannel> {
    let [sender, receiver, value, hashlocks, settlingPeriod, settlingUntil] = await instance.channels(channelId)
    return { sender, receiver, value, hashlocks, settlingPeriod, settlingUntil }
  }

  function packHashlock (hashlock: Hashlock): string {
    let lockBuffer = abi.rawEncode(['bytes32', 'int256'], [hashlock.lock, hashlock.adjustment.toString()])
    return util.bufferToHex(lockBuffer)
  }

  function unpackHashlock (hashlock: string): Hashlock {
    let [lock, adjustment] = abi.rawDecode<[Buffer, BN]>(['bytes32', 'int256'], util.toBuffer(hashlock))
    return {
      lock: util.bufferToHex(lock),
      adjustment: new BigNumber(adjustment.toString())
    }
  }

  function decodeHashlocks (raw: string): Array<Hashlock> {
    let rawBuffer = util.toBuffer(raw)
    if (rawBuffer.length % 64 != 0) {
      throw new Error('Wrong length of the encoded hashlocks')
    } else {
      let i: number
      let result = []
      for (i = 0; i < rawBuffer.length; i += 64) {
        let element = rawBuffer.slice(i, i + 64)
        result.push(unpackHashlock(util.bufferToHex(element)))
      }
      return result
    }
  }

  let instance: BBroker.Contract

  before(async () => {
    instance = await deployed()
  })

  describe('open', () => {
    specify('emit DidOpen event', async () => {
      let channelId = await openChannel(instance, randomUnlock())
      assert.typeOf(channelId, 'string')
    })

    specify('increase contract balance', async () => {
      let startBalance = web3.eth.getBalance(instance.address)
      await openChannel(instance, randomUnlock())
      let endBalance = web3.eth.getBalance(instance.address)
      assert.deepEqual(endBalance, startBalance.plus(channelValue))
    })

    specify('set channel parameters', async () => {
      let unlock = randomUnlock()
      let channelId = await openChannel(instance, unlock)
      let channel = await readChannel(instance, channelId)
      assert.equal(channel.sender, sender)
      assert.equal(channel.receiver, receiver)
      assert.equal(channel.value.toString(), channelValue.toString())
      let recovered = decodeHashlocks(channel.hashlocks)
      assert.equal(recovered.length, 1)
      let hashlock = recovered[0]
      assert.equal(hashlock.lock, web3.sha3(unlock))
      assert.equal(hashlock.adjustment.toString(), channelValue.mul(-1).toString())
    })
  })

  describe('toHashlock', () => {
    specify('return packed lock, adjustment', async () => {
      let hashlock: Hashlock = {
        lock: web3.sha3('hello'),
        adjustment: channelValue.mul(-1)
      }
      let rawHashlock = await instance.toHashlock(hashlock.lock, hashlock.adjustment)
      assert.equal(rawHashlock, packHashlock(hashlock))
      let restored = unpackHashlock(rawHashlock)
      assert.equal(restored.lock, hashlock.lock)
      assert.equal(hashlock.adjustment.toString(), restored.adjustment.toString())

      let restoredArray = decodeHashlocks(rawHashlock)
      assert.equal(restoredArray.length, 1)
      assert.equal(restoredArray[0].lock, hashlock.lock)
      assert.equal(restoredArray[0].adjustment.toString(), hashlock.adjustment.toString())
    })
  })
})
