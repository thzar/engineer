const e=`### The architecture and cost of LLM features

# Context is the hard part, and nobody sets out to build it

The reason an AI feature works in one company and fails in another is almost never the model. It is that one of them can answer, in a machine-readable way, what its own systems mean — and the other cannot. Assembling that answer is most of the work, it is unglamorous, and it is rarely what anyone thinks they are signing up for.

The demo you saw worked because someone hand-fed it clean context. Production has twelve years of accumulated decisions, three systems that disagree about what a customer is, and business rules that exist only in the memory of someone who left.

## Why do agents fail on real systems specifically?

Because a model handed ambiguous inputs does not stop. It picks.

A person looking at two records with different addresses for the same customer applies judgement: this one is a typo, that one is the billing address, this is the one that matters. A model sees two values. It either chooses arbitrarily or refuses. Both break trust — the first silently, which is worse.

Multiply that by every place your systems disagree. One calls it an active customer, another a current account, a third has three status fields that all mean slightly different things and nobody remembers why. Every one of those is a place where an agent will guess, and where its guess will be indistinguishable from an answer.

That is why the benchmark results on realistic enterprise environments are so much worse than the demo results. It is not that the tasks are harder in an abstract sense. It is that they require holding a network of interrelated objects in mind and knowing which rules apply — and that knowledge was never written down anywhere the system can read.

## What are the three layers you actually have to build?

**1. Canonical definitions.** Map your core entities across every system the feature will touch, and agree on what each term means. This is not a data-modelling exercise, it is a series of arguments between people, and it cannot be automated because the disagreements are real. Someone has to decide what "active" means. Then you build the transformation logic that enforces it and the validation that catches drift at write time.

**2. Current signals.** A system answering from yesterday's state gives wrong answers today, and users notice within the hour. Identify which changes actually affect the feature's output — not everything, which is a trap that will consume weeks on signals nobody uses — and get those flowing as events. For everything else, be explicit in the design about where the context is allowed to lag, and make sure the people relying on it know.

**3. Quality enforcement.** Duplicates, invalid formats, contradictory records. Humans route around these instinctively; models cannot. Validate at entry, detect duplicates, and put the degradation somewhere visible so it is caught before it multiplies. This is continuous work, not a cleanup project — quality decays as fast as records are created.

The layers only work together. Canonical definitions are worthless if your event stream uses different ones. Real-time updates are worthless if the underlying data is wrong. Enforcement without shared meaning just enforces the wrong thing consistently.

## Do you have to build all of it first?

No, and trying is how these projects die.

Start with the minimum: **one entity, one signal, basic validation.** Get the feature working on limited but accurate context, then expand. The failure mode is the opposite instinct — mapping every entity and every signal before shipping anything, which is a six-month project that produces no feedback and usually ends before it finishes.

Scope creep is the specific risk. Everyone imagines a system that knows everything about the business on day one. Build the context incrementally, validate each layer against something real, then add the next.

## Where does this context come from?

The thing that surprised me most: **you usually cannot buy it, and you often already have it — badly.**

The context that makes a system useful is a record of how work actually flows. Which ticket produced which change, which change went where, which decision was reversed and by whom. Most companies technically have all of this, scattered across a tracker, a repository, a chat log and a pile of call recordings, with nothing connecting them.

What makes it queryable is not the tools. Most teams use roughly the same tools. It is operational discipline around them — every piece of work connected to an artifact, every change referencing the work it addresses, every outcome captured consistently. Without that enforcement you do not have context, you have disconnected data that happens to live in the same systems.

Which explains why this is so hard to retrofit. The barrier is not technical. It is that changing how people record their work means changing habits, incentives and daily rhythms, and organisations resist that far more than they resist a new tool. The architecture is the easy half.

## Where a model genuinely helps

Reading the evidence. Not deciding what is true.

Given code, schemas, logs and the live data, a model can reconstruct how a system behaves far faster than a person reading the same material — infer what a field holds from what values actually appear in it, trace how records link, surface the rule that is still running that everyone believed was retired. That is real leverage and it is where the time savings come from.

What it must not be allowed to do is invent. On anything where a wrong value is a compliance event rather than a bug, the model is held to what the evidence supports: infer meaning, never fabricate it. And whether the inference is right is settled by people against the source. This is the same discipline as [constraining output rather than reviewing it](/blog/constrain-the-model-dont-review-it) — the model does the reading, the validator and the expert do the deciding.

The split that works: **the model does the grind, and every call requiring judgement goes to someone qualified to make it.** That sounds like a platitude until you notice how many projects invert it — automating the judgement and leaving humans to do the reading.

## What this means for a build

Three things I would want any team to internalise before starting:

- **Budget for context, not for the model.** The model integration is days. The context work is the project. A plan that has it backwards is a plan that will slip.
- **Bound the expert time and schedule it.** The reason these projects are dreaded is that they historically ate the best people for months, open-endedly. The fix is to arrive with a reconstructed understanding for them to *confirm*, plus a short specific list of genuine questions, rather than arriving with "so how does this work?" Scoped and scheduled is a different thing from an unbounded drain, even when the total hours are similar.
- **Expect to say no sometimes.** If the boundaries around a subsystem cannot be drawn cleanly, that is worth saying before starting rather than after. A feature built on context that cannot be made coherent will not become reliable later.

Nobody sets out to build a context layer. They set out to ship a feature, discover the feature needs to know things, and find out that nothing in the company can be asked a question. The context layer is what you build when you take that seriously — and it is the part that stays valuable after the model you started with has been replaced.

---

*Part 4 of [The architecture and cost of LLM features](/blog?series=llm-architecture-and-cost). Start from [the pillar post](/blog/where-ai-belongs-in-your-architecture) if you came in here.*
`;export{e as default};
