import * as Web3 from 'web3'
import * as BigNumber from 'bignumber.js'

import { Broker } from '../src/index'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as S from './support/BrokerScaffold'
import PaymentsTree, {KnownPaymentLeaf} from "./support/PaymentsTree";
import {randomPreimage} from "./support/BrokerScaffold";
import Address from "./support/Address";
import {GAS_PRICE} from "./support";

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3

const BrokerContract = artifacts.require<Broker.Contract>('Broker.sol')

contract('Unidirectional Scenario', accounts => {
  let instance: Broker.Contract
  let s: S.BrokerScaffold

  before(async () => {
    if (!instance) {
      instance = await BrokerContract.deployed()
      s = new S.BrokerScaffold({
        instance: instance,
        web3: web3,
        sender: accounts[0],
        receiver: accounts[1],
        alien: accounts[2],
        channelValue: new BigNumber.BigNumber(web3.toWei(1, 'ether'))
      })
    }
  })

  async function withdraw(channelId: string, tree: PaymentsTree, payment: KnownPaymentLeaf, origin: Address) {
    let proof = tree.proof(payment)
    return instance.withdraw(channelId, proof, payment.preimage, payment.amount, { from: origin })
  }

  // 1. Sender opens a 1ETH channel to a receiver.
  // 2. Sender sends 0.1 ETH to the receiver.
  // 3. Receiver and sender agree on closing the channel. Sender initiates that.
  // ===
  // Receiver gets 0.1 ETH (minus fees).
  // Sender gets 0.9 ETH (minus fees).
  specify('happy case, all by sender', async () => {
    // 1. Sender opens a 1ETH channel to a receiver.
    let channelId = await s.openChannel({ value: s.channelValue, sender: s.sender })

    // 2. Sender sends 0.1 ETH to the receiver.
    let tree = new PaymentsTree(instance.address, channelId)
    let payments = [0.1, -0.9]
    payments.forEach(number => {
      let amount = new BigNumber.BigNumber(web3.toWei(number, 'ether'))
      tree.addPayment(amount, randomPreimage())
    })

    // 3. Receiver and sender agree on closing the channel.
    let settleUpdate = await s.nextSettleUpdate(channelId, tree.root)

    let receiverA = web3.eth.getBalance(s.receiver)
    let senderA = web3.eth.getBalance(s.sender)

    // Sender initiates that.
    let settleTx = await s.settle(settleUpdate, s.sender)
    let settleTxCost = GAS_PRICE.mul(settleTx.receipt.gasUsed)

    // Sender pushes withdrawal to the receiver
    let towardsReceiver = tree.elements[0] as KnownPaymentLeaf
    let withdrawTx = await withdraw(channelId, tree, towardsReceiver, s.sender)
    let withdrawTxCost = GAS_PRICE.mul(withdrawTx.receipt.gasUsed)

    let receiverB = web3.eth.getBalance(s.receiver)
    let receiverDelta = receiverB.minus(receiverA)
    assert.equal(receiverDelta.toString(), towardsReceiver.amount.toString(), 'Receiver gets her money')

    // Sender pushes withdrawal to the sender
    let towardsSender = tree.elements[1] as KnownPaymentLeaf
    let secondWithdrawTx = await withdraw(channelId, tree, towardsSender, s.sender)
    let secondWithdrawTxCost = GAS_PRICE.mul(secondWithdrawTx.receipt.gasUsed)

    let senderD = web3.eth.getBalance(s.sender)

    // Sender gets his money

    let senderTxCost = settleTxCost.plus(withdrawTxCost).plus(secondWithdrawTxCost)
    let expectedSender = senderA.plus(towardsSender.amount.mul(-1)).minus(senderTxCost)
    assert.equal(senderD.toString(), expectedSender.toString(), 'Sender gets her money')
  })

  // 1. Sender opens a 1ETH channel to a receiver.
  // 2. Sender sends 0.1 ETH to the receiver.
  // 3. Receiver and sender agree on closing the channel. Receiver initiates that.
  // ===
  // Receiver gets 0.1 ETH (minus fees).
  // Sender gets 0.9 ETH (minus fees).
  specify('happy case, settle by receiver', async () => {
    // 1. Sender opens a 1ETH channel to a receiver.
    let channelId = await s.openChannel({ value: s.channelValue, sender: s.sender })

    // 2. Sender sends 0.1 ETH to the receiver.
    let tree = new PaymentsTree(instance.address, channelId)
    let payments = [0.1, -0.9]
    payments.forEach(number => {
      let amount = new BigNumber.BigNumber(web3.toWei(number, 'ether'))
      tree.addPayment(amount, randomPreimage())
    })

    // 3. Receiver and sender agree on closing the channel.
    let settleUpdate = await s.nextSettleUpdate(channelId, tree.root)

    let receiverA = web3.eth.getBalance(s.receiver)
    let senderA = web3.eth.getBalance(s.sender)

    // Sender initiates that.
    let settleTx = await s.settle(settleUpdate, s.receiver)
    let settleTxCost = GAS_PRICE.mul(settleTx.receipt.gasUsed)

    // Sender pushes withdrawal to the receiver
    let towardsReceiver = tree.elements[0] as KnownPaymentLeaf
    let withdrawTx = await withdraw(channelId, tree, towardsReceiver, s.sender)
    let withdrawTxCost = GAS_PRICE.mul(withdrawTx.receipt.gasUsed)

    let receiverB = web3.eth.getBalance(s.receiver)
    let actualReceiverDelta = receiverB.minus(receiverA)
    let expectedReceiverDelta = towardsReceiver.amount.minus(settleTxCost)
    assert.equal(actualReceiverDelta.toString(), expectedReceiverDelta.toString(), 'Receiver gets her money')

    // Sender pushes withdrawal to the sender
    let towardsSender = tree.elements[1] as KnownPaymentLeaf
    let secondWithdrawTx = await withdraw(channelId, tree, towardsSender, s.sender)
    let secondWithdrawTxCost = GAS_PRICE.mul(secondWithdrawTx.receipt.gasUsed)

    let senderD = web3.eth.getBalance(s.sender)

    // Sender gets his money
    let senderTxCost = withdrawTxCost.plus(secondWithdrawTxCost)
    let expectedSender = senderA.plus(towardsSender.amount.mul(-1)).minus(senderTxCost)
    assert.equal(senderD.toString(), expectedSender.toString(), 'Sender gets her money')
  })
})
