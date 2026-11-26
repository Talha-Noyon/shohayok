import {describe, expect, it} from 'vitest'

import {route, type Route} from '../src/agent/route.js'
import {applyResult, NEW_STATE, type ConversationState} from '../src/agent/state.js'
import {extractEntities} from '../src/nlu/entities.js'
import {detectIntents} from '../src/nlu/intents.js'
import type {ToolResult} from '../src/tools/types.js'

const routeOf = (message: string, state: ConversationState = NEW_STATE): Route => {
  const entities = extractEntities(message)
  return route(message, entities, detectIntents(message, entities), state)
}

describe('route: one message', () => {
  const cases: [string, Partial<Route> & Record<string, unknown>][] = [
    ['manusher sathe kotha bolte chai', {kind: 'tool', tool: 'request_callback', phone: undefined}],
    ['call me at 01012345678', {tool: 'request_callback', phone: '01012345678'}],
    ['NDI-10024 er status ki?', {tool: 'order_status', orderId: 'NDI-10024', phone: undefined}],
    ['amar order kothay?', {tool: 'order_status', orderId: undefined}],
    ['hello, amar order kothay?', {tool: 'order_status'}],
    ['delivery charge koto?', {tool: 'delivery_fee', place: undefined}],
    ['Can I pay cash on delivery?', {kind: 'answer'}],
    ['What is your return policy?', {kind: 'answer'}],
    ['hi', {tool: 'smalltalk', smalltalk: 'greeting'}],
    ['dhonnobad', {tool: 'smalltalk', smalltalk: 'thanks'}],
    [
      'lal jamdani 10000 er niche dekhan',
      {tool: 'list_products', query: {styles: ['jamdani'], colors: ['red'], maxPrice: 10000}}
    ],
    [
      'জামদানি শাড়ির দাম কত?',
      {tool: 'list_products', query: {category: 'sharee', styles: ['jamdani']}}
    ],
    [
      'tangail sharee er dam koto?',
      {tool: 'list_products', query: {category: 'sharee', styles: ['tangail']}}
    ],
    [
      'ketoki jamdani sharee er dam koto?',
      {
        tool: 'product_info',
        product: {by: 'name', collection: 'ketoki', styles: ['jamdani'], category: 'sharee'}
      }
    ],
    [
      'ketoki jamdani XL e ache?',
      {
        tool: 'check_stock',
        product: {by: 'name', collection: 'ketoki', styles: ['jamdani']},
        size: 'XL'
      }
    ]
  ]

  it.each(cases)('routes %s', (message, expected) => {
    expect(routeOf(message)).toMatchObject(expected)
  })

  it('sends a delivery question about a district named like a sharee to the delivery tool', () => {
    const result = routeOf('Tangail e delivery charge koto?')
    expect(result).toMatchObject({tool: 'delivery_fee'})
    expect(result.kind === 'tool' && result.tool === 'delivery_fee' && result.place?.key).toBe(
      'tangail'
    )
  })

  it('says which rule decided, for the inspector', () => {
    expect(routeOf('amar order kothay?').reason).toMatch(/order/)
  })
})

describe('route: across a conversation', () => {
  const turn = (state: ConversationState, message: string, result: ToolResult) => {
    const decided = routeOf(message, state)
    return {decided, state: applyResult(state, decided, result, [])}
  }

  it('collects the order number and the phone over several messages', () => {
    const first = turn(NEW_STATE, 'amar order kothay?', {
      tool: 'order_status',
      outcome: 'missing',
      missing: ['orderId', 'phone']
    })
    const second = turn(first.state, 'NDI-10299', {
      tool: 'order_status',
      outcome: 'missing',
      missing: ['phone']
    })
    expect(second.decided).toMatchObject({tool: 'order_status', orderId: 'NDI-10299'})
    expect(routeOf('01000000002', second.state)).toMatchObject({
      tool: 'order_status',
      orderId: 'NDI-10299',
      phone: '01000000002'
    })
  })

  it('counts failed lookups and forgets the pending lookup once it is answered', () => {
    const asked = applyResult(
      NEW_STATE,
      routeOf('NDI-10299 01000000009'),
      {
        tool: 'order_status',
        outcome: 'not_found'
      },
      []
    )
    expect(asked).toMatchObject({failedLookups: 1, pending: undefined})
  })

  it('finds "the second one" in the list it showed last', () => {
    const state: ConversationState = {...NEW_STATE, lastProducts: ['P036', 'P052', 'P120']}
    expect(routeOf('2nd tar dam koto?', state)).toMatchObject({
      tool: 'product_info',
      product: {by: 'id', id: 'P052'}
    })
    expect(routeOf('শেষেরটা স্টকে আছে?', state)).toMatchObject({
      tool: 'check_stock',
      product: {by: 'id', id: 'P120'}
    })
  })

  it('asks which one when "it" could be any of several products', () => {
    const state: ConversationState = {...NEW_STATE, lastProducts: ['P036', 'P052']}
    expect(routeOf('oita ki lal rong e ache?', state)).toMatchObject({tool: 'clarify'})
  })

  it('answers a question about the one product it just showed from that product', () => {
    const state: ConversationState = {...NEW_STATE, lastProducts: ['P001']}
    expect(routeOf('eta ki dry clean korte hobe?', state)).toMatchObject({
      kind: 'answer',
      product: {by: 'id', id: 'P001'}
    })
    expect(routeOf('Is it in stock in red?', state)).toMatchObject({
      tool: 'check_stock',
      product: {by: 'id', id: 'P001'},
      color: 'red'
    })
  })

  it('carries a delivery question over to another place', () => {
    const state: ConversationState = {...NEW_STATE, lastTool: 'delivery_fee'}
    const decided = routeOf('ar Chittagong e?', state)
    expect(decided.kind === 'tool' && decided.tool === 'delivery_fee' && decided.place?.key).toBe(
      'chattogram'
    )
  })

  it('takes the phone number for a callback it asked for', () => {
    const {state} = turn(NEW_STATE, 'please call me', {
      tool: 'request_callback',
      outcome: 'missing'
    })
    expect(routeOf('01012345678', state)).toMatchObject({
      tool: 'request_callback',
      phone: '01012345678',
      question: 'please call me'
    })
  })

  it('remembers the products a reply showed', () => {
    const state = applyResult(
      NEW_STATE,
      {kind: 'answer', reason: 'open question'},
      {tool: 'smalltalk', kind: 'thanks'},
      ['P007', 'F02']
    )
    expect(state.lastProducts).toEqual(['P007'])
  })
})
