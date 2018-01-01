declare module 'solc' {
  namespace solc {
    export function compileStandard(json: string): string
  }

  export = solc
}
