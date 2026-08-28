const e=`### Agents in production

# What it actually takes to put an LLM agent in production

A demo agent has to work once, in front of someone who wants it to work. A production agent has to work on the five-thousandth call, for someone who is annoyed, on input nobody anticipated, without a human watching. Almost all of the engineering lives in the gap between those two sentences, and almost none of it is prompt writing.

I build generative-AI features for a living, and the same conversation happens every time. Someone has a working prototype. It took a weekend. It is genuinely impressive. And then the question arrives — *how long to ship this?* — and the honest answer is much longer than the weekend, for reasons that have nothing to do with the model.

This post is the checklist I actually use. Each item is a place where prototypes reliably break, and each one has its own post in this series.

## Why does the demo work and the product not?

Because a demo is a single sample from a distribution, and you chose it.

Every LLM call is a draw. When you ran the prototype you drew a handful of times, kept the good one, and showed that. Production draws thousands of times and keeps all of them, including the tail. If your agent is right 90% of the time — which feels excellent in a demo — then a five-step workflow where every step must be right completes correctly about 59% of the time. Two out of five users get a broken result.

That is the whole problem in one line. Everything below is a way of either raising the per-step number, reducing the number of steps that have to be right, or making the failures cheap and visible instead of silent and expensive.

## What separates a demo from a production agent?

| Concern | Demo | Production |
|---|---|---|
| Scope | "It can handle anything" | One task, tightly bounded |
| Output | Prose a human reads | A structure a machine validates |
| Control flow | The model decides every step | Code decides; the model fills gaps |
| Duration | Runs inside a request | Runs in a queue, streams progress |
| Failure | You retry by hand | Retries, timeouts, a dead-letter path |
| Correctness | "It looked right" | A graded case set, run on every change |
| Visibility | Terminal output | Traced calls, token counts, latencies |
| Cost | Your API key | A per-call budget, with a ceiling |

The rest of this post walks the column on the right.

## How narrow should the agent be?

Narrower than feels satisfying. A system that does one thing reliably beats a system that does eight things unpredictably, and it is not close — because a user who gets burned once stops trusting the feature for everything.

Narrow scope is not a limitation you accept, it is the mechanism that makes the rest possible. A bounded task has a describable output, and a describable output can be validated. A bounded task has a finite set of failure modes, and a finite set of failure modes can be tested. "Answer questions about our product" has neither.

The practical test: can you write down, in one paragraph, what a correct output looks like — specifically enough that someone who has never seen the feature could grade fifty of them the same way you would? If not, you do not yet have a task, you have a wish. That is a scoping problem, not a model problem, and no amount of prompt iteration fixes it.

More on this in [Your agent doesn't need to be smart. It needs to be narrow](/blog/narrow-agents-beat-smart-ones).

## Should the model choose what happens next?

Usually not. Most things called agents are state machines where an LLM picks the transition, and in most of those the transitions are already known at design time. When you know them, encode them.

This matters more than it sounds. Every decision you hand to the model is a decision that can go differently on Tuesday. Every decision you write in code is one that cannot. The model earns its place at the steps where the input is genuinely unbounded — parsing a messy request into a structured intent, drafting text, judging something fuzzy — and it costs you reliability everywhere else.

The generation pipeline I run on my own platform is a graph with explicitly declared nodes and edges. The model does the work *inside* nodes. It does not decide which node comes next, because I already know which node comes next. That single constraint removes an entire class of production incident.

More in [An agent is a state machine with an LLM picking the transitions](/blog/an-agent-is-a-state-machine).

## Where should the work actually run?

Not in the HTTP request. An LLM call that takes ten seconds is a request that occupies a worker for ten seconds; a chain of six of them is a request that times out at whatever proxy sits in front of you.

Long-running generation belongs on a queue, with progress streamed back over a separate channel. That is not an optimisation, it is the only shape that survives concurrency: it lets you size the number of in-flight model calls against what your provider will actually serve, retry a failed step without redoing the successful ones, and show the user something moving instead of a spinner and a hope.

It also changes the product. Once work is asynchronous you can afford steps that would never fit in a request budget — a second pass that checks the first, a validation loop that retries on a schema violation, a fan-out across ten units of a course. Latency stops being the constraint on how careful the system is allowed to be.

More in [Long-running agents belong in a queue, not a request](/blog/long-running-agents-belong-in-a-queue).

## How do you know the output is any good?

You grade it, on a fixed set of cases, on every change. There is no substitute and no shortcut, and this is the step teams skip.

The reason they skip it is that it feels unrewarding: writing thirty test cases and a rubric produces no visible feature. But without it you cannot answer the only question that matters when you change a prompt — *did that make it better or worse?* Eyeballing three outputs cannot answer it, because three outputs is not a sample, it is an anecdote.

Two things make an eval set worth having. First, write the expected answers **before** you look at what the system produces, or you will unconsciously grade toward what it already does. Second, build the set adversarially: the ordinary cases tell you almost nothing, because every version passes them. The cases that separate a good system from a bad one are the ambiguous input, the input with a missing field, the question your data genuinely cannot answer. A system that says "I don't know" when it doesn't know is worth more than one that is confidently wrong — and only an adversarial set shows you which one you built.

More in [How to evaluate an LLM feature before you ship it](/blog/how-to-evaluate-an-llm-feature).

## How do you stop the output from drifting?

Constrain it rather than review it. If the output has to satisfy a schema, validate against the schema and retry on failure — a machine check that runs every time beats a human check that runs when someone remembers.

This is the single highest-leverage change available in most LLM features, and it is underused because "add a reviewer" is the intuitive fix. It is the wrong fix: reviewers are a queue, and queues grow. A constraint is a property of the system.

On my platform the generated content has to render on a timeline engine that only understands a fixed command vocabulary. That is not a limitation I worked around — it is the reason the output is dependable. Free-form prose from a model is a thing you hope is right. A command sequence that either parses against a known set of plugin commands or does not is a thing you *know* is right, and when it isn't, you find out in a validator rather than in front of a learner.

More in [Constrain the model, don't review its output](/blog/constrain-the-model-dont-review-it).

## What does it cost when it runs at volume?

More than the prototype suggested, and the surprise is usually in the failures rather than the successes.

The intuition everyone brings is that a failed call is a cheap call — the agent tried, it couldn't, it handed off, no harm done. The opposite is true. The interactions where an agent works hardest are the ones where it retrieves, retries, calls another tool, tries an alternative path, and eventually gives up. Every one of those steps is billed. Then a human does the work anyway. You pay twice, and you pay most on exactly the cases the system handles worst.

This does not show up in a pilot, because at fifty calls a day the expensive tail is noise. It shows up at production volume, in a bill nobody modelled. Budget by behaviour — quick successes, expensive successes, expensive failures — not by an average, and put a hard ceiling on how many steps a single interaction may consume.

More in [What an LLM feature actually costs to run](/blog/what-an-llm-feature-costs-to-run) and [The most expensive call is the one that fails after trying hardest](/blog/the-most-expensive-call-is-the-one-that-fails).

## What do you need to be able to see?

Every model call, with its full prompt, its output, its token counts, its latency, and the id of the run it belonged to. If you cannot reconstruct exactly what the model was asked when a user reports a bad answer, you are not debugging, you are guessing.

This is a bigger shift than it looks. Ordinary software lets you step through the logic; here the logic is inside a black box and the only things you can inspect are what went in and what came out. So the instrumentation *is* the debugger, and it has to exist before you need it — after an incident is too late, because the run is gone.

More in [You can't debug what you can't see](/blog/observability-for-llm-features).

## Where to start

If you have a prototype and a deadline, do these three first, in this order. They are the ones that pay back immediately:

1. **Write the eval set.** Thirty cases, expected answers written first, at least a third of them adversarial. Everything else becomes measurable once this exists.
2. **Force the output into a schema.** Validate, retry on failure, log every violation. This converts a whole category of silent wrongness into a loud, countable error.
3. **Move the work off the request path.** Queue it, stream progress, make each step individually retryable.

Then instrument, then price it. The prompt — the part everyone starts with — turns out to be the cheapest thing to change once the rest exists, which is exactly why it should not be what you spend the first month on.

---

*This is the pillar post for the [Agents in production](/blog?series=agents-in-production) series.*
`;export{e as default};
