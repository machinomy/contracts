import * as Web3 from 'web3'
import * as BigNumber from 'bignumber.js'
import * as abi from 'ethereumjs-abi'
import * as util from 'ethereumjs-util'

import { Broker } from '../src/index'
import { randomId } from './support'
import MerkleTree from '../src/MerkleTree'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as S from './support/BrokerScaffold'
import HexString from "./support/HexString";
import PaymentUpdate from "./support/PaymentUpdate";
import {randomPreimage} from "./support/BrokerScaffold";
import {toHashlock} from "./support/merkle";

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3

const BrokerContract = artifacts.require<Broker.Contract>('Broker.sol')

contract('Broker', accounts => {
  let preimage = randomId().toString()

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

  async function combineHashlocks (channelId: string, ...elements: Array<[string, BigNumber.BigNumber]>): Promise<Array<Buffer>> {
    let promisedHashlocks = elements.map(async e => util.toBuffer(await instance.toHashlock(channelId, e[0], e[1])))
    return Promise.all(promisedHashlocks)
  }

  function hexProof (proof: Array<Buffer>): string {
    return '0x' + proof.map(e => e.toString('hex')).join('')
  }

  async function sign (origin: string, digest: string): Promise<string> {
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

  async function signPayment (origin: string, channelId: string, merkleRoot: string): Promise<string> {
    let digest = await instance.paymentDigest(channelId, merkleRoot)
    return new Promise<string>((resolve, reject) => {
      web3.eth.sign(origin, digest, (error, signature) => {
        error ? reject(error) : resolve(signature)
      })
    })
  }

  async function merkle (channelId: string, _amount?: BigNumber.BigNumber): Promise<[string, string]> {
    let payment: BigNumber.BigNumber = _amount || s.channelValue
    let hashlocks = await combineHashlocks(channelId, [preimage, payment])
    let merkleTree = new MerkleTree(hashlocks)
    let proof = merkleTree.proof(hashlocks[0])
    let root = merkleTree.root
    return [hexProof(proof), util.bufferToHex(root)]
  }

  describe('open', () => {
    specify('emit DidOpen event', async () => {
      let channelId = await s.openChannel()
      assert.typeOf(channelId, 'string')
    })

    specify('increase contract balance', async () => {
      let startBalance = web3.eth.getBalance(instance.address)
      await s.openChannel()
      let endBalance = web3.eth.getBalance(instance.address)
      assert.deepEqual(endBalance, startBalance.plus(s.channelValue))
    })

    specify('set channel parameters', async () => {
      let channelId = await s.openChannel()
      let channel = await s.readChannel(channelId)
      assert.equal(channel.sender, s.sender)
      assert.equal(channel.receiver, s.receiver)
      assert.equal(channel.value.toString(), s.channelValue.toString())
    })
  })

  describe('canStartSettling', () => {
    specify('ok', async () => {
      let channelId = await s.openChannel()
      assert.isTrue(await instance.canStartSettling(channelId, s.sender))
      assert.isTrue(await instance.canStartSettling(channelId, s.receiver))
    })

    specify('not if missing channel', async () => {
      assert.isFalse(await instance.canStartSettling(S.FAKE_CHANNEL_ID, s.sender))
      assert.isFalse(await instance.canStartSettling(S.FAKE_CHANNEL_ID, s.receiver))
    })

    specify('not if alien', async () => {
      let channelId = await s.openChannel()
      assert.isFalse(await instance.canStartSettling(channelId, s.alien))
    })

    specify('not if settling', async () => {
      let channelId = await s.openChannel({settlingPeriod: 10})
      await s.startSettling(channelId)
      assert.isTrue(await instance.isSettling(channelId))
      assert.isFalse(await instance.canStartSettling(channelId, s.sender))
      assert.isFalse(await instance.canStartSettling(channelId, s.receiver))
    })
  })

  describe('startSettling', () => {
    let settlingPeriod = 2

    specify('emit DidStartSettling event', async () => {
      let channelId = await s.openChannel()
      let tx = await s.startSettling(channelId)
      assert.isTrue(tx.logs.some(Broker.isDidStartSettlingEvent))
    })

    specify('set channel params', async () => {
      let channelId = await s.openChannel({ settlingPeriod })
      let tx = await s.startSettling(channelId)
      let blockNumber = tx.receipt.blockNumber
      let channel = await s.readChannel(channelId)
      assert.equal(channel.settlingUntil.toNumber(), settlingPeriod + blockNumber)
      assert.isTrue(await instance.isSettling(channelId))
    })
  })

  describe('canUpdate', () => {
    let merkleRoot = '0xdeadbeaf'

    specify('ok if open', async () => {
      let channelId = await s.openChannel()
      assert.isTrue(await instance.isOpen(channelId))
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot)
      assert.isTrue(await s.canUpdate(nextUpdate))
    })

    specify('ok if settling', async () => {
      let channelId = await s.openChannel({settlingPeriod: 10})
      assert.isFalse(await instance.isSettling(channelId))
      await s.startSettling(channelId)
      assert.isTrue(await instance.isSettling(channelId))
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot)
      assert.isTrue(await s.canUpdate(nextUpdate))
    })

    specify('not if alien as sender', async () => {
      let channelId = await s.openChannel()
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot, s.alien, s.receiver)
      assert.isFalse(await s.canUpdate(nextUpdate))
    })

    specify('not if alien as receiver', async () => {
      let channelId = await s.openChannel()
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot, s.sender, s.alien)
      assert.isFalse(await s.canUpdate(nextUpdate))
    })

    specify('not if equal nonce', async () => {
      let channelId = await s.openChannel()
      let nonce = (await s.readChannel(channelId)).nonce.toNumber()
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot, s.sender, s.receiver, nonce)
      assert.isFalse(await s.canUpdate(nextUpdate))
    })

    specify('not if lower nonce', async () => {
      let channelId = await s.openChannel()
      await S.inSequence(3, async () => {
        let update = await s.nextUpdate(channelId, merkleRoot)
        await s.update(update)
      })

      let nonce = (await s.readChannel(channelId)).nonce.toNumber() - 1
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot, s.sender, s.receiver, nonce)
      assert.isFalse(await s.canUpdate(nextUpdate))
    })

    specify('not if settled', async () => {
      let channelId = await s.openChannel()
      await s.startSettling(channelId)
      assert.isTrue(await instance.isSettled(channelId))
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot)
      assert.isFalse(await s.canUpdate(nextUpdate))
    })
  })

  describe('update', () => {
    let settlingPeriod = 10
    let merkleRoot = util.bufferToHex(abi.rawEncode(['bytes32'], ['0xcafebabe']))

    specify('emit DidUpdate event', async () => {
      let channelId = await s.openChannel()
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot)
      let tx = await s.update(nextUpdate)
      assert.isTrue(tx.logs.some(Broker.isDidUpdateEvent))
    })

    specify('set channel params', async () => {
      let channelId = await s.openChannel({settlingPeriod})
      let nextUpdate = await s.nextUpdate(channelId, merkleRoot)
      await s.update(nextUpdate)
      let channel = await s.readChannel(channelId)
      let newMerkleRoot = channel.root
      assert.equal(newMerkleRoot, merkleRoot)
      assert.equal(channel.nonce.toNumber(), nextUpdate.nonce)
    })
  })

  describe('withdraw', () => {
    let amount = new BigNumber.BigNumber(web3.toWei(0.01, 'ether'))

    type Setup = {
      channelId: HexString,
      nextUpdate: PaymentUpdate,
      proof: HexString,
      root: HexString
    }

    async function prepare(settlingPeriod?: number, _amount?: BigNumber.BigNumber|number): Promise<Setup> {
      let channelId = await s.openChannel({settlingPeriod})
      let forWithdrawal = new BigNumber.BigNumber(_amount || amount)
      let [proof, root] = await merkle(channelId, forWithdrawal)
      let nextUpdate = await s.nextUpdate(channelId, root)

      return { channelId, proof, root, nextUpdate }
    }

    async function act(start: Setup) {
      await s.update(start.nextUpdate)
      await instance.startSettling(start.channelId)
      return await instance.withdraw(start.channelId, start.proof, preimage, amount)
    }

    context('if correct proof', () => {
      specify('decrease channel value', async () => {
        let start = await prepare()
        let valueBefore = (await s.readChannel(start.channelId)).value
        await act(start)
        let valueAfter = (await s.readChannel(start.channelId)).value
        assert.equal(valueAfter.minus(valueBefore).toString(), amount.mul(-1).toString())
      })

      specify('decrease contract balance', async () => {
        let start = await prepare()
        let valueBefore = web3.eth.getBalance(instance.address)
        await act(start)
        let valueAfter = web3.eth.getBalance(instance.address)
        assert.equal(valueAfter.minus(valueBefore).toString(), amount.mul(-1).toString())
      })

      specify('increase receiver balance', async () => {
        let start = await prepare()
        let valueBefore = web3.eth.getBalance(s.receiver)
        await act(start)
        let valueAfter = web3.eth.getBalance(s.receiver)
        assert.equal(valueAfter.minus(valueBefore).toString(), amount.toString())
      })

      specify('emit DidWithdraw event', async () => {
        let start = await prepare()
        let tx = await act(start)
        assert.isTrue(tx.logs.some(Broker.isDidWithdrawEvent))
      })

      specify('not if open channel', async () => {
        let start = await prepare()
        await s.update(start.nextUpdate)
        assert.isTrue(await instance.isOpen(start.channelId))
        return assert.isRejected(instance.withdraw(start.channelId, start.proof, preimage, amount, {from: s.sender}))
      })

      specify('not if settling channel', async () => {
        let start = await prepare(10)
        await s.update(start.nextUpdate)
        await instance.startSettling(start.channelId)
        assert.isTrue(await instance.isSettling(start.channelId))
        return assert.isRejected(instance.withdraw(start.channelId, start.proof, preimage, amount, {from: s.sender}))
      })

      specify('not if alien', async () => {
        let start = await prepare()
        await s.update(start.nextUpdate)
        await instance.startSettling(start.channelId)
        return assert.isRejected(instance.withdraw(start.channelId, start.proof, preimage, amount, {from: s.alien}))
      })

      context('if last withdrawal', () => {
        specify('delete channel', async () => {
          let start = await prepare(undefined, s.channelValue)
          await s.update(start.nextUpdate)
          await instance.startSettling(start.channelId)
          await instance.withdraw(start.channelId, start.proof, preimage, s.channelValue)
          let valueAfter = (await s.readChannel(start.channelId)).value
          assert.equal(valueAfter.toString(), '0')
          assert.isFalse(await instance.isPresent(start.channelId))
        })

        specify('emit DidClose event', async () => {
          let start = await prepare(undefined, s.channelValue)
          await s.update(start.nextUpdate)
          await instance.startSettling(start.channelId)
          let tx = await instance.withdraw(start.channelId, start.proof, preimage, s.channelValue)
          assert.isTrue(tx.logs.some(Broker.isDidCloseEvent))
        })
      })
    })

    context('if incorrect preimage', () => {
      const wrongPreimage = '0xcafe'
      specify('fail', async () => {
        let start = await prepare()
        await s.update(start.nextUpdate)
        await instance.startSettling(start.channelId)
        return assert.isRejected(instance.withdraw(start.channelId, start.proof, wrongPreimage, s.channelValue))
      })
    })
  })

  describe('isPresent', () => {
    specify('if channel exists', async () => {
      let channelId = await s.openChannel()
      assert.isTrue(await instance.isPresent(channelId))
    })

    specify('not if missing channel', async () => {
      assert.isFalse(await instance.isPresent(S.FAKE_CHANNEL_ID))
    })
  })

  describe('isSettling', () => {
    specify('if channel.settlingUntil', async () => {
      let channelId = await s.openChannel({ settlingPeriod: 10 })
      await s.startSettling(channelId)
      let channel = await s.readChannel(channelId)
      assert.notEqual(channel.settlingUntil.toNumber(), 0)
      assert.isTrue(await instance.isSettling(channelId))
    })

    specify('not if missing channel', async () => {
      assert.isFalse(await instance.isSettling(S.FAKE_CHANNEL_ID))
    })
  })

  describe('isOpen', () => {
    specify('if present', async () => {
      let channelId = await s.openChannel()
      assert.isTrue(await instance.isOpen(channelId))
    })

    specify('not if settling', async () => {
      let channelId = await s.openChannel({settlingPeriod: 10})
      await s.startSettling(channelId)
      assert.isTrue(await instance.isSettling(channelId))
      assert.isFalse(await instance.isOpen(channelId))
      assert.isFalse(await instance.isSettled(channelId))
    })

    specify('not if missing channel', async () => {
      assert.isFalse(await instance.isPresent(S.FAKE_CHANNEL_ID))
      assert.isFalse(await instance.isOpen(S.FAKE_CHANNEL_ID))
    })
  })

  describe('settle', () => {
    type Setup = {
      channelId: HexString,
      nextUpdate: PaymentUpdate,
      proof: HexString,
      root: HexString
    }

    async function prepare(_amount?: BigNumber.BigNumber|number): Promise<Setup> {
      let channelId = await s.openChannel()
      let forWithdrawal = new BigNumber.BigNumber(_amount || s.channelValue)
      let [proof, root] = await merkle(channelId, forWithdrawal)
      let nextUpdate = await s.nextSettleUpdate(channelId, root)

      return { channelId, proof, root, nextUpdate }
    }

    specify('set channel params', async () => {
      let start = await prepare(s.channelValue)
      let tx = await s.settle(start.nextUpdate)
      let blockNumber = tx.receipt.blockNumber
      let channelAfter = await s.readChannel(start.channelId)
      assert.equal(channelAfter.settlingUntil.toNumber(), blockNumber)
      assert.equal(channelAfter.root, start.root)
    })

    specify('not if settled', async () => {
      let start = await prepare(s.channelValue)
      await s.settle(start.nextUpdate)
      let nextUpdate = await s.nextSettleUpdate(start.channelId, start.root)
      return assert.isRejected(s.settle(nextUpdate))
    })

    async function updateChannel (channelId: string, value: BigNumber.BigNumber) {
      let channel = await s.readChannel(channelId)
      let nonce = channel.nonce.plus(10)
      let root = (await merkle(channelId, s.channelValue))[1]
      let fingerprint = await instance.updateFingerprint(channelId, nonce, root)
      let senderSig = await sign(s.sender, fingerprint)
      let receiverSig = await sign(s.receiver, fingerprint)
      return await instance.update(channelId, nonce, root, senderSig, receiverSig)
    }

    specify('not if lower nonce', async () => {
      let channelId = await s.openChannel()
      await updateChannel(channelId, s.channelValue)

      let channel = await s.readChannel(channelId)
      let nonce = channel.nonce.minus(1)
      let root = (await merkle(channelId, s.channelValue))[1]
      let fingerprint = await instance.settleFingerprint(channelId, nonce, root)
      let senderSig = await sign(s.sender, fingerprint)
      let receiverSig = await sign(s.receiver, fingerprint)
      return assert.isRejected(instance.settle(channelId, nonce, root, senderSig, receiverSig))
    })
    specify('not if not signed by sender', async () => {
      let channelId = await s.openChannel()
      await updateChannel(channelId, s.channelValue)

      let channel = await s.readChannel(channelId)
      let nonce = channel.nonce.minus(1)
      let root = (await merkle(channelId, s.channelValue))[1]
      let fingerprint = await instance.settleFingerprint(channelId, nonce, root)
      let receiverSig = await sign(s.receiver, fingerprint)
      return assert.isRejected(instance.settle(channelId, nonce, root, '0xdeadbeaf', receiverSig))
    })
    specify('not if not signed by receiver', async () => {
      let channelId = await s.openChannel()
      await updateChannel(channelId, s.channelValue)

      let channel = await s.readChannel(channelId)
      let nonce = channel.nonce.minus(1)
      let root = (await merkle(channelId, s.channelValue))[1]
      let fingerprint = await instance.settleFingerprint(channelId, nonce, root)
      let senderSig = await sign(s.sender, fingerprint)
      return assert.isRejected(instance.settle(channelId, nonce, root, senderSig, '0xdeadbeaf'))
    })
  })

  describe('isSignedPayment', () => {
    specify('ok', async () => {
      let channelId = await s.openChannel()
      let merkleRoot = '0xcafebabe'
      let senderSig = await signPayment(s.sender, channelId, merkleRoot)
      let receiverSig = await signPayment(s.receiver, channelId, merkleRoot)
      assert.isTrue(await instance.isSignedPayment(channelId, merkleRoot, senderSig, receiverSig))
    })

    specify('not if not signed by sender', async () => {
      let channelId = await s.openChannel()
      let merkleRoot = '0xcafebabe'
      let receiverSig = await signPayment(s.receiver, channelId, merkleRoot)

      assert.isFalse(await instance.isSignedPayment(channelId, merkleRoot, '0xdeadbeaf', receiverSig))
    })

    specify('not if not signed by receiver', async () => {
      let channelId = await s.openChannel()
      let merkleRoot = '0xcafebabe'
      let senderSig = await signPayment(s.sender, channelId, merkleRoot)

      assert.isFalse(await instance.isSignedPayment(channelId, merkleRoot, senderSig, '0xdeadbeaf'))
    })
  })

  describe('toHashlock', () => {
    specify('calculate hashlock', async () => {
      let channelId = await s.openChannel()
      let amount = new BigNumber.BigNumber(300)
      let preimage = randomPreimage()
      let canonical = await instance.toHashlock(channelId, preimage, amount)
      let calculated = await toHashlock(instance.address, channelId, preimage, amount)
      assert.deepEqual(canonical, util.bufferToHex(calculated))
    })
  })
})
