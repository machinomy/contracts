import * as Web3 from 'web3'
import BigNumber from 'bignumber.js'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as abi from 'ethereumjs-abi'
import * as util from 'ethereumjs-util'

import {BBroker} from '../src/index'
import {getNetwork, randomUnlock} from './support'
import ECRecovery from '../build/wrappers/ECRecovery'
import MerkleTree from '../src/MerkleTree'

chai.use(asPromised)

const assert = chai.assert

const web3 = (global as any).web3 as Web3

interface PaymentChannel {
  sender: string
  receiver: string
  value: BigNumber
  root: string
  settlingPeriod: BigNumber
  settlingUntil: BigNumber
  nonce: BigNumber
}

interface Hashlock {
  preimage: string
  adjustment: BigNumber
}

async function paymentDigest (address: string, channelId: string, merkleRoot: string): Promise<string> {
  let chainId = await getNetwork(web3)
  let hash = abi.soliditySHA3(
    ['address', 'uint32', 'bytes32', 'bytes32'],
    [address, chainId, channelId, merkleRoot]
  )
  return util.bufferToHex(hash)
}

async function signatureDigest (address: string, digest: string): Promise<string> {
  let prefix = Buffer.from('\x19Ethereum Signed Message:\n32')
  let hash = abi.soliditySHA3(
    ['bytes', 'bytes32'],
    [prefix, digest]
  )
  return util.bufferToHex(hash)
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
      return contract.new(networkId, {from: sender, gas: 2800000})
    }
  }

  async function openChannel (instance: BBroker.Contract, _settlementPeriod?: number): Promise<string> {
    let options = { value: channelValue, from: sender }
    let settlementPeriod = _settlementPeriod || 0
    let log = await instance.open(receiver, settlementPeriod, options)
    let logEvent = log.logs[0]
    if (BBroker.isDidOpenEvent(logEvent)) {
      return logEvent.args.channelId
    } else {
      return Promise.reject(log.receipt)
    }
  }

  async function readChannel (instance: BBroker.Contract, channelId: string): Promise<PaymentChannel> {
    let [ sender, receiver, value, root, settlingPeriod, settlingUntil, nonce ]= await instance.channels(channelId)
    return { sender, receiver, value, root, settlingPeriod, settlingUntil, nonce }
  }

  async function packHashlock (channelId: string, hashlock: Hashlock): Promise<string> {
    let hashlockBuffer = abi.soliditySHA3(
      ['uint32', 'bytes32', 'bytes32', 'int256'],
      [(await getNetwork(web3)), channelId, hashlock.preimage, hashlock.adjustment.toString()]
    )
    return util.bufferToHex(hashlockBuffer)
  }

  async function combineHashlocks (channelId: string, ...elements: Array<[string, BigNumber]>): Promise<Array<Buffer>> {
    let promisedHashlocks = elements.map(async e => util.toBuffer(await instance.toHashlock(channelId, e[0], e[1])))
    return Promise.all(promisedHashlocks)
  }

  function hexProof (proof: Array<Buffer>): string {
    return '0x' + proof.map(e => e.toString('hex')).join('')
  }

  async function sign (origin: string, channelId: string, merkleRoot: string): Promise<string> {
    let digest = await paymentDigest(instance.address, channelId, merkleRoot)
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

  let preimage = randomUnlock()

  async function merkle(channelId: string, _amount?: BigNumber): Promise<[string, string]> {
    let payment: BigNumber = _amount || channelValue
    let hashlocks = await combineHashlocks(channelId, [preimage, payment])
    let merkleTree = new MerkleTree(hashlocks)
    let proof = merkleTree.proof(hashlocks[0])
    let root = merkleTree.root
    return [hexProof(proof), util.bufferToHex(root)]
  }

  let instance: BBroker.Contract

  before(async () => {
    if (!instance) {
      instance = await deployed()
    }
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
    })
  })

  describe('canStartSettling', () => {
    specify('ok', async () => {
      let channelId = await openChannel(instance)
      assert.isTrue(await instance.canStartSettling(channelId, sender))
      assert.isTrue(await instance.canStartSettling(channelId, sender))
    })

    specify('not if missing channel', async () => {
      let channelId = '0xcafebabe'
      assert.isFalse(await instance.canStartSettling(channelId, sender))
      assert.isFalse(await instance.canStartSettling(channelId, receiver))
    })

    specify('not if alien', async () => {
      let channelId = await openChannel(instance)
      assert.isFalse(await instance.canStartSettling(channelId, alien))
    })

    specify('not if settling', async () => {
      let channelId = await openChannel(instance)
      let merkleRoot = '0xcafebabe'
      let senderSig = await sign(sender, channelId, merkleRoot)
      let receiverSig = await sign(receiver, channelId, merkleRoot)
      await instance.startSettling(channelId, merkleRoot, senderSig, receiverSig)
      assert.isTrue(await instance.isSettling(channelId))
      assert.isFalse(await instance.canStartSettling(channelId, sender))
      assert.isFalse(await instance.canStartSettling(channelId, receiver))
    })
  })

  describe('startSettling', () => {
    specify('emit DidStartSettling event', async () => {
      let channelId = await openChannel(instance)
      let merkleRoot = '0xcafebabe'
      let senderSig = await sign(sender, channelId, merkleRoot)
      let receiverSig = await sign(receiver, channelId, merkleRoot)
      let tx = await instance.startSettling(channelId, merkleRoot, senderSig, receiverSig)
      assert.isTrue(tx.logs.some(BBroker.isDidStartSettlingEvent))
    })

    // specify('set channel.root', async () => {
    //   let channelId = await openChannel(instance)
    //   let merkleRoot = util.bufferToHex(abi.rawEncode(['bytes32'], ['0xcafebabe']))
    //   let senderSig = await sign(sender, channelId, merkleRoot)
    //   let receiverSig = await sign(receiver, channelId, merkleRoot)
    //   await instance.startSettling(channelId, merkleRoot, senderSig, receiverSig)
    //   let channel = await readChannel(instance, channelId)
    //   assert.equal(channel.root, merkleRoot)
    // })

    specify('set channel.settlingUntil', async () => {
      let settlingPeriod = 2
      let channelId = await openChannel(instance, settlingPeriod)
      let merkleRoot = '0xcafebabe'
      let senderSig = await sign(sender, channelId, merkleRoot)
      let receiverSig = await sign(receiver, channelId, merkleRoot)
      let tx = await instance.startSettling(channelId, merkleRoot, senderSig, receiverSig)
      let blockNumber = tx.receipt.blockNumber
      let channel = await readChannel(instance, channelId)
      assert.equal(channel.settlingUntil.toNumber(), settlingPeriod + blockNumber)
    })

    specify('affect isSettling', async () => {
      let settlingPeriod = 2
      let channelId = await openChannel(instance, settlingPeriod)
      let merkleRoot = '0xcafebabe'
      let senderSig = await sign(sender, channelId, merkleRoot)
      let receiverSig = await sign(receiver, channelId, merkleRoot)
      let tx = await instance.startSettling(channelId, merkleRoot, senderSig, receiverSig)
      let blockNumber = tx.receipt.blockNumber
      let channel = await readChannel(instance, channelId)
      assert.equal(channel.settlingUntil.toNumber(), settlingPeriod + blockNumber)
    })
  })

  // describe('withdraw', () => {
  //   let amount = new BigNumber(web3.toWei(0.01, 'ether'))
  //
  //   context('if correct proof', () => {
  //     specify('decrease channel value', async () => {
  //       let channelId = await openChannel(instance)
  //       let [proof, root] = await merkle(channelId, amount)
  //       let senderSig = await sign(sender, channelId, root)
  //       let receiverSig = await sign(receiver, channelId, root)
  //
  //       let valueBefore = (await readChannel(instance, channelId)).value
  //       await instance.startSettling(channelId, root, senderSig, receiverSig)
  //       await instance.withdraw(channelId, proof, preimage, amount)
  //       let valueAfter = (await readChannel(instance, channelId)).value
  //
  //       assert.equal(valueAfter.minus(valueBefore).toString(), amount.mul(-1).toString())
  //     })
  //
  //     specify('decrease contract balance', async () => {
  //       let channelId = await openChannel(instance)
  //       let [proof, root] = await merkle(channelId, amount)
  //       let senderSig = await sign(sender, channelId, root)
  //       let receiverSig = await sign(receiver, channelId, root)
  //
  //       let valueBefore = web3.eth.getBalance(instance.address)
  //       await instance.startSettling(channelId, root, senderSig, receiverSig)
  //       await instance.withdraw(channelId, proof, preimage, amount)
  //       let valueAfter = web3.eth.getBalance(instance.address)
  //       assert.equal(valueAfter.minus(valueBefore).toString(), amount.mul(-1).toString())
  //     })
  //
  //     specify('increase receiver balance', async () => {
  //       let channelId = await openChannel(instance)
  //       let [proof, root] = await merkle(channelId, amount)
  //       let senderSig = await sign(sender, channelId, root)
  //       let receiverSig = await sign(receiver, channelId, root)
  //
  //       let valueBefore = web3.eth.getBalance(receiver)
  //       await instance.startSettling(channelId, root, senderSig, receiverSig)
  //       await instance.withdraw(channelId, proof, preimage, amount)
  //       let valueAfter = web3.eth.getBalance(receiver)
  //       assert.equal(valueAfter.minus(valueBefore).toString(), amount.toString())
  //     })
  //
  //     specify('emit DidWithdraw event', async () => {
  //       let channelId = await openChannel(instance)
  //       let [proof, root] = await merkle(channelId, amount)
  //       let senderSig = await sign(sender, channelId, root)
  //       let receiverSig = await sign(receiver, channelId, root)
  //
  //       await instance.startSettling(channelId, root, senderSig, receiverSig)
  //       let tx = await instance.withdraw(channelId, proof, preimage, amount)
  //       assert.isTrue(tx.logs.some(BBroker.isDidWithdrawEvent))
  //     })
  //
  //     context('if last withdrawal', () => {
  //       specify('delete channel', async () => {
  //         let channelId = await openChannel(instance)
  //         let [proof, root] = await merkle(channelId, channelValue)
  //         let senderSig = await sign(sender, channelId, root)
  //         let receiverSig = await sign(receiver, channelId, root)
  //
  //         await instance.startSettling(channelId, root, senderSig, receiverSig)
  //         await instance.withdraw(channelId, proof, preimage, channelValue)
  //         let valueAfter = (await readChannel(instance, channelId)).value
  //         assert.equal(valueAfter.toString(), '0')
  //         assert.isFalse(await instance.isPresent(channelId))
  //       })
  //
  //       specify('emit DidClose event', async () => {
  //         let channelId = await openChannel(instance)
  //         let [proof, root] = await merkle(channelId, channelValue)
  //         let senderSig = await sign(sender, channelId, root)
  //         let receiverSig = await sign(receiver, channelId, root)
  //
  //         await instance.startSettling(channelId, root, senderSig, receiverSig)
  //         let tx = await instance.withdraw(channelId, proof, preimage, channelValue)
  //         assert.isTrue(tx.logs.some(BBroker.isDidCloseEvent))
  //       })
  //     })
  //   })
  //
  //   context('if incorrect proof', () => {
  //     specify('fail', async () => {
  //       let channelId = await openChannel(instance)
  //       let [proof, root] = await merkle(channelId, amount)
  //       let senderSig = await sign(sender, channelId, root)
  //       let receiverSig = await sign(receiver, channelId, root)
  //
  //       await instance.startSettling(channelId, root, senderSig, receiverSig)
  //       return assert.isRejected(instance.withdraw(channelId, proof, preimage, channelValue))
  //     })
  //   })
  // })

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

  describe('isPresent', () => {
    specify('if channel exists', async () => {
      let channelId = await openChannel(instance)
      assert.isTrue(await instance.isPresent(channelId))
    })

    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      assert.isFalse(await instance.isPresent(channelId))
    })
  })

  describe('isSettling', () => {
    specify('if channel.settlingUntil', async () => {
      let channelId = await openChannel(instance)
      let [proof, root] = await merkle(channelId, channelValue)
      let senderSig = await sign(sender, channelId, root)
      let receiverSig = await sign(receiver, channelId, root)
      await instance.startSettling(channelId, root, senderSig, receiverSig)
      let channel = await readChannel(instance, channelId)
      assert.notEqual(channel.settlingUntil.toNumber(), 0)
      assert.isTrue(await instance.isSettling(channelId))
    })

    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      assert.isFalse(await instance.isSettling(channelId))
    })
  })

  describe('isOpen', () => {
    specify('if present', async () => {
      let channelId = await openChannel(instance)
      assert.isTrue(await instance.isOpen(channelId))
    })

    specify('not if settling', async () => {
      let channelId = await openChannel(instance)
      let [proof, root] = await merkle(channelId, channelValue)
      let senderSig = await sign(sender, channelId, root)
      let receiverSig = await sign(receiver, channelId, root)
      await instance.startSettling(channelId, root, senderSig, receiverSig)
      assert.isTrue(await instance.isPresent(channelId))
      assert.isTrue(await instance.isSettling(channelId))
      assert.isFalse(await instance.isOpen(channelId))
    })

    specify('not if missing channel', async () => {
      let channelId = '0xdeadbeaf'
      assert.isFalse(await instance.isPresent(channelId))
      assert.isFalse(await instance.isOpen(channelId))
    })
  })

  describe('paymentDigest', () => {
    specify('return hash of the payment', async () => {
      let channelId = '0xdeadbeaf'
      let merkleRoot = '0xdeadbeaf'
      let digest = await instance.paymentDigest(channelId, merkleRoot)
      let expected = await paymentDigest(instance.address, channelId, merkleRoot)
      assert.equal(digest.toString(), expected.toString())
    })
  })

  describe('signatureDigest', () => {
    specify('return prefixed hash to be signed', async () => {
      let hash = await instance.paymentDigest('0xcafe', '0xbabe')
      let digest = await instance.signatureDigest(hash)
      let expected = await signatureDigest(instance.address, hash)
      assert.equal(digest, expected)
    })
  })

  describe('isSignedPayment', () => {
    specify('ok', async () => {
      let channelId = await openChannel(instance)
      let merkleRoot = '0xcafebabe'
      let senderSig = await sign(sender, channelId, merkleRoot)
      let receiverSig = await sign(receiver, channelId, merkleRoot)
      assert.isTrue(await instance.isSignedPayment(channelId, merkleRoot, senderSig, receiverSig))
    })

    specify('not if not signed by sender', async () => {
      let channelId = await openChannel(instance)
      let merkleRoot = '0xcafebabe'
      let receiverSig = await sign(receiver, channelId, merkleRoot)

      assert.isFalse(await instance.isSignedPayment(channelId, merkleRoot, '0xdeadbeaf', receiverSig))
    })

    specify('not if not signed by receiver', async () => {
      let channelId = await openChannel(instance)
      let merkleRoot = '0xcafebabe'
      let senderSig = await sign(sender, channelId, merkleRoot)

      assert.isFalse(await instance.isSignedPayment(channelId, merkleRoot, senderSig, '0xdeadbeaf'))
    })
  })

  specify('open -> settle -> update ---> withdraw', async () => {
    // 1. open
    let channelId = await openChannel(instance)
    // 2. settle
  })
})
