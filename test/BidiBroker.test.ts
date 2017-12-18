import * as Web3 from 'web3'
import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import { BidiBroker } from '../src'
import BigNumber from "bignumber.js";
import {getNetwork} from "./support";

chai.use(asPromised)

const expect = chai.expect

const web3 = (global as any).web3 as Web3

contract('BidiBroker', accounts => {
  const sender = accounts[0]
  const receiver = accounts[1]
  const contract = BidiBroker.contract(web3.currentProvider, { from: sender, gas: 200000 })
  const delta = web3.toWei(1, 'ether')

  const createChannel = async (instance: BidiBroker.Contract) => {
    let options = { value: delta, from: sender }
    const log = await instance.createChannel(receiver, new BigNumber(100), new BigNumber(1), options)
    return log.logs[0]
  }

  let _instance: BidiBroker.Contract | null = null
  const contractDeployed = async () => {
    if (_instance) {
      return _instance
    } else {
      let networkId = await getNetwork(web3)
      _instance = await contract.new(networkId, {gas: 2000000})
      return _instance
    }
  }

  it('create channel', async () => {
    let instance = await contractDeployed()
    let startBalance = web3.eth.getBalance(instance.address)
    let event = await createChannel(instance)
    expect(event.event).to.equal('DidCreateChannel')
    expect(event.args.channelId).to.be.a('string')
    const endBalance = web3.eth.getBalance(instance.address)
    expect(endBalance).to.deep.equal(startBalance.plus(delta))
  })

  describe('deposit by sender', () => {
    it('increase contract balance', async () => {
      let instance = await contractDeployed()
      const event = await createChannel(instance)

      let startBalance = web3.eth.getBalance(instance.address)

      const channelId = event.args.channelId
      const logDeposit = await instance.deposit(channelId, {from: sender, value: delta})

      const endBalance = web3.eth.getBalance(instance.address)

      expect(logDeposit.logs[0].event).to.equal('DidDeposit')
      expect(endBalance).to.deep.equal(startBalance.plus(delta))
    })

    it('increase senderDeposit', async () => {
      let instance = await contractDeployed()
      const event = await createChannel(instance)

      const channelId = event.args.channelId
      const startSenderDeposit = (await instance.channels(channelId))[2]

      const logDeposit = await instance.deposit(channelId, {from: sender, value: delta})

      const endSenderDeposit = (await instance.channels(channelId))[2]

      expect(logDeposit.logs[0].event).to.equal('DidDeposit')
      expect(endSenderDeposit).to.deep.equal(startSenderDeposit.plus(delta))
    })

    it('not change receiverDeposit', async () => {
      let instance = await contractDeployed()
      const event = await createChannel(instance)

      const channelId = event.args.channelId
      const startReceiverDeposit = (await instance.channels(channelId))[3]

      const logDeposit = await instance.deposit(channelId, {from: sender, value: delta})

      const endReceiverDeposit = (await instance.channels(channelId))[3]

      expect(logDeposit.logs[0].event).to.equal('DidDeposit')
      expect(endReceiverDeposit).to.deep.equal(startReceiverDeposit)
    })
  })

  describe('deposit by receiver', () => {
    it('increase contract balance', async () => {
      let instance = await contractDeployed()
      const event = await createChannel(instance)

      let startBalance = web3.eth.getBalance(instance.address)

      const channelId = event.args.channelId
      const logDeposit = await instance.deposit(channelId, {from: receiver, value: delta})

      const endBalance = web3.eth.getBalance(instance.address)

      expect(logDeposit.logs[0].event).to.equal('DidDeposit')
      expect(endBalance).to.deep.equal(startBalance.plus(delta))
    })

    it('increase receiverDeposit', async () => {
      let instance = await contractDeployed()
      const event = await createChannel(instance)

      const channelId = event.args.channelId
      const startReceiverDeposit = (await instance.channels(channelId))[3]

      const logDeposit = await instance.deposit(channelId, {from: receiver, value: delta})

      const endReceiverDeposit = (await instance.channels(channelId))[3]

      expect(logDeposit.logs[0].event).to.equal('DidDeposit')
      expect(endReceiverDeposit).to.deep.equal(startReceiverDeposit.plus(delta))
    })

    it('not change senderDeposit', async () => {
      let instance = await contractDeployed()
      const event = await createChannel(instance)

      const channelId = event.args.channelId
      const startSenderDeposit = (await instance.channels(channelId))[2]

      const logDeposit = await instance.deposit(channelId, {from: receiver, value: delta})

      const endSenderDeposit = (await instance.channels(channelId))[2]

      expect(logDeposit.logs[0].event).to.equal('DidDeposit')
      expect(endSenderDeposit).to.deep.equal(startSenderDeposit)
    })
  })
})
