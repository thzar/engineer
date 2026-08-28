const e=`### The architecture and cost of LLM features

# Where AI belongs in your architecture — and where it doesn't

Most production systems should use a model at the edges and deterministic code in the core. Models are good at turning messy input into clean structured intent, and at turning structure back into readable language. They are bad at being the engine in the middle, where lookups, arithmetic and rule application happen. Route through the model once on the way in, run ordinary code in the middle, and optionally route through the model once on the way out.

That is not a complicated idea. What is striking is how much of what sits on AI roadmaps violates it — and how much of that becomes indefensible the moment someone looks honestly at the bill.

## What is the question to ask before adding AI to anything?

**Can you write the rule?**

If a moderately experienced engineer could describe the logic in a paragraph, write the logic. Code is cheaper to run, faster to execute, easier to test, and behaves identically next quarter. The model you deployed this year may not exist next year; your \`if\` statement will.

A model earns its place when the input space is genuinely unbounded or the output is genuinely generative. Unstructured text from a person, a document you have never seen, a judgement about tone — problems where rules either cannot be written or would take a thousand of them. Drafting, summarising, translating, classifying on fuzzy criteria: cases where "approximately right" is an acceptable outcome and the realistic alternative is *doing it by hand*, or not at all.

That last clause is the actual test. In every case where a model is the right tool, the alternative is not a cheaper version of the same thing — it is manual work or nothing.

## Which patterns don't need a model?

Walk your roadmap and check whether any of these describe what is being built.

- **Routing into a known taxonomy.** Fixed categories, stable signals — a classifier or a set of conditionals will beat a model on accuracy, speed and cost simultaneously. This is one of the most common misplacements and one of the easiest to reverse.
- **Moving data between systems.** Webhooks and queues have done this for thirty years. Asking a model where to put a row is theatre.
- **Calculations.** Models are not calculators. If the answer can be computed, compute it.
- **Lookups against your own database.** Querying the database is faster than asking a model to recall what is in it, and it is correct.
- **A search box rebuilt as a chatbot.** Most people searching your product want to find a thing, not have a conversation about finding a thing. The chat interface adds latency and removes precision.
- **A scheduled job relabelled as an agent.** Fixed schedule, known steps: that is a cron job. The name does not change what it is.
- **Generated SQL against a stable schema.** If the schema is fixed and the queries are parameterisable, write the queries.

The predictable objection is that agents reason across tool calls, so surely that *is* the engine in the middle. But orchestration is not reasoning. Most production agents are [state machines where a model picks the transition](/blog/an-agent-is-a-state-machine) — and when the transitions are knowable, choosing them in code is strictly better. Where they genuinely are not knowable, the model is doing real work, and that work belongs at the edge of a deterministic flow rather than in place of one.

## Where does a model genuinely earn its keep?

- **Extracting structure from unstructured input.** Résumés, contracts, emails, tickets, transcripts. Turning prose into rows is the job models were built for.
- **Drafting from intent.** A first version of an email, a summary, a lesson, a code change. The model is not intimidated by a blank page; the human knows how to edit.
- **Judgement on fuzzy criteria.** "Does this read as frustrated?" "Is this on-brand?" Things you could write a rubric for but not a regex.
- **Translating between registers.** Plain English to a query, legal prose to plain English, a changelog to release notes.
- **Handling the residue.** When deterministic code covers the bulk and what remains is a mess of one-offs, a model is often the right way to mop up.

## Why is this suddenly urgent?

Because for a couple of years the cost of building this way was hidden inside promotional pricing, and it is becoming visible.

Three things are legible at once now, and each one independently punishes misplacement:

**Cost.** Per-token pricing is real and increasingly non-promotional. A workload that cost a comfortable few hundred a month can land somewhere very different at production volume — and the shape of the increase is not linear in users, it is linear in *steps per interaction*, which nobody tracks.

**Latency.** A function call returns in single-digit milliseconds. A frontier-model call has a time-to-first-token measured in hundreds of milliseconds to seconds, before the body streams. Compound that across a multi-step workflow and the user-visible delay stops being a UX detail and becomes a product problem.

**Reliability.** Deterministic code passes the same input through the same logic every time. Models do not. The variance is bounded enough to ship and unbounded enough to break things — which is exactly why [you have to measure it](/blog/how-to-evaluate-an-llm-feature) rather than assume it.

None of this is an argument against AI. It is an argument for taking it seriously enough to put it where it earns its keep, and not where it doesn't.

## A heuristic worth giving your team

**Build the deterministic version first. If it covers the common case, ship it. Use the model only for the residual.**

This inverts the default of the last two years. Instead of asking *where can we add AI?*, the question becomes *where does ordinary code fail, and is that failure worth the cost of a model call to fix?* Most of the time the answer is no. Sometimes it is emphatically yes, and those are the places where a model compounds instead of just accumulating.

There is a useful corollary for reviewing a roadmap: **any AI feature whose team cannot articulate what the deterministic version would have looked like, and why it wasn't enough, probably shouldn't exist.** Not because the model is the wrong tool, but because nobody has done the work of understanding the problem yet.

## What good looks like

The systems that hold up are not the ones burning the most tokens. They are the ones using tokens like a scalpel — at the edges where a model shines, in the residue where rules cannot reach, and boring reliable code everywhere else.

Concretely, that produces an architecture with a recognisable shape. One model call to parse intent. Deterministic code doing the retrieval, the arithmetic, the rules, the persistence. Optionally one model call to render the result in language. Every step in the middle testable, priceable, and identical on Tuesday.

The pricing shift is doing a favour here. It is making the question *do we actually need a model at this step?* impossible to avoid — and that question, asked honestly, removes more risk from an AI roadmap than any amount of prompt engineering.

---

*This is the pillar post for [The architecture and cost of LLM features](/blog?series=llm-architecture-and-cost).*
`;export{e as default};
