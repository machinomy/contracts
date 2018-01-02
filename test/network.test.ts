import * as Web3 from 'web3'
import * as BigNumber from 'bignumber.js'

import { Broker } from '../src/index'

import * as chai from 'chai'
import * as asPromised from 'chai-as-promised'
import * as S from './support/BrokerScaffold'

chai.use(asPromised)

const web3 = (global as any).web3 as Web3

const BrokerContract = artifacts.require<Broker.Contract>('Broker.sol')

contract('Network Scenario', accounts => {
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
})
