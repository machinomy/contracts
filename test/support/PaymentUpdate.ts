import HexString from './HexString'

export default interface PaymentUpdate {
  channelId: HexString
  nonce: number
  merkleRoot: HexString
  senderSig: HexString
  receiverSig: HexString
}
