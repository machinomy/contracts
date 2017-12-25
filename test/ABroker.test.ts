import * as Web3 from 'web3'
import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import {ABroker, bidiPaymentDigest, sign} from '../src/index'
import BigNumber from 'bignumber.js'
import { getNetwork } from './support'

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3

contract('BidiBroker', accounts => {
  const sender = accounts[0]
  const receiver = accounts[1]
  const contract = artifacts.require<ABroker.Contract>("BidiBroker.sol")
  const delta = web3.toWei(1, 'ether')

  const createSignature = async (channelId: string, nonce: number, _payment: number|BigNumber, signatory: string): Promise<string> => {
    let instance = await contract.deployed()
    let payment = new BigNumber(_payment)
    let address = instance.address
    let chainId = await getNetwork(web3)
    let hash = bidiPaymentDigest(channelId, nonce, payment, address, chainId)
    return web3.eth.sign(signatory, hash)
  }

  const createChannel = async (instance: ABroker.Contract) => {
    let options = { value: delta, from: sender }
    const log = await instance.createChannel(receiver, new BigNumber(100), new BigNumber(0), options)
    return log.logs[0]
  }

  describe('createChannel', () => {
    specify('create channel', async () => {
      let instance = await contract.deployed()
      let startBalance = web3.eth.getBalance(instance.address)
      let event = await createChannel(instance)
      chai.assert.equal(event.event, 'DidCreateChannel')
      assert.typeOf(event.args.channelId, 'string')
      const endBalance = web3.eth.getBalance(instance.address)
      assert.deepEqual(endBalance, startBalance.plus(delta))
    })
  })

  describe('canSenderDeposit', () => {
    specify('if channel is open and is sender', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId
      let canSenderDeposit = await instance.canSenderDeposit(channelId, sender)
      assert.isTrue(canSenderDeposit)
    })

    specify('not if an alien', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId
      let canSenderDeposit = await instance.canSenderDeposit(channelId, receiver)
      assert.isFalse(canSenderDeposit)
    })

    specify('not if settling')

    specify('not if absent channel', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      let canSenderDeposit = await instance.canSenderDeposit(channelId, sender)
      assert.isFalse(canSenderDeposit)
    })
  })

  describe('senderDeposit', () => {
    specify('add to sender deposit', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId
      let before = web3.eth.getBalance(instance.address)
      await instance.senderDeposit(channelId, {from: sender, value: delta})
      let after = web3.eth.getBalance(instance.address)
      assert.deepEqual(after, before.plus(delta))
    })

    specify('not if an alien', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId
      return assert.isRejected(instance.senderDeposit(channelId, {from: receiver, value: delta}))
    })

    specify('not if settling')

    specify('not if channel absent', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      return assert.isRejected(instance.senderDeposit(channelId, {from: sender, value: delta}))
    })
  })

  describe('receiverDeposit', () => {
    specify('add to receiver deposit', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId
      let before = web3.eth.getBalance(instance.address)
      await instance.receiverDeposit(channelId, {from: receiver, value: delta})
      let after = web3.eth.getBalance(instance.address)
      assert.deepEqual(after, before.plus(delta))
    })

    specify('not if an alien', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId
      return assert.isRejected(instance.receiverDeposit(channelId, {from: sender, value: delta}))
    })

    specify('not if settling')

    specify('not if absent', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      return assert.isRejected(instance.receiverDeposit(channelId, {from: receiver, value: delta}))
    })
  })

  describe('signatory', () => {
    specify('recover address', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      let nonce = 10
      let payment = new BigNumber(10000)

      let signature = await createSignature(channelId, nonce, payment, sender)
      let signatory = await instance.signatory(channelId, nonce, payment, signature)
      assert.equal(signatory, sender)
    })
  })

  describe('receiverUpdateBalance', () => {
    let nonce = 10
    let payment = new BigNumber(10000)

    specify('update balance to receiver', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId

      let signature = await createSignature(channelId, nonce, payment, sender)
      let before = (await instance.balances(channelId))[2]
      await assert.isFulfilled(instance.receiverUpdateBalance(channelId, nonce, payment, signature, {from: receiver}))
      let after = (await instance.balances(channelId))[2]
      assert.deepEqual(after, before.add(payment))
    })

    specify('not if alien', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId

      let signature = await createSignature(channelId, nonce, payment, sender)
      return assert.isRejected(instance.receiverUpdateBalance(channelId, nonce, payment, signature, {from: sender}))
    })

    specify('not if absent', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      let signature = await createSignature(channelId, nonce, payment, sender)
      return assert.isRejected(instance.receiverUpdateBalance(channelId, nonce, payment, signature, {from: receiver}))
    })
  })

  describe('senderUpdateBalance', () => {
    let nonce = 10
    let payment = new BigNumber(10000)

    specify('update balance to receiver', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId

      let signature = await createSignature(channelId, nonce, payment, receiver)
      let before = (await instance.balances(channelId))[1]
      await assert.isFulfilled(instance.senderUpdateBalance(channelId, nonce, payment, signature, {from: sender}))
      let after = (await instance.balances(channelId))[1]
      assert.deepEqual(after, before.add(payment))
    })

    specify('not if alien', async () => {
      let instance = await contract.deployed()
      let event = await createChannel(instance)
      let channelId = event.args.channelId

      let signature = await createSignature(channelId, nonce, payment, receiver)
      return assert.isRejected(instance.receiverUpdateBalance(channelId, nonce, payment, signature, {from: receiver}))
    })

    specify('not if absent', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      let signature = await createSignature(channelId, nonce, payment, receiver)
      return assert.isRejected(instance.receiverUpdateBalance(channelId, nonce, payment, signature, {from: sender}))
    })
  })



  // -------------------------------------------------- //

  /*
  describe('claim', () => {
    describe('by sender first', () => {
      it('set state to Settling', async () => {
        let instance = await contract.deployed()
        const event = await createChannel(instance)

        let startBalance = web3.eth.getBalance(instance.address)

        const channelId = event.args.channelId
        const logDeposit = await instance.deposit(channelId, {from: sender, value: delta})

        const endBalance = web3.eth.getBalance(instance.address)

        expect(logDeposit.logs[0].event).to.equal('DidDeposit')
        expect(endBalance).to.deep.equal(startBalance.plus(delta))
      })
    })
  })
  */
})
