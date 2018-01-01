declare module 'truffle-deployer' {
  import * as truffle from 'truffle-contract'

  namespace Deployer { }

  class Deployer {
    deploy <A> (contract: truffle.TruffleContract<A>, ...args: Array<any>): Promise<void>
    link <A, B> (library: truffle.TruffleContract<A>, contract: truffle.TruffleContract<B>): Promise<void>
    network_id: string
  }

  export = Deployer
}
