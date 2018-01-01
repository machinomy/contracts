declare module 'truffle-config' {
  import * as Resolver from 'truffle-resolver'
  import * as Artifactor from 'truffle-artifactor'

  namespace Config {

  }

  class Config {
    static default(): Config
    working_directory: string
    contracts_directory: string
    contracts_build_directory: string
    build_directory: string
    resolver: Resolver
    artifactor: Artifactor
    paths: Array<string>
    base_path: string
  }

  export = Config
}
