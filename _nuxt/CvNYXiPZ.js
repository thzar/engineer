const e=`### Making LLM output trustworthy

# How to evaluate an LLM feature before you ship it

You evaluate an LLM feature by writing down what a correct answer looks like *before* you look at what the system produces, running a fixed set of cases on every change, and building that set out of the inputs most likely to break it rather than the ones most likely to pass. Everything else is commentary.

This is the step teams skip, and they skip it for an understandable reason: it produces nothing visible. A week spent on an eval harness ships no feature. But without one you cannot answer the only question that matters when you change a prompt — did that make it better or worse? — and so every subsequent change is a guess dressed as an improvement.

## Why doesn't normal testing work here?

Because normal testing asserts that a function returns a value, and this function returns a different value every time.

Deterministic software has a comfortable property: the same input produces the same output, so one passing test is proof. An LLM call is a sample from a distribution. Running it once and seeing a good answer tells you the distribution contains good answers. It tells you nothing about how often.

That has three consequences that break the usual habits:

- **A single run is not evidence.** You need many samples of the same input to see the shape of what you are shipping.
- **Pass and fail are not binary.** Most outputs are partially right, so you need a rubric, not an assertion.
- **The tail is the product.** Average quality is comfortable and irrelevant; the 5% of outputs bad enough to break trust are what users remember.

None of this means testing is impossible. It means the unit of testing moves from "does this call work" to "what does this distribution look like, and did my change move it."

## What goes in the case set?

Thirty is enough to start. What matters far more than the count is the mix, and the mix should be deliberately unfair.

| Category | Share | Why it earns its place |
|---|---|---|
| Ordinary, well-formed inputs | ~40% | Regression floor. Every version passes; that is the point |
| Ambiguous inputs | ~20% | Two readings are defensible. Does it ask, or does it guess? |
| Incomplete inputs | ~15% | A required field is missing. Does it invent one? |
| Unanswerable inputs | ~15% | Your data genuinely cannot answer. Does it say so? |
| Adversarial or out-of-scope | ~10% | Off-topic, contradictory, or trying to get out of scope |

The instinct is to build the set out of the first row, because those are the cases you thought about when designing the feature. They are also the cases where every version of the system performs identically, which makes them almost worthless for choosing between versions.

The rows that separate a good system from a bad one are the last three. And the last one — unanswerable — is the one most people never test at all, which is unfortunate, because a confident wrong answer is the single most damaging output an LLM feature can produce. It doesn't look wrong. Nobody catches it. It propagates.

**Treat "I don't know" as a correct answer when it is true, and score it as one.** A system that abstains honestly is deployable behind a fallback path. A system that fabricates fluently is not, no matter how well it does on the easy rows.

## How do you score without fooling yourself?

Three rules, all of which exist to stop you from grading toward what the system already does.

**Write the answer key first, without the system.** Research each expected answer by hand before running anything. The moment you have seen the output, your sense of what a good answer looks like has been contaminated by it — you will find yourself accepting an answer because it is plausible rather than because it is right.

**Score blind.** Strip which version or which model produced each output, shuffle them, and grade. This is not paranoia; it is the difference between measuring the system and measuring your hopes for it. It matters most when you are comparing two prompts you wrote, because you know which one you prefer.

**Score on separate axes, not one number.** At minimum: did it produce anything, is the substance correct, did it fabricate, and is it grounded in something citable. Collapsing those into a single score hides the interesting failure — a system can have excellent coverage and terrible truthfulness, and one aggregate number will look fine.

That last split is the one that changes decisions. Coverage — did something come back — tends to be high for everything. Truthfulness is where options actually separate. If you only measure coverage you will conclude the tools are equivalent, and they are not.

## What about using a model to grade?

It works, with a specific caution: the grader must have something to compare against.

Asking a model "is this answer good?" produces a judgement of plausibility, and plausibility is exactly the axis on which fabricated answers score well. That is the failure mode to design around, and it is not hypothetical — a graded case can pass on structure alone. Ask whether a response "describes the product's cold-weather rating," and a response that invents a rating describes one beautifully. The check passes. The fact is fiction.

So: give the grader the reference answer and ask whether the output is consistent with it. That turns a taste judgement into a comparison, which models are much better at.

The practical split:

- **Exact expected values** where a wrong fact is the failure — specifications, figures, dates, anything a user would act on.
- **Semantic pattern matching** where many phrasings are valid — a confirmation message, a greeting, a summary. "Should include a date, a time, and a confirmation" is the right level of assertion there.

Use the strict form wherever fabrication would be costly, and the loose form only where variation is genuinely acceptable. Getting this backwards is how test suites go green while the product is wrong.

## What do you do with the results?

Set a bar, run it on every change, and let it be allowed to block you.

The mechanism is unglamorous. Store the case set in the repo. Run it in CI, or at minimum before any prompt change reaches production. Record the score per axis over time. When a change moves the number down, you now know something you could not have known by looking at three outputs.

Two things make this stick. First, keep the harness cheap to run — if it takes an hour, nobody runs it, and an eval nobody runs is a file. Second, feed production failures back into the set: every time a user reports a bad answer, that input becomes a case. Over a few months the set stops being your guesses about what is hard and becomes a record of what actually is.

## What this is worth

A directional test — thirty cases, a hand-written key, scored blind — is not a statistically powered study, and it should not be presented as one. It is enough to catch a behavioural difference at the edge of a system's competence, and that is usually where the differences are large enough that more samples would be decoration.

It is also, in my experience, the cheapest week of engineering available on an LLM feature. Everything downstream — [constraining the output](/blog/constrain-the-model-dont-review-it), [testing at volume](/blog/test-one-prompt-a-hundred-times), [choosing a cheaper model](/blog/what-an-llm-feature-costs-to-run) — depends on being able to tell whether a change helped. Without the eval set, none of those decisions can be made on evidence. With it, all of them can.

Before you wire a model into anything that answers on your behalf, it is worth a week of yours.

---

*This is the pillar post for [Making LLM output trustworthy](/blog?series=trustworthy-llm-output).*
`;export{e as default};
