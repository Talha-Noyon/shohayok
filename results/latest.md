Measured 2026-11-26 against MongoDB Atlas (Atlas vector search, top 4), embeddings `nvidia/nemotron-3.5-embed-1b:free` and answers `nvidia/nemotron-3-ultra-550b-a55b:free`, both free on OpenRouter. 81 of 107 cases.

| | English | Bangla | Banglish | All |
|---|---|---|---|---|
| Cases | 36 | 23 | 22 | 81 |
| Went to the right place | 100% | 100% | 100% | 100% |
| Read the right order, place, product and filters | 100% | 100% | 100% | 100% |
| Reply states the expected facts | 100% | 100% | 100% | 100% |
| Reply in the customer's language | 100% | 100% | 100% | 100% |

Routing by kind of case: tool 100% of 50, answer 100% of 19, followup 100% of 12.

Safety: none of the 11 replies checked for leaks showed another customer's order, a phone number or the prompt.

Search, over 19 open questions with a known document: right document first 89%, in the top 3 100%, mean reciprocal rank 0.94.

Handoff at cosine 0.25: precision –, recall –, over 21 open questions.

| Cost and speed | Replies from shop data | Model answers |
|---|---|---|
| Turns | 60 | 21 |
| Model requests per turn | 0.0 | 1.0 on average, 1 at most |
| Reply time, p50 | 60 ms | 4.7 s |
| Reply time, p95 | 119 ms | 9.7 s |
| First word, p50 | – | 3.7 s |

The run spent 22 free model requests in all. The 40 open questions were embedded ahead in 1 request(s), so their turns show no embedding request and their reply times leave out one embedding call. Times include the network and the free providers’ queues.

## Failed checks

Every case passed every check.
