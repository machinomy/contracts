import * as Web3 from 'web3'
import BigNumber from 'bignumber.js'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as abi from 'ethereumjs-abi'
import * as util from 'ethereumjs-util'

import { ABroker } from '../src/index'
import { Gasoline, getBlock, getNetwork, transactionPrice } from './support'
import ECRecovery from '../build/wrappers/ECRecovery'

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3
const gasoline = new Gasoline(true)

interface PaymentChannel {
  sender: string
  receiver: string
  value: BigNumber
  settlingPeriod: BigNumber
  settlingUntil: BigNumber
}

async function chainId(broker: ABroker.Contract): Promise<number> {
  return broker.chainId().then(n => n.toNumber())
}

contract('ABroker', accounts => {
  let sender = accounts[0]
  let receiver = accounts[1]
  let alien = accounts[2]
  let channelValue = new BigNumber(web3.toWei(1, 'ether'))

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

  async function openChannel (instance: ABroker.Contract, settlingPeriod?: number|BigNumber): Promise<string> {
    let options = { value: channelValue, from: sender }
    let log = await instance.open(receiver, settlingPeriod || 0, options)
    let logEvent = log.logs[0]
    if (ABroker.isDidOpenEvent(logEvent)) {
      return logEvent.args.channelId
    } else {
      return Promise.reject(log.receipt)
    }
  }

  async function readChannel (instance: ABroker.Contract, channelId: string): Promise<PaymentChannel> {
    let [sender, receiver, value, settlingPeriod, settlingUntil] = await instance.channels(channelId)
    return { sender, receiver, value, settlingPeriod, settlingUntil }
  }

  async function paymentDigest (address: string, channelId: string, payment: BigNumber): Promise<string> {
    let hash = abi.soliditySHA3(
      ['address', 'uint32', 'bytes32', 'uint256'],
      [address, await chainId(instance), channelId, payment.toString()]
    )
    return util.bufferToHex(hash)
  }

  async function signatureDigest (address: string, channelId: string, payment: BigNumber): Promise<string> {
    let digest = await paymentDigest(address, channelId, payment)
    let prefix = Buffer.from('\x19Ethereum Signed Message:\n32')
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

  let instance: ABroker.Contract

  before(async () => {
    instance = await deployed()
  })

  describe('open', () => {
    specify('emit DidOpen event', async () => {
      let channelId = await openChannel(instance)
      assert.typeOf(channelId, 'string')
    })

    specify('increase contract balance', async () => {
      let startBalance = web3.eth.getBalance(instance.address)
      await openChannel(instance)
      let endBalance = web3.eth.getBalance(instance.address)
      assert.deepEqual(endBalance, startBalance.plus(channelValue))
    })

    specify('set channel parameters', async () => {
      let channelId = await openChannel(instance)
      let channel = await readChannel(instance, channelId)
      assert.equal(channel.sender, sender)
      assert.equal(channel.receiver, receiver)
      assert.equal(channel.value.toString(), channelValue.toString())
      assert.isTrue(await instance.isOpen(channelId))
    })
  })

  describe('canDeposit', () => {
    specify('ok', async () => {
      let channelId = await openChannel(instance)
      assert.isTrue(await instance.canDeposit(channelId, sender))
    })

    specify('not if not sender', async () => {
      let channelId = await openChannel(instance)
      assert.isFalse(await instance.canDeposit(channelId, receiver))
    })

    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      assert.isFalse(await instance.canDeposit(channelId, sender))
    })

    specify('not if settling', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      assert.isFalse(await instance.canDeposit(channelId, sender))
    })
  })

  describe('deposit', () => {
    specify('increase channel value', async () => {
      let channelId = await openChannel(instance)
      let balanceBefore = (await readChannel(instance, channelId)).value
      await instance.deposit(channelId, {value: channelValue, from: sender})
      let balanceAfter = (await readChannel(instance, channelId)).value
      assert.equal(balanceAfter.toString(), balanceBefore.plus(channelValue).toString())
    })

    specify('increase contract balance', async () => {
      let channelId = await openChannel(instance)
      let balanceBefore = web3.eth.getBalance(instance.address)
      await instance.deposit(channelId, {value: channelValue, from: sender})
      let balanceAfter = web3.eth.getBalance(instance.address)
      assert.equal(balanceAfter.toString(), balanceBefore.plus(channelValue).toString())
    })

    specify('emit DidDeposit event', async () => {
      let channelId = await openChannel(instance)
      let tx = await instance.deposit(channelId, {value: channelValue, from: sender})
      assert.equal(tx.logs[0].event, 'DidDeposit')
    })

    specify('not if not sender', async () => {
      let channelId = await openChannel(instance)
      return assert.isRejected(instance.deposit(channelId, {value: channelValue, from: receiver}))
    })

    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      return assert.isRejected(instance.deposit(channelId, {value: channelValue, from: sender}))
    })

    specify('not if settling', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      return assert.isRejected(instance.deposit(channelId, {value: channelValue, from: sender}))
    })
  })

  describe('canClaim', () => {
    specify('return true', async () => {
      let channelId = await openChannel(instance)

      let signature = await sign(sender, instance, channelId, channelValue)
      let canClaim = await instance.canClaim(channelId, channelValue, receiver, signature)
      assert.isTrue(canClaim)
    })

    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      let payment = new BigNumber(10)

      let signature = await sign(sender, instance, channelId, payment)
      let canClaim = await instance.canClaim(channelId, payment, receiver, signature)
      assert.isFalse(canClaim)
    })

    specify('not if not receiver', async () => {
      let channelId = await openChannel(instance)
      let payment = new BigNumber(10)

      let signature = await sign(sender, instance, channelId, payment)
      let canClaim = await instance.canClaim(channelId, payment, sender, signature)
      assert.isFalse(canClaim)
    })

    specify('not if not signed by sender', async () => {
      let channelId = await openChannel(instance)
      let payment = new BigNumber(10)

      let signature = await sign(receiver, instance, channelId, payment)
      let canClaim = await instance.canClaim(channelId, payment, receiver, signature)
      assert.isFalse(canClaim)
    })
  })

  describe('claim', () => {
    let payment = new BigNumber(web3.toWei('0.1', 'ether'))

    specify('emit DidClaim event', async () => {
      let channelId = await openChannel(instance)

      let signature = await sign(sender, instance, channelId, payment)
      let tx = await instance.claim(channelId, payment, signature, {from: receiver})
      gasoline.add('emit DidClaim event', 'claim', tx)
      assert.isTrue(ABroker.isDidClaimEvent(tx.logs[0]))
    })

    specify('move payment to receiver balance', async () => {
      let channelId = await openChannel(instance)

      let startBalance = web3.eth.getBalance(receiver)

      let signature = await sign(sender, instance, channelId, payment)
      let tx = await instance.claim(channelId, payment, signature, {from: receiver})
      gasoline.add('move payment to receiver balance', 'claim', tx)

      let endBalance = web3.eth.getBalance(receiver)

      let callCost = await transactionPrice(tx)
      assert.isTrue(endBalance.minus(startBalance).eq(payment.minus(callCost)))
    })

    specify('move change to sender balance', async () => {
      let channelId = await openChannel(instance)

      let channelValue = (await readChannel(instance, channelId)).value
      let change = channelValue.minus(payment)

      let startBalance = web3.eth.getBalance(sender)

      let signature = await sign(sender, instance, channelId, payment)
      let tx = await instance.claim(channelId, payment, signature, {from: receiver})
      gasoline.add('move change to sender balance', 'claim', tx)

      let endBalance = web3.eth.getBalance(sender)
      assert.isTrue(endBalance.minus(startBalance).eq(change))
    })

    specify('delete PaymentChannel', async () => {
      let channelId = await openChannel(instance)

      let signature = await sign(sender, instance, channelId, payment)
      let tx = await instance.claim(channelId, payment, signature, {from: receiver})
      gasoline.add('delete PaymentChannel', 'claim', tx)

      let channel = await readChannel(instance, channelId)
      assert.equal(channel.sender, '0x0000000000000000000000000000000000000000')
      assert.equal(channel.receiver, '0x0000000000000000000000000000000000000000')
      assert.isFalse(await instance.isPresent(channelId))
    })

    specify('delete Settling', async () => {
      let channelId = await openChannel(instance)

      let signature = await sign(sender, instance, channelId, payment)
      await instance.startSettling(channelId, {from: sender})
      let tx = await instance.claim(channelId, payment, signature, {from: receiver})
      gasoline.add('delete Settling', 'claim', tx)

      let channel = await readChannel(instance, channelId)
      assert.equal(channel.settlingUntil.toNumber(), 0)
      assert.isFalse(await instance.isSettling(channelId))
    })


    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      let payment = new BigNumber(10)

      let signature = await sign(sender, instance, channelId, payment)
      return assert.isRejected(instance.claim(channelId, payment, signature, {from: receiver}))
    })

    specify('not if not receiver', async () => {
      let channelId = await openChannel(instance)
      let payment = new BigNumber(10)

      let signature = await sign(sender, instance, channelId, payment)
      return assert.isRejected(instance.claim(channelId, payment, signature, {from: sender}))
    })

    specify('not if not signed by sender', async () => {
      let channelId = await openChannel(instance)
      let payment = new BigNumber(10)

      let signature = await sign(receiver, instance, channelId, payment)
      return assert.isRejected(instance.claim(channelId, payment, signature, {from: receiver}))
    })

    context('payment > channel.value', () => {
      specify('move channel value to receiver balance', async () => {
        let channelId = await openChannel(instance)
        let payment = new BigNumber(web3.toWei('10', 'ether'))
        let signature = await sign(sender, instance, channelId, payment)

        let startBalance = web3.eth.getBalance(receiver)
        let tx = await instance.claim(channelId, payment, signature, {from: receiver})
        let endBalance = web3.eth.getBalance(receiver)
        let callCost = await transactionPrice(tx)
        assert.isTrue(endBalance.eq(startBalance.plus(channelValue).minus(callCost)))
      })
    })
  })

  describe('canStartSettling', () => {
    specify('ok', async () => {
      let channelId = await openChannel(instance)
      let canStartSettling = await instance.canStartSettling(channelId, sender)
      assert.isTrue(canStartSettling)
    })

    specify('not if receiver', async () => {
      let channelId = await openChannel(instance)
      let canStartSettling = await instance.canStartSettling(channelId, receiver)
      assert.isFalse(canStartSettling)
    })

    specify('not if alien', async () => {
      let channelId = await openChannel(instance)
      let canStartSettling = await instance.canStartSettling(channelId, alien)
      assert.isFalse(canStartSettling)
    })

    specify('not if no channel', async () => {
      let channelId = '0xdeadbeaf'
      let canStartSettling = await instance.canStartSettling(channelId, receiver)
      assert.isFalse(canStartSettling)
    })

    specify('not if settling', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      let canStartSettling = await instance.canStartSettling(channelId, sender)
      assert.isFalse(canStartSettling)
    })
  })

  describe('startSettling', () => {
    specify('change state to Settling', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      assert.isTrue(await instance.isSettling(channelId))
    })

    specify('emit DidStartSettling event', async () => {
      let channelId = await openChannel(instance)
      let tx = await instance.startSettling(channelId, {from: sender})
      assert.isTrue(ABroker.isDidStartSettlingEvent(tx.logs[0]))
    })

    specify('create Settling entry', async () => {
      let settlingPeriod = 10
      let channelId = await openChannel(instance, settlingPeriod)
      let tx = await instance.startSettling(channelId, {from: sender})
      let blockNumber = tx.receipt.blockNumber
      let channel = await readChannel(instance, channelId)
      assert.equal(channel.settlingUntil.toNumber(), settlingPeriod + blockNumber)
    })

    specify('not if sender', async () => {
      let channelId = await openChannel(instance)
      return assert.isRejected(instance.startSettling(channelId, {from: receiver}))
    })

    specify('not if alien', async () => {
      let channelId = await openChannel(instance)
      return assert.isRejected(instance.startSettling(channelId, {from: alien}))
    })

    specify('not if no channel', async () => {
      let channelId = '0xdeadbeaf'
      return assert.isRejected(instance.startSettling(channelId, {from: alien}))
    })

    specify('not if settling', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      assert.isTrue(await instance.isSettling(channelId))
      return assert.isRejected(instance.startSettling(channelId, {from: sender}))
    })
  })

  describe('canSettle', () => {
    specify('ok', async () => {
      let channelId = await openChannel(instance, 0)
      await instance.startSettling(channelId, {from: sender})
      let canSettle = await instance.canSettle(channelId, sender)
      assert.isTrue(canSettle)
    })

    specify('not if receiver', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      let canSettle = await instance.canSettle(channelId, receiver)
      assert.isFalse(canSettle)
    })

    specify('not if alien', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      let canSettle = await instance.canSettle(channelId, alien)
      assert.isFalse(canSettle)
    })

    specify('not if no channel', async () => {
      let channelId = '0xdeadbeaf'
      let canSettle = await instance.canSettle(channelId, sender)
      assert.isFalse(canSettle)
    })

    specify('not if open', async () => {
      let channelId = await openChannel(instance)
      let canSettle = await instance.canSettle(channelId, sender)
      assert.isFalse(canSettle)
    })

    specify('not until settling period is over', async () => {
      let channelId = await openChannel(instance, 2)
      await instance.startSettling(channelId, {from: sender})
      let canSettle = await instance.canSettle(channelId, sender)
      let channel = await readChannel(instance, channelId)
      let blockNumber = (await getBlock(web3, 'latest')).number
      assert.isNotNull(blockNumber)
      assert.isTrue(channel.settlingUntil.toNumber() > blockNumber!)
      assert.isFalse(canSettle)
    })
  })

  describe('settle', () => {
    specify('move channel value to sender', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      let startBalance = web3.eth.getBalance(sender)
      let tx = await instance.settle(channelId, {from: sender})
      let endBalance = web3.eth.getBalance(sender)
      let callCost = await transactionPrice(tx)

      assert.equal(endBalance.minus(startBalance).toString(), channelValue.minus(callCost).toString())
    })

    specify('emit DidSettle event', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      let tx = await instance.settle(channelId, {from: sender})
      assert.isTrue(ABroker.isDidSettleEvent(tx.logs[0]))
    })

    specify('delete PaymentChannel', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      await instance.settle(channelId, {from: sender})
      assert.isFalse(await instance.isPresent(channelId))
    })

    specify('delete Settling', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      await instance.settle(channelId, {from: sender})
      let channel = await readChannel(instance, channelId)
      assert.equal(channel.settlingUntil.toNumber(), 0)
    })

    specify('not if receiver', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      return assert.isRejected(instance.settle(channelId, {from: receiver}))
    })

    specify('not if alien', async () => {
      let channelId = await openChannel(instance)
      await instance.startSettling(channelId, {from: sender})
      return assert.isRejected(instance.settle(channelId, {from: alien}))
    })

    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      return assert.isRejected(instance.settle(channelId, {from: sender}))
    })

    specify('not if open', async () => {
      let channelId = await openChannel(instance)
      assert.isTrue(await instance.isOpen(channelId))
      return assert.isRejected(instance.settle(channelId, {from: sender}))
    })

    specify('not until settling period is over', async () => {
      let channelId = await openChannel(instance, 2)
      await instance.startSettling(channelId, {from: sender})
      return assert.isRejected(instance.settle(channelId, {from: sender}))
    })
  })

  describe('paymentDigest', () => {
    specify('return hash of the payment', async () => {
      let channelId = '0xdeadbeaf'
      let payment = new BigNumber(10)
      let digest = await instance.paymentDigest(channelId, payment)
      let expected = await paymentDigest(instance.address, channelId, payment)
      assert.equal(digest.toString(), expected.toString())
    })
  })

  describe('signatureDigest', () => {
    specify('return prefixed hash to be signed', async () => {
      let channelId = '0xdeadbeaf'
      let payment = new BigNumber(10)
      let digest = await instance.signatureDigest(channelId, payment)
      let expected = await signatureDigest(instance.address, channelId, payment)
      assert.equal(digest, expected)
    })
  })

  specify('optimistic case: open -> claim', async () => {
    // 1. Open Channel
    let channelId = await openChannel(instance)

    let senderBalanceBefore = web3.eth.getBalance(sender)
    let receiverBalanceBefore = web3.eth.getBalance(receiver)

    assert.equal(web3.eth.getBalance(instance.address).toString(), channelValue.toString())
    assert.isTrue(await instance.isPresent(channelId))
    assert.isTrue(await instance.isOpen(channelId))

    // 2. Claim
    let payment = new BigNumber(web3.toWei(0.01, 'ether'))
    let paymentSignature = await sign(sender, instance, channelId, payment)
    assert.isTrue(await instance.canClaim(channelId, payment, receiver, paymentSignature))
    let claimCost = await transactionPrice(await instance.claim(channelId, payment, paymentSignature, {from: receiver}))

    // Check
    assert.isFalse(await instance.isPresent(channelId))
    assert.isFalse(await instance.isSettling(channelId))

    let senderBalanceAfter = web3.eth.getBalance(sender)
    let change = channelValue.minus(payment)
    assert.equal(senderBalanceAfter.toString(), senderBalanceBefore.plus(change).toString())

    let receiverBalanceAfter = web3.eth.getBalance(receiver)
    assert.equal(receiverBalanceAfter.minus(receiverBalanceBefore).toString(), payment.minus(claimCost).toString())

    assert.equal(web3.eth.getBalance(instance.address).toNumber(), 0)
  })

  specify('pessimistic case: open -> startSettling -> claim', async () => {
    // 1. Open Channel
    let channelId = await openChannel(instance, 1)

    let senderBalanceBefore = web3.eth.getBalance(sender)
    let receiverBalanceBefore = web3.eth.getBalance(receiver)

    assert.equal(web3.eth.getBalance(instance.address).toString(), channelValue.toString())
    assert.isTrue(await instance.isPresent(channelId))
    assert.isTrue(await instance.isOpen(channelId))

    // 2. Start Settling
    assert.isTrue(await instance.canStartSettling(channelId, sender))
    let startSettlingCost = await transactionPrice(await instance.startSettling(channelId, {from: sender}))
    assert.isFalse(await instance.canSettle(channelId, sender))

    // 3. Claim
    let payment = new BigNumber(web3.toWei(0.01, 'ether'))
    let paymentSignature = await sign(sender, instance, channelId, payment)
    assert.isTrue(await instance.canClaim(channelId, payment, receiver, paymentSignature))
    let claimCost = await transactionPrice(await instance.claim(channelId, payment, paymentSignature, {from: receiver}))

    // Check
    assert.isFalse(await instance.isPresent(channelId))
    assert.isFalse(await instance.isSettling(channelId))

    let senderBalanceAfter = web3.eth.getBalance(sender)
    let change = channelValue.minus(payment)
    assert.equal(senderBalanceAfter.toString(), senderBalanceBefore.plus(change).minus(startSettlingCost).toString())

    let receiverBalanceAfter = web3.eth.getBalance(receiver)
    assert.equal(receiverBalanceAfter.minus(receiverBalanceBefore).toString(), payment.minus(claimCost).toString())

    assert.equal(web3.eth.getBalance(instance.address).toNumber(), 0)
  })
})
