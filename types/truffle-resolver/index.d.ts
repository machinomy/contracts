declare module 'truffle-resolver' {

  namespace Resolver {
  }

  interface ResolverConfig {
    working_directory: string
    contracts_build_directory: string
  }

  class Resolver {
    constructor (config: ResolverConfig)
  }

  export = Resolver
}
