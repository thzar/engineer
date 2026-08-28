const e=`### The architecture and cost of LLM features

# What an LLM feature actually costs to run

The price of an LLM feature is not the price of one call. It is the number of model calls per user interaction, multiplied by the tokens each one consumes, multiplied by a retry factor nobody models, plus the retrieval and storage underneath. Teams estimate the first number and get surprised by the product of all four.

The gap is almost never a pricing-page misreading. It is a units problem: you budgeted per call and you are billed per *step*, and the number of steps per interaction is a property of your design that nobody measured.

## What are you actually paying for?

Break it into four buckets, because they scale on different things and only one of them is on the pricing page.

| Bucket | What drives it | Scales with |
|---|---|---|
| **Inference** | Input + output tokens, model tier | Steps per interaction |
| **Retrieval** | Embedding calls, vector store queries, reranking | Corpus size and query volume |
| **Storage** | Vectors, cached context, the [logs you need](/blog/observability-for-llm-features) | Corpus and traffic, cumulatively |
| **Waste** | Retries, failed validations, abandoned runs | Your error rate |

The fourth is the one that ruins forecasts, and it is the only one with no line item anywhere. Every schema violation you retry is a call you paid for and threw away. Every run a user abandons halfway is tokens spent on output nobody read.

## Why do estimates come in low?

Because the model everyone builds assumes failures are free. They are not — they are usually the most expensive thing in the system.

The reasoning goes: if the system can handle it, we pay for the calls; if it can't, it hands off to a human, so no tokens consumed. Zero cost on the failure path. It sounds obviously right and it is exactly backwards.

What actually happens on a hard interaction is that the system tries. It retrieves. It fails to find enough. It tries a different query. It calls a tool. The tool returns something unhelpful. It attempts an alternative path. It eventually gives up. Every one of those steps was billed. *Then* a person does the work anyway.

So the expensive interactions are not the easy ones — they are the ones your system handles worst. That is worth restating because it inverts the intuition completely: **your cost is concentrated on your failures, and it grows as your system gets more sophisticated about trying.** A naive implementation that gives up after two steps is cheaper on the same interaction than a thorough one that exhausts six paths before conceding. Same outcome, several times the bill.

There is more on that specific dynamic in [the most expensive call is the one that fails after trying hardest](/blog/the-most-expensive-call-is-the-one-that-fails).

## How should you model it instead?

Stop thinking in success rate. Think in three behaviours, and price each separately.

- **Quick successes.** One or two model calls. The bulk of your volume, and cheap.
- **Expensive successes.** Several calls, multiple retrievals, maybe a retry. Fewer, more costly each, still good value.
- **Expensive failures.** Many calls before giving up, then the fallback cost — a human, or a lost user.

Your average cost per interaction is meaningless without those three shares, because the third bucket routinely consumes a wildly disproportionate slice of the total while representing a modest slice of the volume.

The metric worth tracking is not deflection rate. It is **successful steps divided by total steps** — how much of what you paid for actually produced an outcome. It correlates with cost in a way that success rate does not, and it moves when you fix the right things.

## Why doesn't the pilot catch this?

Because at pilot volume the expensive tail is statistical noise.

At fifty interactions a day, one interaction that burned twelve steps and then escalated looks like an anomaly in a log. At five thousand a day, that same behaviour is a meaningful share of interactions and a much larger share of spend. The pattern was always there; the pilot just wasn't big enough to make it legible.

This produces systematic underestimation that only appears at production scale, which is the worst possible time. The fix is not a bigger pilot. It is to instrument steps-per-interaction from day one and extrapolate on that number rather than on the average.

## Which levers actually move the bill?

In descending order of effect, in my experience:

1. **Remove steps.** The largest cost reduction available is almost always a model call that did not need to be a model call. This is the [placement question](/blog/where-ai-belongs-in-your-architecture), and it routinely takes an order of magnitude out — a routing step replaced by a classifier, a lookup replaced by a query.
2. **Cap the steps.** A hard ceiling per interaction. After N steps with no progress, stop and fall back. This bounds your worst case, which is the number that actually determines your bill.
3. **Move nodes to cheaper models.** In a [graph where each node has one job](/blog/an-agent-is-a-state-machine), this is a per-node decision with a per-node measurement. Most nodes do not need the frontier model, and you can prove it one node at a time.
4. **Cut output tokens.** Output is typically billed at a multiple of input. Asking for a structured object instead of an explanation is often a large reduction — and it makes the output [validatable](/blog/constrain-the-model-dont-review-it) at the same time.
5. **Cache aggressively.** Identical prefixes, repeated retrievals, stable system prompts. Cheap to add, and it compounds.
6. **Cut input tokens.** The obvious first move, and usually the smallest of these. Worth doing, rarely the answer on its own.

Note that trimming the prompt — the thing everyone tries first — is last. It is visible, satisfying, and mostly marginal compared to deleting a step.

## What should you actually measure?

Four numbers, per feature, from the [call records you are already keeping](/blog/observability-for-llm-features):

- **Model calls per completed interaction** — median and p95. The p95 is your real unit cost.
- **Tokens in and out per call**, by step. Reveals which prompt is quietly bloated.
- **Retry and validation-failure rate**, by step. This is pure waste and it is fixable.
- **Share of spend on interactions that ended in fallback.** If this is large, your cheapest optimisation is failing faster.

Track these from the first week. Retrofitting them means you cannot answer the question during the month it becomes urgent.

## The honest summary

I have deliberately not put dollar figures in this post. Per-token prices change every few months, they differ by provider and tier, and the number that matters for you is a property of your workload rather than of anyone's price list. A figure I published would be stale before it was useful and would tell you about my system rather than yours.

What does not change is the structure: **cost is steps × tokens × retries, the failures dominate, and the pilot will not show you.** Measure steps per interaction, cap the worst case, and delete the model calls that did not need to be model calls. That is most of the available saving, and none of it depends on what the price is this quarter.

---

*Part 2 of [The architecture and cost of LLM features](/blog?series=llm-architecture-and-cost).*
`;export{e as default};
