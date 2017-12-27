import * as Web3 from 'web3'
import BigNumber from 'bignumber.js'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as abi from 'ethereumjs-abi'
import * as util from 'ethereumjs-util'

import {BBroker} from '../src/index'
import {getNetwork, randomUnlock} from './support'
import ECRecovery from '../build/wrappers/ECRecovery'

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3

interface PaymentChannel {
  sender: string
  receiver: string
  value: BigNumber
}

interface Hashlock {
  preimage: string
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
    let log = await instance.open(receiver, options)
    let logEvent = log.logs[0]
    if (BBroker.isDidOpenEvent(logEvent)) {
      return logEvent.args.channelId
    } else {
      return Promise.reject(log.receipt)
    }
  }

  async function readChannel (instance: BBroker.Contract, channelId: string): Promise<PaymentChannel> {
    let [ sender, receiver, value ]= await instance.channels(channelId)
    return { sender, receiver, value }
  }

  async function packHashlock (channelId: string, hashlock: Hashlock): Promise<string> {
    let hashlockBuffer = abi.soliditySHA3(
      ['uint32', 'bytes32', 'bytes32', 'int256'],
      [(await getNetwork(web3)), channelId, hashlock.preimage, hashlock.adjustment.toString()]
    )
    return util.bufferToHex(hashlockBuffer)
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
    })
  })

  describe('toHashlock', () => {
    specify('return packed lock, adjustment', async () => {
      let channelId = '0xdeadbeaf'
      let hashlock: Hashlock = {
        preimage: web3.sha3('hello'),
        adjustment: channelValue.mul(-1)
      }
      let rawHashlock = await instance.toHashlock(channelId, hashlock.preimage, hashlock.adjustment)
      assert.equal(rawHashlock, await packHashlock(channelId, hashlock))
    })
  })
})
