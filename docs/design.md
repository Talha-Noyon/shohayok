# Shohayok (সহায়ক) design

Shohayok is the support assistant of Nodi, a fictional online clothing shop in Bangladesh. Customers write to it in Bangla script, in Banglish (Bengali written in Latin letters) or in English, across several messages, and it answers in the way they wrote. It checks orders, delivery fees and stock from the shop's own data, answers questions from the shop's catalogue and policies, and takes a callback request when it cannot help.

The public demo runs at no cost: Vercel's free plan, a free MongoDB Atlas cluster, and OpenRouter's free models, which allow 50 requests a day for the whole account. Most of the design follows from that budget.

## Goals

- Answer in the customer's own style, Banglish included, across a conversation, with follow-ups like "oitar dam koto?".
- Answer order, delivery, stock and product-filter questions from structured data, with no model call.
- Answer open questions only from the shop's catalogue and policies, citing the documents used.
- Never show an order to someone who does not have both its number and its phone number.
- Keep working when the daily model quota runs out, and say so.
- Show every decision behind an answer in an inspector, so a reader can see why it said what it said.
- Measure routing, retrieval, answers, language match, safety and cost with one command, and check the model-free parts on every pull request.
- Still run fully local through Ollama on one 12 GB GPU.

## Non-goals

- A live agent console or human takeover. A callback request is stored instead.
- Accounts, payments or placing orders.
- Real customer data. Products, orders, phone numbers and policies are invented, and phone numbers use the unassigned 010 prefix.

## The budget

OpenRouter's free models allow 20 requests a minute and 50 a day for accounts that have not bought credits. Paid models are not an option: with no credit, any paid request pushes the balance below zero, and a negative balance can block the free models too. So embeddings also use a free model, and every request is counted.

| Turn                                  | Model requests | How                                            |
| ------------------------------------- | -------------- | ---------------------------------------------- |
| Order status, delivery fee, stock     | 0              | Rules find the details, MongoDB has the answer |
| Product filters ("lal jamdani 5000…") | 0              | A structured query on the products collection  |
| Greetings, thanks, callback request   | 0              | Fixed replies in three languages               |
| Repeated first question               | 0              | Answer cache                                   |
| Open question                         | 2              | One embedding, one answer                      |
| Banglish or follow-up, unresolved     | 3              | Plus one rewrite                               |

A shared daily counter in MongoDB stops public use a few requests short of the limit, and a per-visitor allowance stops one visitor using the whole day. When the quota is spent, rule-based replies keep working, open questions get the closest documents from keyword search with no written answer, and the page says the quota resets at 06:00 in Dhaka (midnight UTC).

## How a turn works

1. **Guard.** Rate limits per visitor, the 500-character cap and the daily budget.
2. **Detect** the language from the share of Bengali script, then a list of common Banglish words.
3. **Read** the message with rules: order numbers, phone numbers, districts and Dhaka areas, sizes, colours, categories, price limits, and intents such as "where is my order" or "talk to a person", in all three scripts and with Bengali digits.
4. **Route.** Structured questions go to a tool. Everything else is an open question.
5. **Tools** answer from MongoDB with fixed replies in the customer's language: `order_status`, `delivery_fee`, `check_stock`, `list_products` and `request_callback`. When a detail is missing, the reply asks for it.
6. **Open questions** are searched as written. If a Banglish question or a follow-up cannot be resolved that way, the model rewrites it into a standalone question in Bengali and English, using the conversation, and the rules and the search run again on the rewrite.
7. **Answer** from the top documents, streamed and cited. Below the confidence threshold, the bot offers a callback instead.
8. **Save** the message with its trace: what was detected, the route, the search hits and scores, the tool call, the model requests used and the timings.

The model rewrites and writes; code decides. Rules pick the tool on the cleaned-up question, so a prompt injection cannot call a tool, and routing is deterministic and testable. The model does the two things rules cannot: understanding messy, multi-turn Banglish, and writing answers from text.

## Data

