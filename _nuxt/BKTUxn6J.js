const e=`### Making LLM output trustworthy

# You can't debug what you can't see: observability for LLM features

When a user reports a bad answer from an LLM feature, you need to reconstruct exactly what the model was asked, what it returned, which tools it called, whether those calls succeeded, and how long each took. If you cannot do that from stored records, you are not debugging — you are guessing at a run that no longer exists.

This is the part of building with models that engineers find most uncomfortable, and the discomfort is legitimate. We are used to systems we can step through. Set a breakpoint, inspect a variable, trace the flow. With a model at the centre of the system, all of that goes away: there is an opaque box, and the only things you can inspect are what went in and what came out. Which means the instrumentation *is* the debugger, and it has to be built before you need it.

## What has to be recorded?

Everything about every call, tied to a run id. There is no useful subset — the field you didn't log is the one the incident is about.

| Layer | What to capture |
|---|---|
| **Request** | Complete prompt text as sent, model, temperature and other parameters, input token count |
| **Response** | Raw output text, output token count, finish reason, latency |
| **Tools** | Each call, its arguments, whether it succeeded, its duration, what came back |
| **Run** | Run id, which node/step, sequence position, total elapsed, terminal outcome |
| **Validation** | Schema violations, retry count, what the retry changed |
| **Identity** | Which user, which session, which version of the prompt |

Two of those are routinely missed and both hurt.

**The complete prompt as sent** — not the template, the rendered result. Templates get interpolated with retrieved context, conversation history, and user input; the bug is almost always in what got interpolated. Storing the template tells you nothing you didn't already know.

**The prompt version.** When you change a prompt, past records must still say which version produced them, or your history becomes uninterpretable at exactly the moment you want to ask "did last week's change cause this?"

## Why does the raw prompt matter so much?

Because in a retrieval-backed system, most bad answers are retrieval failures wearing a costume.

The reported symptom is "the model made something up." The actual cause, most of the time, is that the model was handed the wrong context, or no context, or context about a different entity with a similar name — and it answered the question it was given, correctly, from material that was wrong. Nothing about the response reveals this. Only the prompt does.

Without the rendered prompt you will spend the investigation rewriting instructions to fix a retrieval bug, which does not work, and then conclude the model is unreliable, which is not the finding.

## What do you do with it once it's stored?

Two views, for two audiences. This split is worth building deliberately, because a single view serves neither.

**A conversation view** — what the user said, what came back, which path it took, whether the action succeeded, how long it took. This is what a product owner or support person needs, and it is what makes a non-technical stakeholder willing to trust the system, because it shows what the thing is actually doing rather than what it was supposed to do.

**A technical view** — the full prompts, the raw completions, token counts, parameters, the intermediate steps, the validation failures. This is where an engineer lives during an incident.

Both read from the same records. That shared grounding is more valuable than it sounds: when a stakeholder says "it keeps getting this wrong" and an engineer says "the tool call is failing," they should be looking at two renderings of one dataset rather than two anecdotes.

## What does the instrumentation tell you that debugging doesn't?

It turns three fuzzy questions into measurements you can watch over time.

**Where the cost is.** Token counts per step, aggregated by feature, reveal which use case is quietly expensive. Almost always there is one prompt pattern generating bloated completions that add nothing, and it is invisible until you sum it. This is the raw material for [pricing the feature honestly](/blog/what-an-llm-feature-costs-to-run).

**Where the time is.** Per-step latency shows whether you are slow because of the model, because of a tool call, or because of a retry loop nobody knew was running. These have completely different fixes and they are indistinguishable from the outside.

**Where the failures cluster.** Validation violation rates by step, tool failure rates by tool, retry counts by input type. This is how you find out that one node accounts for most of your incidents — which then makes it obvious where the next week of work goes.

That third one is the reason to log validation failures as first-class events rather than swallowing them in a retry. A retry that silently succeeds is a bug that never gets fixed and a cost you never see.

## What about privacy?

Store a masked copy alongside the raw one, and decide the retention window before you turn logging on rather than after someone asks.

Full prompt capture means you are storing whatever the user typed and whatever your retrieval pulled in, which in most products includes personal data. That is a real obligation and it is easier to handle at design time: keep a redacted version for the analytics and dashboards that most people use, keep the raw version under tighter access and a shorter retention for incident work, and make sure whoever is debugging knows which one they are looking at.

The wrong resolution is to log less. Logging less does not make you compliant, it makes you blind — and a system nobody can inspect is a worse privacy risk than one you can audit, because you cannot answer questions about what it did.

## When should you build this?

Before the feature ships. Not after the first incident, because after the first incident the run you needed is gone.

This is the argument I make most often and win least often, so let me make it concretely. The first serious bug report on an LLM feature is always some version of "it gave a wrong answer to this user last Tuesday." If you have records, that is an afternoon: pull the run, read the prompt, find the retrieval that went wrong, fix it, add the input to your [case set](/blog/how-to-evaluate-an-llm-feature). If you do not, it is a week of trying to reproduce a stochastic event from a paraphrased description, usually ending in a prompt change that may or may not have addressed anything.

Instrumentation is not the polish you add once it works. On a system whose core component is a black box, it is the minimum viable level of visibility — the thing that turns an agent from a demo into a component of your product that you can actually operate.

---

*Part 4 of [Making LLM output trustworthy](/blog?series=trustworthy-llm-output). Start from [the pillar post](/blog/how-to-evaluate-an-llm-feature) if you came in here.*
`;export{e as default};
