# Shohayok (সহায়ক) design

Shohayok answers customer-support questions for a fictional Bangladeshi online shop, in the language the customer used: Bangla script, Banglish (Bengali written in Latin letters) or English. It runs on open models, locally through Ollama on one 12 GB GPU or in the cloud through OpenRouter, with MongoDB as the only database.

## Goals

- Answer only from the shop's own catalogue and policies, and cite the documents used.
- Handle Banglish, which most retrieval stacks treat as noise.
- Hand off to a human when the answer is not in the data, instead of guessing.
- Measure retrieval quality, answer quality, language match and latency with one command.
- Run on a single consumer GPU: an RTX 5070 with 12 GB of VRAM.
- Also run without a GPU, through OpenRouter's free models.

## Non-goals

- Multi-turn memory. Each question is answered on its own.
- Authentication, order lookup or any write action.
- Real customer data. The shop, its products and its policies are invented.

## Decisions

| Decision        | Chosen                                                                                                      | Considered                             | Why                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Model provider  | Ollama, or OpenRouter, chosen separately for answers and for embeddings                                     | Ollama only                            | OpenRouter runs the project on a laptop without a GPU. One interface keeps the pipeline unaware of the provider. |
| Embeddings      | `bge-m3`, 1024 dimensions, on either provider                                                               | `nomic-embed-text`, `multilingual-e5`  | Strong multilingual retrieval including Bengali, and both providers serve it.                                    |
| Chat model      | `gemma3:12b` on Ollama, `google/gemma-4-31b-it:free` on OpenRouter, configurable                            | `qwen3:8b`, `gemma3:4b`                | Gemma covers Bengali well. The 12B Q4 build plus `bge-m3` fit in 12 GB, and Gemma 4 is free on OpenRouter.       |
| Vector search   | Atlas Vector Search when available, else cosine in the app over vectors stored in MongoDB                   | A separate vector database             | The point is RAG on MongoDB. The fallback keeps it running on MongoDB 6+ without Atlas.                          |
| Keyword search  | MongoDB `$text` index with language `none`                                                                  | Atlas Search                           | `$text` works on every MongoDB, and Bengali has no stemmer there anyway.                                         |
| Fusion          | Reciprocal rank fusion of every query variant and both searches                                             | Score blending                         | Rank fusion needs no score calibration across vector and keyword scores.                                         |
| Banglish        | Detect it, ask the model to rewrite the question into Bangla script and English, then search with all three | Rule-based transliteration, or nothing | Romanised Bengali spelling varies too much for rules. The eval measures what the rewrite adds.                   |
| Answer language | Decided by the detector and stated in the prompt                                                            | Let the model infer it                 | Explicit is more reliable with small models.                                                                     |
| Handoff         | Skip generation when the best cosine similarity is below a threshold                                        | Ask the model to refuse                | Cheaper and testable. The eval sweeps thresholds to pick the value.                                              |
| API             | Express 5, one POST endpoint streaming NDJSON                                                               | Server-sent events                     | `EventSource` only does GET, and NDJSON reads easily with `fetch`.                                               |
| UI              | One static page, no build step                                                                              | React                                  | The project is about the pipeline; the page only has to show it working.                                         |

## Pipeline

1. **Detect** the language: Bengali-script share, then a word list of common Banglish function words.
2. **Rewrite** Banglish questions into Bangla script and English with a JSON-schema response. A failed rewrite falls back to the original question.
3. **Embed** every query variant in one call.
4. **Search** each variant with vector search and `$text`, then fuse all lists with reciprocal rank fusion.
5. **Decide**: below the confidence threshold, return a fixed handoff message in the customer's language.
6. **Generate** an answer from the top chunks, streamed token by token, citing document ids.

Every stage is timed, and the timings travel with the response.

## Error handling

- Ollama unreachable or a model missing: the doctor command and the API say which model to pull.
- OpenRouter key missing or rejected: startup and the doctor command say to check `OPENROUTER_API_KEY`.
- OpenRouter rate limits: the client waits and retries on per-minute limits and overloaded providers, and stops at the daily free-model limit with a message saying when it resets.
- A paid OpenRouter model without credits: the error says to add credits or choose a `:free` model.
- A free model that refuses JSON schemas: the rewrite asks again without one and parses the answer loosely.
- Embedding model changed since ingest: startup refuses with a clear message, because vectors of different models cannot be compared.
- A `mongodb+srv` lookup that fails with `querySrv ECONNREFUSED`: some Windows setups give Node's resolver a DNS server that refuses, while the system resolver works. `DNS_SERVERS` points Node at servers that answer.
- Rewrite fails or returns bad JSON: the pipeline continues with the original question.
- Client disconnects: the request's abort signal stops generation.

## Testing

- Unit tests for every model-free module: detection, digits, chunking, fusion, vector maths, prompts, handoff, metrics and the report.
- The Ollama and OpenRouter clients are tested against fake HTTP servers, including streams split across network reads, rate limits and rejected keys.
- MongoDB integration tests run the whole app once per provider against a local server when one is reachable, and are skipped otherwise.
- `npm run eval` measures the whole pipeline on 51 labelled questions in three languages.

## Assumptions made while building

- The project was built on a laptop without a GPU or Ollama, so the local numbers are produced on the RTX 5070 machine.
- Defaults are chosen for 12 GB of VRAM and can be changed in `.env`.
- The OpenRouter defaults come from its live model list on 2026-11-25. Free models come and go, so their ids may need updating.
