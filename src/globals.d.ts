// Truffle injects the following into the global scope
declare var contract: (name: string, callback: (accounts: Array<string>) => void) => void

declare module 'ethereumjs-abi' {
  export function soliditySHA3 (types: string[], values: any[]): Buffer
  export function rawEncode (types: string[], values: any[]): Buffer
  export function rawDecode<A> (types: string[], data: Buffer): A
}