| Collection      | Holds                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products`      | About 500 generated products: names in Bengali and English with Banglish spellings, category, fabric, price, colours, sizes and stock per variant |
| `orders`        | About 300 generated orders with status timelines, items, payment and courier. Dates shift at ingest so the newest is from yesterday               |
| `chunks`        | Embedded text for products and policies, with `type`, `category`, `colors` and `price` as search filters                                          |
| `conversations` | Messages with their traces, deleted after 7 days                                                                                                  |
| `caches`        | Query embeddings and repeated answers                                                                                                             |
| `usage`         | Daily model-request counters for the whole demo and per visitor                                                                                   |
| `callbacks`     | Callback requests with a ticket number                                                                                                            |

Stock and orders are never embedded. They change, so tools read them at answer time. The data is generated by a seeded script and committed, so every run and every eval sees the same shop. Districts, Dhaka areas, colours and categories live in one vocabulary module that both the generator and the rules use.

## Decisions

| Decision        | Chosen                                                                                                  | Considered                                | Why                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool choice     | Rules on the message, or on the model's rewrite of it                                                   | Model tool calls in a loop                | Free, predictable, testable, and immune to prompt injection. The model is spent only where rules fail.                                                                                |
| Embeddings      | `nvidia/nemotron-3.5-embed-1b:free` on OpenRouter, `bge-m3` on Ollama                                   | `baai/bge-m3` on OpenRouter, the 8B model | Free. On the old corpus it found the right document first for every Bangla and English question, and for 11 of 15 Banglish ones with no rewrite. The 8B model was seven times slower. |
| Chat model      | A list of free models, tried in order through OpenRouter's fallback routing                             | One model                                 | Popular free models are often busy at their provider.                                                                                                                                 |
| Answer language | Banglish and English questions get the English side of the documents, Bangla questions the Bengali side | Both sides for every question             | Bengali script in the context pulls answers into Bengali script, which broke Banglish replies.                                                                                        |
| Vector search   | Atlas Vector Search with filters, else cosine in the app                                                | A separate vector database                | RAG on MongoDB is the point. The fallback runs on any MongoDB 6+.                                                                                                                     |
| Keyword search  | MongoDB `$text` with language `none`, plus Banglish spellings in the indexed text                       | Atlas Search                              | Works on every MongoDB, and the spellings let keyword search find Banglish without a rewrite.                                                                                         |
| Fusion          | Reciprocal rank fusion                                                                                  | Score blending                            | Needs no calibration between vector and keyword scores.                                                                                                                               |
| Conversations   | One document per conversation, messages embedded, capped at 40                                          | A messages collection                     | One read and one write per turn, which suits serverless functions.                                                                                                                    |
| Limits          | Counters in MongoDB with atomic updates                                                                 | In-memory counters                        | Serverless instances share no memory.                                                                                                                                                 |
| Hosting         | One Vercel function for the API, the page on Vercel's CDN                                               | A long-running server                     | Free, and streaming responses work.                                                                                                                                                   |
| UI              | React, Vite and Tailwind                                                                                | The static page                           | The inspector has enough state to need components.                                                                                                                                    |

## Safety

- Order details need the order number and the phone number on that order. A failed lookup never says which one was wrong, and five failures lock lookups for that conversation.
- Phone numbers are masked in traces and logs.
- Documents and tool results go into the prompt as quoted data, and the prompt says they are not instructions. The model has no tools to call.
- Visitors are counted by a keyed hash of their IP address, never the address itself.
- The eval includes prompt-injection attempts that must not leak data or change behaviour.

## Error handling

- The daily free-model limit, from OpenRouter or from the counter: rule-based replies continue, open questions get keyword results, and the reply says when the quota resets.
- A free model busy upstream: the next model in the list answers. If all are busy, the reply says so.
- A rewrite that fails or returns bad JSON: the turn continues with the customer's own words.
- Ollama unreachable, a model missing, or an OpenRouter key rejected: the doctor command and the API say what to fix.
- An embedding model changed since ingest: startup refuses, because vectors from different models cannot be compared.
- A `mongodb+srv` lookup failing with `querySrv ECONNREFUSED`: `DNS_SERVERS` points Node at DNS servers that answer.
- The client disconnects: the abort signal stops generation.

## Testing

- Unit tests for every model-free module: detection, the rules, routing, tools, templates, limits, prompts, fusion, metrics and the report.
- Both model clients are tested against fake HTTP servers.
- MongoDB integration tests drive whole conversations through the HTTP API with a stand-in model server.
- `npm run eval` scores about 100 labelled cases: three languages, follow-ups, tools, filters, callbacks and prompt injections. It saves progress after each case, so a run can stop at the daily limit and resume the next day.
- `npm run eval -- --offline` scores everything that needs no model, and runs in CI on every pull request.
