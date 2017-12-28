import {MerkleTree} from '../src'
import * as utils from 'ethereumjs-util'
import * as chai from 'chai'

const assert = chai.assert

describe('MerkleTree', () => {
  let elements = [1, 2, 3].map(e => utils.sha3(e))
  let tree = new MerkleTree(elements)
  let element = elements[0]
  let expectedProof = [
    '0x69c322e3248a5dfc29d73c5b0553b0185a35cd5bb6386747517ef7e53b15e287',
    '0xf2ee15ea639b73fa3db9b34a245bdfa015c260c598b211bf05a1ecc4b3e3b4f2'
  ].map(utils.toBuffer)

  specify('calculate root', () => {
    let root = tree.root
    let expected = '0xeabc7452eee4f65d21a7edc9987de7047c7f2554db3dfeab6bff2d80e61c2022'
    assert.equal(utils.bufferToHex(root), expected)
  })

  specify('generate proof', () => {
    let proof = tree.proof(elements[0])
    assert.deepEqual(proof, expectedProof)
  })

  specify('verify proof', () => {
    let verify = MerkleTree.verify(expectedProof, tree.root, element)
    assert.isTrue(verify)
  })

})
