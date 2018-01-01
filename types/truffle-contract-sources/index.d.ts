declare module 'truffle-contract-sources' {
  namespace FindContracts {
  }

  function FindContracts(contractsDir: string, callback: (err: string, files: Array<string>) => void): void

  export = FindContracts
}
