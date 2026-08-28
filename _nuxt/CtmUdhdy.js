const e=`### Making LLM output trustworthy

# Test one prompt a hundred times, not a hundred prompts once

The standard way to test a prompt — write it, run it once, look at the response, tweak, repeat — measures the wrong thing. It samples a distribution once and treats the sample as the distribution. Run the same input a hundred times instead, and you get the thing you actually needed: the variance, the tail latency, the token spread, and the frequency of the failure you have been unable to reproduce.

Every prompt-authoring interface encourages the wrong habit, because they all have a Preview button. You write, you preview, you see a decent response, you ship it. Production then behaves nothing like the preview, and the gap is not bad luck — it is the difference between one draw and many.

## What does single-run testing miss?

Four things, and every one of them is a production incident waiting.

**Variance in quality.** The response you previewed might be at the 80th percentile of what that prompt produces. You have no way to know from one sample. The version a user gets on a bad draw is the one that sets their opinion.

**Variance in latency.** Time-to-first-token varies substantially call to call, and it degrades under concurrency in ways a single sequential test cannot show. A feature that felt responsive in development can be abandoned in production simply because the p95 is somewhere the p50 never suggested.

**Token spread.** Output length is not fixed. A prompt whose typical response is short can have a long tail that blows through a context budget or a cost model. You see that in a histogram, never in one call.

**Intermittent misbehaviour.** The classification that is wrong one time in twelve. The field that is occasionally omitted. These are invisible at n=1 and obvious at n=100, and they are exactly the bugs that get filed as "sometimes it just doesn't work."

## How do you actually run it?

Build the smallest possible harness. This is a day of work, not a project.

1. **Pick a representative input.** One real query. Not a synthetic one you invented — real inputs have shapes you would not have thought of.
2. **Run it many times.** Fifty to a hundred is enough to see a distribution. Vary it slightly across runs if you want to cover a neighbourhood rather than a point.
3. **Record four things per call.** Latency, input tokens, output tokens, and the response itself.
4. **Score the responses** against your [reference answers](/blog/how-to-evaluate-an-llm-feature), blind.
5. **Repeat across candidate models,** identically.

The output is a table, and the table is the deliverable:

| | Model A | Model B |
|---|---|---|
| Median latency | | |
| p95 latency | | |
| Median output tokens | | |
| p95 output tokens | | |
| Correct, no fabrication | | |
| Cost per call | | |

I have deliberately left it blank. Any numbers I published would be stale within a quarter and would be *my* workload rather than yours, which is the whole point — this is a table you fill in, and the filling-in takes an afternoon.

## What tends to come out of it

Three findings recur often enough to be worth expecting.

**Latency differences between models are much larger than the marketing suggests, and they do not track capability.** A model that is slightly worse on your task can be several times faster on it, and for an interactive feature that trade is frequently correct — a good answer nobody waits for is worth less than a decent answer that arrives.

**Cutting tokens helps less than you expect.** Trimming a prompt is the obvious first optimisation and it does reduce cost. It often barely moves latency, because model compute time dominates rather than transfer. Worth doing, but if latency is the problem, the answer is usually a different model or a different decomposition rather than a shorter prompt.

**A slower model's outputs make excellent few-shot examples for a faster one.** This is the most useful trick in the set. Take the responses from the model that produces the best quality, put a handful into the prompt as examples, and run the fast model. You often get most of the quality at most of the speed — because you have converted a capability gap into an imitation problem, and imitation is cheap.

That last one generalises: when a fast model underperforms, the first thing to try is not a better prompt in the abstract, it is showing it what good looks like.

## What about testing the whole agent, not one prompt?

Same principle, more care about what you assert, because agent test harnesses have a specific and dangerous failure mode: **a test can pass while the answer is fiction.**

If the expected result is specified loosely — "should describe the product's cold-weather rating" — then a response inventing a rating satisfies it perfectly. The grader is checking shape, and the shape is correct. The suite goes green. The output is wrong.

Two rules avoid this:

- **Assert exact values where a wrong fact would matter.** Specifications, figures, policies, anything a user acts on. Say what the right answer is, not what it looks like.
- **Assert shape only where variation is genuinely fine.** A confirmation, a greeting, a summary — "should contain a date, a time and a confirmation" is the right assertion there.

A second thing to expect: **intermediate labels are noisier than final answers.** Whatever internal classification your agent does — which topic, which tool, which branch — will vary between runs on inputs that sit between categories, while the final response often stays correct anyway because other signals carry it. Do not treat the internal label as your success metric. Optimise for what the user receives; use the label variance as a signal that a category boundary needs sharpening.

And when the same input produces different internal routing on repeated runs, that is information, not a flake. It means the input does not clearly belong to any of your defined buckets, which is a scoping problem you can actually fix — usually by [naming the category you were missing](/blog/narrow-agents-beat-smart-ones).

## What to do on Monday

Take the one prompt in your product that matters most. Run it a hundred times. Plot latency and token count, score the responses blind, and do the same for one cheaper model.

You will learn more in that afternoon than in a month of tweaking against a Preview button — and you will end it with a table you can put in front of whoever is asking why the feature is slow.

---

*Part 3 of [Making LLM output trustworthy](/blog?series=trustworthy-llm-output). Next: [you can't debug what you can't see](/blog/observability-for-llm-features).*
`;export{e as default};
