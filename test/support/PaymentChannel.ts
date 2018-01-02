import * as BigNumber from 'bignumber.js'
import Address from './Address'
import HexString from './HexString'

export default interface PaymentChannel {
  sender: Address
  receiver: Address
  value: BigNumber.BigNumber
  root: HexString
  settlingPeriod: BigNumber.BigNumber
  settlingUntil: BigNumber.BigNumber
  nonce: BigNumber.BigNumber
}
