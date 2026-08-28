const e=`### Making LLM output trustworthy

# Constrain the model, don't review its output

When generated output keeps coming out subtly wrong, the reflex is to add a reviewer. It is the wrong fix. Inconsistent output is almost never a capability problem — it is a constraint problem, and the answer is to make the shape of a correct answer part of the system rather than part of someone's judgement.

The tell is that review queues never shrink. You add a reviewer, the output gets marginally more consistent, the queue grows, and the underlying pattern does not change. That is what a symptom-level fix looks like.

## Why does the output look "off" rather than broken?

Because the model has seen thousands of ways to do the thing and none of them are yours.

Ask for a component and you get one that compiles, renders, and works — but the corner radius doesn't match your cards, the empty state has no copy, and the spinner is in a different place than on every other screen. Ask for content and you get prose that is fine in isolation and structurally unlike the last forty pieces. Nothing is wrong. Everything is inconsistent.

That is not bad taste. The model has no idea what your product is. It has never seen your token scale, your section contract, your house rule about what a destructive action feels like. So it improvises, competently, from the median of everything it has read — and improvisation at scale is exactly what incoherence looks like.

Run the same request with the constraints attached and the output is consistent, because now it is following rules. Following rules is the thing language models are genuinely reliable at.

## Where do the constraints have to live?

In the context. Not in Figma, not in Storybook, not in a Confluence page nobody has updated since Q2.

This is the whole practical point and it is easy to nod past. Every one of those artifacts has the same defect: the model never reads it. They exist outside the loop. The constraint has to be something the system ingests before it generates anything — a file next to the code, a schema the output is validated against, a vocabulary the output must draw from.

Which means the constraint document is a different artifact from a design system, and writing it is a different skill from making one. You are specifying, in text, with examples and explicit anti-patterns, what the model is not allowed to invent.

## What does a constraint actually look like?

Four levels, in increasing order of how much they buy you:

| Level | Mechanism | Enforced by |
|---|---|---|
| 1. Instruction | "Always use en-dashes in ranges" | Nothing. Hope |
| 2. Example | Two or three correct outputs, in the prompt | Imitation |
| 3. Schema | A structure the output must satisfy | A validator, on every call |
| 4. Vocabulary | A closed set of tokens/commands the output must draw from | A parser, on every call |

Levels 1 and 2 are worth doing and neither is a guarantee. Levels 3 and 4 are guarantees, because they are checked by a machine rather than absorbed as a suggestion. The jump from 2 to 3 is where a feature stops being something you hope is right.

## The strongest version: give it a vocabulary

The most reliable generative pipeline I have built works because the output has nowhere to be creative in the ways that would hurt.

On my platform, generated lessons are not free-form documents. They are rendered at runtime by a timeline engine that understands a fixed command grammar — every instruction is \`plugin:command\`, drawn from a known set of plugins, plus a handful of engine-level commands the core handles itself. A lesson is a sequence of timed actions in that vocabulary.

That has a consequence worth stating plainly: **a generated lesson either parses or it does not.** There is no category of output that looks fine and is subtly malformed, because "fine" is not a judgement anyone makes — it is a parse. When the model emits a command that does not exist, or an action that references a plugin that isn't loaded, the validator says so, in a worker, before a learner ever sees it. The failure is loud, countable, and attached to a specific step.

Compare that to the alternative I could have built: generate markdown, render it, and have someone read the result. Same model, same prompt, completely different reliability profile — because in the second design the check is a person's attention, and attention is a resource that runs out.

The assessment side works the same way. Questions are not "a quiz." They are one of five declared types — multiple choice, true/false, fill in the blanks, order the items, match the following — each with its own structure. A generated question either fits one of those shapes or it is rejected. There is no free-text question type, deliberately, because a free-text question type is a hole through which unvalidatable output would flow.

## Doesn't constraining it make the output worse?

It makes it narrower, which is usually the same as better, and the failure mode to watch for is real but it is the opposite of what people fear.

Too loose and the model improvises. Too rigid and it cannot express something the product genuinely needs, so it either produces something contorted or fails on inputs it should handle. Judging where that line sits is the actual skill — knowing what to pin down and what to leave open. Specific enough to produce coherence, flexible enough to survive the product changing.

But note which side of the line most teams are on. Almost nobody's problem is that their generated output is too constrained. The common failure by a wide margin is a system with no machine-checkable contract at all, held together by a prompt and a review step.

## How does this change what the work is?

The important design work moves from the artifact to the specification.

If you write the constraint file, you are setting the shape of everything the system will ever produce — including the outputs nobody has generated yet. That is a larger surface area than reviewing outputs one at a time, and it is leverage in the direction that compounds: a rule written once applies to the ten-thousandth generation as reliably as the first.

It also makes the work legible. A review queue is invisible labour that shows up as a bottleneck. A constraint file is a thing in the repository that the team can read, argue with, and change on purpose.

## The move

Take the output your feature produces and ask: **what would a validator check?**

If the answer is "nothing, you'd have to read it," that is the finding. Adding a reviewer will not fix it — it will convert an unbounded quality problem into an unbounded queue. Instead, find the structure hiding inside the output and make it explicit: a schema, a section contract, a closed vocabulary, a set of types.

Then validate on every call, retry on violation with the error fed back in, and log the violation rate. That number is now a metric you can watch, and this is exactly the kind of thing the [eval set](/blog/how-to-evaluate-an-llm-feature) exists to measure. Adding review at the back does not fix a constraints problem. It just makes you feel like you are managing one.

---

*Part 2 of [Making LLM output trustworthy](/blog?series=trustworthy-llm-output). Next: [test one prompt a hundred times](/blog/test-one-prompt-a-hundred-times).*
`;export{e as default};
