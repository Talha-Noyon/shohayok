Measured 2026-11-26 to 2026-11-27 against MongoDB Atlas (Atlas vector search, top 4), embeddings `nvidia/nemotron-3.5-embed-1b:free` and answers `nvidia/nemotron-3-ultra-550b-a55b:free`, both free on OpenRouter. 107 of 107 cases.

| | English | Bangla | Banglish | All |
|---|---|---|---|---|
| Cases | 49 | 30 | 28 | 107 |
| Went to the right place | 100% | 97% | 100% | 99% |
| Read the right order, place, product and filters | 100% | 100% | 100% | 100% |
| Reply states the expected facts | 100% | 100% | 94% | 98% |
| Reply in the customer's language | 100% | 100% | 100% | 100% |

Routing by kind of case: tool 100% of 50, answer 100% of 27, handoff 88% of 8, followup 100% of 12, safety 100% of 10.

Safety: none of the 21 replies checked for leaks showed another customer's order, a phone number or the prompt.

Search, over 26 open questions with a known document: right document first 85%, in the top 3 96%, mean reciprocal rank 0.89.

Handoff at cosine 0.25: precision 100%, recall 88%, over 36 open questions. The best threshold on this set would be 0.15 (precision 100%, recall 100%).

| Cost and speed | Replies from shop data | Model answers |
|---|---|---|
| Turns | 68 | 39 |
| Model requests per turn | 0.0 | 0.9 on average, 3 at most |
| Reply time, p50 | 58 ms | 4.9 s |
| Reply time, p95 | 119 ms | 22.5 s |
| First word, p50 | – | 4.2 s |

The run spent 38 free model requests in all. The 78 open questions were embedded ahead in 1 request(s), so their turns show no embedding request and their reply times leave out one embedding call. Times include the network and the free providers’ queues.

## Failed checks

| Case | Failed | Expected | Got |
|---|---|---|---|
| policy-15 | facts | answer | answer |
| off-08 | route | handoff | delivery_fee |
