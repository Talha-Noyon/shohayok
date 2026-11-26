import type {Entities} from '../nlu/entities.js'
import {maskPhone} from '../shop/format.js'
import type {TraceEntities} from '../shared/api.js'

export type {SearchTrace, Trace, TraceEntities} from '../shared/api.js'

/** What the rules read, for the trace: place keys, and the phone masked */
export function traceEntities(entities: Entities): TraceEntities {
  const {places, phone, ...rest} = entities
  return {
    ...rest,
    places: places.map((place) => place.key),
    ...(phone && {phone: maskPhone(phone)})
  }
}
