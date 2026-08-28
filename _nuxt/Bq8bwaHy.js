const e=`### Agents in production

# Your agent doesn't need to be smart. It needs to be narrow.

A boring agent that produces a useful artifact every single time beats a clever one that produces a brilliant artifact most of the time. Not sometimes — reliably, and by a wide margin, because the value of an automated step is set by its worst case rather than its best one.

This is the least intuitive thing about building with LLMs. Everything about the technology invites you to make the system more capable: the model can hold a conversation, so give it a conversation; it can use tools, so give it all the tools; it can reason, so let it decide. Each of those choices is individually defensible and collectively they produce a system nobody trusts.

## Why does a reliable narrow agent beat a capable broad one?

Because the user's decision is binary and it is made on the failures.

Think about what a person actually does with an automated step. They either stop checking it, or they don't. If they stop checking it, you have bought back their time and the feature is worth something. If they keep checking it, you have bought nothing — they are doing the work of reviewing plus the work of correcting, which is often more effort than doing it themselves.

And the threshold for "keep checking" is brutally low. Two bad outputs in a week is enough. It does not matter that the other forty were excellent, because the person has no way to tell which kind they are looking at without reading it, and reading it is the cost they were trying to avoid.

So the metric that matters is not average quality. It is the rate of outputs bad enough to break trust — and you lower that by narrowing the task, not by improving the model.

## What does "narrow" actually mean?

Four properties. A task is narrow enough when all four hold:

1. **The output has a shape.** Not "a helpful answer" but "a JSON object with these five fields" or "a sequence of commands drawn from this vocabulary." Something a validator can check.
2. **Correctness is describable.** You can write a paragraph that lets a stranger grade fifty outputs the way you would.
3. **The input space is bounded.** You know roughly what arrives. Not every possible sentence a human might type.
4. **The failure mode is known and safe.** When it can't do the job, there is a defined thing it does instead, and that thing is cheap.

If you cannot satisfy all four, you have not scoped a task — and every downstream problem in [the production checklist](/blog/what-it-takes-to-ship-an-llm-agent) becomes unsolvable. You cannot write an eval set for an undescribable output. You cannot constrain a shapeless one. You cannot budget a workflow with no upper bound on steps.

## Broad or narrow: what actually changes

| | Broad agent | Narrow agent |
|---|---|---|
| Prompt | Long, full of caveats | Short, one job |
| Output | Prose | A validated structure |
| Failure | Plausible and wrong | Refuses, or fails a check |
| Testing | Subjective, slow | Automatable |
| Cost per call | Unbounded steps | Capped |
| Model choice | Needs the frontier | Often a smaller one will do |
| User trust | Erodes on the tail | Compounds |

Note the second-to-last row. Narrowing is also how you get to use a cheaper, faster model without a quality cliff — a well-constrained task is one a small model can do, and most of the "we need the best model" instinct is really "our task is under-specified."

## How do you narrow a task that seems inherently broad?

Split it until each piece is boring, then let code hold the pieces together.

The instinct when a task is complex is to reach for a more capable agent. The move that actually works is the opposite: decompose until every model call is individually dull, and put the complexity in the orchestration where it is deterministic and testable.

Concretely, on the platform I build, "generate a course" is exactly the kind of task that invites one big clever agent. It is not one agent. It is a sequence of narrow ones:

- Propose a set of candidate course structures from a prompt. Output: a fixed-shape plan.
- Given a chosen structure, propose the units inside it. Output: a list, same treatment.
- Given a unit item, write the article. Output: markdown with a known section contract.
- Given an article, generate assessment questions of one of five specific types — multiple choice, true/false, fill in the blanks, order the items, match the following. Output: a structure per type, each machine-checkable.

Every one of those is dull. Each has a describable output, a bounded input, and an obvious failure mode. And crucially, a human chooses between the candidates at each stage before the next stage runs, so an error at step one does not silently propagate into forty generated articles.

The thing that would have been impressive — one agent that takes "teach me Linux" and emits a finished course — would also have been the thing nobody could debug, test, price, or trust.

## Doesn't this just make the system rigid?

It makes the *steps* rigid, which is the point, and it leaves the flexibility where it belongs: at the edges, in the hands of a person.

The flexible part of my pipeline is not the model deciding things. It is that a creator can reject a proposed plan, remove a specific item from a list, tweak a draft, and re-run one stage without touching the others. That is more real flexibility than an autonomous agent offers, because it is flexibility the user controls rather than variance the system inflicts.

There is a good rule buried here: **give the user the choices and give the model the labour.** A system that surfaces three plans and lets a human pick is both more capable and more predictable than one that picks by itself, and it is dramatically easier to build.

## When is a broad agent actually right?

When the alternative is nothing. That is the honest test, and it is worth applying seriously rather than as a rhetorical device.

An open-ended assistant over a large document set is a broad task, and it earns its breadth because there is no narrow version — the user genuinely does not know what they want to ask until they ask it, and the fallback is reading everything by hand. Exploratory work, first drafts, brainstorming, anything where the human is going to review the output anyway as part of the workflow: breadth is fine there, because "keep checking it" was never the failure mode. It was the plan.

The trap is the middle. A task that *could* be narrow but was scoped broad because narrow felt unambitious. That is where you get systems that are impressive in a demo, unreliable in production, expensive to run, and impossible to improve — because with no describable output there is nothing to measure, and with nothing to measure there is no way to tell whether last week's prompt change helped.

## The practical move

Take the agent you are building and write down, in one paragraph, what a correct output looks like.

If you can do it: good. That paragraph is your validator, your eval rubric, and your prompt, and the next steps in this series are [forcing the output into that shape](/blog/constrain-the-model-dont-review-it) and [measuring how often you hit it](/blog/how-to-evaluate-an-llm-feature).

If you cannot do it, you have found the actual problem, and it is upstream of anything the model can fix. Split the task and try again on each half. Keep splitting until the paragraph writes itself.

That is the whole discipline. Not smarter agents — smaller ones, wired together by code that does not have opinions.

---

*Part 2 of [Agents in production](/blog?series=agents-in-production). Next: [an agent is a state machine with an LLM picking the transitions](/blog/an-agent-is-a-state-machine).*
`;export{e as default};
