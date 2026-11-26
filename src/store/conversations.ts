import {randomBytes} from 'node:crypto'

import type {Collection} from 'mongodb'

import {NEW_STATE, type ConversationState} from '../agent/state.js'
import {maskPhones} from '../shop/format.js'

export const MAX_MESSAGES = 40
export const CONVERSATION_DAYS = 7

export interface StoredMessage {
  role: 'customer' | 'bot'
  text: string
  at: Date
  /** For bot messages: what was decided and why, for the inspector */
  trace?: unknown
}

export interface Conversation {
  id: string
  visitor: string
  messages: StoredMessage[]
  state: ConversationState
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}

export interface ConversationStore {
  get(id: string): Promise<Conversation | null>
  create(visitor: string): Promise<Conversation>
  /** Adds messages, keeping the latest MAX_MESSAGES, and replaces the state */
  append(id: string, messages: StoredMessage[], state: ConversationState): Promise<void>
}

/** 128 random bits: knowing the id is what lets a browser read its conversation back */
export function newConversationId(): string {
  return randomBytes(16).toString('base64url')
}

const expiry = (from: number) => new Date(from + CONVERSATION_DAYS * 86_400_000)

/** Phone numbers are needed for one lookup, not for a week of stored history */
const scrub = (messages: StoredMessage[]) =>
  messages.map((message) => ({...message, text: maskPhones(message.text)}))

function fresh(visitor: string): Conversation {
  const now = Date.now()
  return {
    id: newConversationId(),
    visitor,
    messages: [],
    state: NEW_STATE,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    expiresAt: expiry(now)
  }
}

export type ConversationDoc = Omit<Conversation, 'id'> & {_id: string}

/** One document per conversation, deleted by a TTL index a week after the last message */
export class MongoConversations implements ConversationStore {
  private readonly docs: Collection<ConversationDoc>

  constructor(docs: Collection<ConversationDoc>) {
    this.docs = docs
  }

  async get(id: string): Promise<Conversation | null> {
    const doc = await this.docs.findOne({_id: id})
    if (!doc) return null
    const {_id, ...rest} = doc
    return {id: _id, ...rest}
  }

  async create(visitor: string): Promise<Conversation> {
    const conversation = fresh(visitor)
    const {id, ...rest} = conversation
    await this.docs.insertOne({_id: id, ...rest})
    return conversation
  }

  async append(id: string, messages: StoredMessage[], state: ConversationState): Promise<void> {
    const now = Date.now()
    await this.docs.updateOne(
      {_id: id},
      {
        $push: {messages: {$each: scrub(messages), $slice: -MAX_MESSAGES}},
        $set: {state, updatedAt: new Date(now), expiresAt: expiry(now)}
      }
    )
  }
}

export class MemoryConversations implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>()

  async get(id: string): Promise<Conversation | null> {
    const conversation = this.conversations.get(id)
    return conversation ? structuredClone(conversation) : null
  }

  async create(visitor: string): Promise<Conversation> {
    const conversation = fresh(visitor)
    this.conversations.set(conversation.id, conversation)
    return structuredClone(conversation)
  }

  async append(id: string, messages: StoredMessage[], state: ConversationState): Promise<void> {
    const conversation = this.conversations.get(id)
    if (!conversation) return
    const now = Date.now()
    conversation.messages = [...conversation.messages, ...scrub(messages)].slice(-MAX_MESSAGES)
    conversation.state = structuredClone(state)
    conversation.updatedAt = new Date(now)
    conversation.expiresAt = expiry(now)
  }
}
