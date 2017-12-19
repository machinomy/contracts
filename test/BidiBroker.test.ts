import * as Web3 from 'web3'
import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import {BidiBroker, bidiPaymentDigest, sign} from '../index'
import BigNumber from 'bignumber.js'
import { getNetwork } from './support'
import has = Reflect.has;

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3;

contract('BidiBroker', accounts => {
  const sender = accounts[0]
  const receiver = accounts[1]
  const contract = artifacts.require<BidiBroker.Contract>("BidiBroker.sol")
  const delta = web3.toWei(1, 'ether')

  const createChannel = async (instance: BidiBroker.Contract) => {
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

    specify('not if absent', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      let canSenderDeposit = await instance.canSenderDeposit(channelId, sender)
      assert.isFalse(canSenderDeposit)
    })
  })

  describe('senderDeposit', () => {
    specify('if channel is open and is sender', async () => {
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

    specify('not if absent', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      return assert.isRejected(instance.senderDeposit(channelId, {from: sender, value: delta}))
    })
  })

  describe('receiverDeposit', () => {
    specify('if channel is open and is sender', async () => {
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

  describe('recoverSigner', () => {
    specify('recovers address', async () => {
      let instance = await contract.deployed()
      let channelId = '0xdeadbeaf'
      let nonce = 10
      let payment = new BigNumber(10000)
      let address = instance.address
      let chainId = await getNetwork(web3)
      let hash = bidiPaymentDigest(channelId, nonce, payment, address, chainId)
      let signature = web3.eth.sign(sender, hash)
      let signatory = await instance.signatory(channelId, nonce, payment, signature)
      assert.equal(signatory, sender)
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
