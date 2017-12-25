import * as Web3 from 'web3'
import BigNumber from 'bignumber.js'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as abi from 'ethereumjs-abi'
import * as util from 'ethereumjs-util'

import { ABroker } from '../src/index'
import {transactionPrice, getNetwork, Gasoline} from './support'
import ECRecovery from '../build/wrappers/ECRecovery'

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3
const gasoline = new Gasoline(true)

enum PaymentChannelState {
  OPEN = 0
}

interface PaymentChannel {
  sender: string
  receiver: string
  value: BigNumber
  state: BigNumber
}

contract('ABroker', accounts => {
  let sender = accounts[0]
  let receiver = accounts[1]
  let delta = new BigNumber(web3.toWei(1, 'ether'))

  async function deployed (): Promise<ABroker.Contract> {
    let ecrecovery = artifacts.require<ECRecovery.Contract>('zeppelin-solidity/contracts/ECRecovery.sol')
    let contract = artifacts.require<ABroker.Contract>('ABroker.sol')
    if (contract.isDeployed()) {
      return contract.deployed()
    } else {
      let networkId = await getNetwork(web3)
      contract.link(ecrecovery)
      return contract.new(networkId, {from: sender, gas: 1800000})
    }
  }

  async function createChannel (instance: ABroker.Contract): Promise<string> {
    let options = { value: delta, from: sender }
    let log = await instance.open(receiver, options)
    let logEvent = log.logs[0]
    if (ABroker.isDidOpenEvent(logEvent)) {
      return logEvent.args.channelId
    } else {
      return Promise.reject(log.receipt)
    }
  }

  async function readChannel (instance: ABroker.Contract, channelId: string): Promise<PaymentChannel> {
    let [sender, receiver, value, state] = await instance.channels(channelId)
    return { sender, receiver, value, state }
  }

  async function paymentDigest (address: string, channelId: string, payment: BigNumber): Promise<string> {
    let chainId = await getNetwork(web3)
    let hash = abi.soliditySHA3(
      ['address', 'uint32', 'bytes32', 'uint256'],
      [address, chainId, channelId, payment.toString()]
    )
    return util.bufferToHex(hash)
  }

  async function signatureDigest (address: string, channelId: string, payment: BigNumber): Promise<string> {
    let digest = await paymentDigest(address, channelId, payment)
    let prefix = Buffer.from("\x19Ethereum Signed Message:\n32")
    let hash = abi.soliditySHA3(
      ['bytes', 'bytes32'],
      [prefix, digest]
    )
    return util.bufferToHex(hash)
  }

  async function sign (origin: string, instance: ABroker.Contract, channelId: string, payment: BigNumber): Promise<string> {
    let digest = await paymentDigest(instance.address, channelId, payment)
    return new Promise<string>((resolve, reject) => {
      web3.eth.sign(origin, digest, (error, signature) => {
        if (error) {
          reject(error)
        } else {
          resolve(signature)
        }
      })
    })
  }

  describe('unidirectional channel', () => {
    describe('sender:createChannel', () => {
      specify('emit DidOpen event', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)
        assert.typeOf(channelId, 'string')
      })

      specify('increase contract balance', async () => {
        let instance = await deployed()
        let startBalance = web3.eth.getBalance(instance.address)
        await createChannel(instance)
        let endBalance = web3.eth.getBalance(instance.address)
        assert.deepEqual(endBalance, startBalance.plus(delta))
      })

      specify('set channel parameters', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)
        let channel = await readChannel(instance, channelId)
        assert.equal(channel.sender, sender)
        assert.equal(channel.receiver, receiver)
        assert(channel.value.eq(delta))
        assert(channel.state.eq(PaymentChannelState.OPEN))
      })
    })

    describe('sender:createChannel -> canClaim', () => {
      specify('return true', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)

        let signature = await sign(sender, instance, channelId, delta)
        let canClaim = await instance.canClaim(channelId, delta, receiver, signature)
        assert.isTrue(canClaim)
      })

      specify('not if missing channel', async () => {
        let instance = await deployed()
        let channelId = '0xdeadbeaf'
        let payment = new BigNumber(10)

        let signature = await sign(sender, instance, channelId, payment)
        let canClaim = await instance.canClaim(channelId, payment, receiver, signature)
        assert.isFalse(canClaim)
      })

      specify('not if not receiver', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)
        let payment = new BigNumber(10)

        let signature = await sign(sender, instance, channelId, payment)
        let canClaim = await instance.canClaim(channelId, payment, sender, signature)
        assert.isFalse(canClaim)
      })

      specify('not if not signed by sender', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)
        let payment = new BigNumber(10)

        let signature = await sign(receiver, instance, channelId, payment)
        let canClaim = await instance.canClaim(channelId, payment, receiver, signature)
        assert.isFalse(canClaim)
      })
    })

    describe('sender:createChannel -> claim', () => {
      let payment = new BigNumber(web3.toWei('0.1', 'ether'))

      specify('emit DidClaim event', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)

        let signature = await sign(sender, instance, channelId, payment)
        let tx = await instance.claim(channelId, payment, signature, {from: receiver})
        gasoline.add('emit DidClaim event', 'claim', tx)
        assert.isTrue(ABroker.isDidClaimEvent(tx.logs[0]))
      })

      specify('move payment to receiver balance', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)

        let startBalance = web3.eth.getBalance(receiver)

        let signature = await sign(sender, instance, channelId, payment)
        let tx = await instance.claim(channelId, payment, signature, {from: receiver})
        gasoline.add('move payment to receiver balance', 'claim', tx)

        let endBalance = web3.eth.getBalance(receiver)

        let callCost = await transactionPrice(tx)
        assert.isTrue(endBalance.minus(startBalance).eq(payment.minus(callCost)))
      })

      specify('move change to sender balance', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)

        let channelValue = (await readChannel(instance, channelId)).value
        let change = channelValue.minus(payment)

        let startBalance = web3.eth.getBalance(sender)

        let signature = await sign(sender, instance, channelId, payment)
        let tx = await instance.claim(channelId, payment, signature, {from: receiver})
        gasoline.add('move change to sender balance', 'claim', tx)

        let endBalance = web3.eth.getBalance(sender)
        assert.isTrue(endBalance.minus(startBalance).eq(change))
      })

      specify('delete channel', async () => {
        let instance = await deployed()
        let channelId = await createChannel(instance)

        let signature = await sign(sender, instance, channelId, payment)
        let tx = await instance.claim(channelId, payment, signature, {from: receiver})
        gasoline.add('delete channel', 'claim', tx)

        let channel = await readChannel(instance, channelId)
        assert.equal(channel.sender, '0x0000000000000000000000000000000000000000')
        assert.equal(channel.receiver, '0x0000000000000000000000000000000000000000')
        assert.isFalse(await instance.isPresent(channelId))
      })

      context('payment > channel.value', () => {
        specify('move channel value to receiver balance', async () => {
          let instance = await deployed()
          let channelId = await createChannel(instance)
          let payment = new BigNumber(web3.toWei('10', 'ether'))
          let signature = await sign(sender, instance, channelId, payment)

          let startBalance = web3.eth.getBalance(receiver)
          let tx = await instance.claim(channelId, payment, signature, {from: receiver})
          let endBalance = web3.eth.getBalance(receiver)
          let callCost = await transactionPrice(tx)
          assert.isTrue(endBalance.eq(startBalance.plus(delta).minus(callCost)))
        })
      })
    })
  })

  describe('paymentDigest', () => {
    specify('return hash of the payment', async () => {
      let instance = await deployed()
      let channelId = '0xdeadbeaf'
      let payment = new BigNumber(10)
      let digest = await instance.paymentDigest(channelId, payment)
      let expected = await paymentDigest(instance.address, channelId, payment)
      assert.equal(digest, expected)
    })
  })

  describe('signatureDigest', () => {
    specify('return prefixed hash to be signed', async () => {
      let instance = await deployed()
      let channelId = '0xdeadbeaf'
      let payment = new BigNumber(10)
      let digest = await instance.signatureDigest(channelId, payment)
      let expected = await signatureDigest(instance.address, channelId, payment)
      assert.equal(digest, expected)
    })
  })
})
