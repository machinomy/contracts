import * as Web3 from 'web3'
import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import { BidiBroker } from '../src'

chai.use(asPromised)

const expect = chai.expect

const web3 = (global as any).web3 as Web3

contract('BidiBroker', accounts => {
  const sender = accounts[0]
  const receiver = accounts[1]
  const contract = BidiBroker.contract(web3.currentProvider, { from: sender, gas: 200000 })
})
