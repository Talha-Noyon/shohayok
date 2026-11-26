export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type ProviderName = 'ollama' | 'openrouter'

/** Filled in by the provider during a call */
export interface ChatInfo {
  /** The model that answered, which may be a fallback from a list */
  model?: string
}

/**
 * What the app needs from a model provider. Ollama and OpenRouter both implement it, so the
 * pipeline never knows which one answers.
 */
export interface LlmProvider {
  readonly name: ProviderName
  listModels(): Promise<string[]>
  embed(model: string, input: string[]): Promise<number[][]>
  /** One complete answer that should be JSON matching `schema` */
  chatJson(
    model: string,
    messages: ChatMessage[],
    schema: object,
    info?: ChatInfo
  ): Promise<unknown>
  /** The answer as it is generated */
  chatStream(
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal,
    info?: ChatInfo
  ): AsyncGenerator<string>
}
