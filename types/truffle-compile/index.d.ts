declare module 'truffle-compile/profiler' {
  import * as Resolver from 'truffle-resolver'

  namespace Profiler {
    interface RequiredSourcesConfig {
      resolver: Resolver
      paths: Array<string>
      base_path: string
    }

    interface RequiredSourcesCallback {
      (err: string, sources: {[name: string]: string}): void
    }

    function required_sources(config: RequiredSourcesConfig, callback: RequiredSourcesCallback): void
  }

  export = Profiler
}
