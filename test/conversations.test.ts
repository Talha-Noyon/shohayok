import {describe} from 'vitest'

import {MemoryConversations} from '../src/store/conversations.js'
import {conversationContract} from './helpers/conversationContract.js'

describe('MemoryConversations', () => {
  conversationContract(async () => new MemoryConversations())
})
