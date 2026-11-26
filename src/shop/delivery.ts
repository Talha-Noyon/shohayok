import type {Zone} from './places.js'

export interface DeliveryRate {
  fee: number
  minDays: number
  maxDays: number
  /** Orders above this subtotal, in Taka, are delivered free */
  freeOver: number
  /** The policy document that states this rate */
  policy: string
}

/** The rates in policies F01 and F02. A test keeps the two in step. */
export const DELIVERY: Record<Zone, DeliveryRate> = {
  dhaka: {fee: 70, minDays: 1, maxDays: 2, freeOver: 3000, policy: 'F01'},
  outside: {fee: 130, minDays: 3, maxDays: 5, freeOver: 5000, policy: 'F02'}
}

export function deliveryFee(zone: Zone, subtotal: number): number {
  const rate = DELIVERY[zone]
  return subtotal > rate.freeOver ? 0 : rate.fee
}
