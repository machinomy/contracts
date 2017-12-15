import * as Web3 from 'web3'
import * as truffle from 'truffle-contract'

export type NetworkId = string | number

export default class Envelope<A> {
  artifact: any
  provider?: Web3.Provider
  networkId?: string | number

  static build<A>(artifact: any, provider?: Web3.Provider, networkId?: NetworkId) {
    return new Envelope<A>(artifact, provider, networkId)
  }

  constructor (artifact: any, provider?: Web3.Provider, networkId?: NetworkId) {
    this.artifact = artifact
    this.provider = provider
    this.networkId = networkId
  }

  get contract (): truffle.TruffleContract<A> {
    let contract = truffle<A>(this.artifact)
    if (this.provider) {
      contract.setProvider(this.provider)
    }
    if (this.networkId) {
      contract.setNetwork(this.networkId)
    }
    return contract
  }

  setProvider (provider: Web3.Provider): Envelope<A> {
    return new Envelope<A>(this.artifact, provider, this.networkId)
  }

  setNetwork (networkId: NetworkId): Envelope<A> {
    return new Envelope<A>(this.artifact, this.provider, networkId)
  }

  resetNetwork (): Envelope<A> {
    return new Envelope<A>(this.artifact, this.provider, undefined)
  }

  new (opts?: Web3.TxData): Promise<A> {
    return this.contract.new(opts)
  }

  at (address: string): Promise<A> {
    return this.contract.at(address)
  }

  deployed (): Promise<A> {
    return this.contract.deployed()
  }

  hasNetwork (networkId: NetworkId): boolean {
    return this.contract.hasNetwork(networkId)
  }

  isDeployed (): boolean {
    return this.contract.isDeployed()
  }
}
