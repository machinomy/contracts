declare module 'truffle-deployer' {
  import * as truffle from 'truffle-contract'

  namespace Deployer { }

  class Deployer {
    deploy <A> (contract: truffle.TruffleContract<A>, ...args: Array<any>): void
    link <A, B> (library: truffle.TruffleContract<A>, contract: truffle.TruffleContract<B>): void
    network_id: string
  }

  export = Deployer
}
