const e=`### The architecture and cost of LLM features

# The most expensive call is the one that fails after trying hardest

In a system billed by the step, your costliest interactions are not the ones that need a human. They are the ones where the model works hardest to avoid needing a human — and then needs one anyway. You pay for every attempt, and then you pay for the fallback. Making the system more thorough makes its failures more expensive.

I call this the effort paradox, and it is the single most reliable way I have seen a well-planned AI budget go wrong. Not by a little. The interactions a system handles worst routinely consume a share of spend wildly out of proportion to their share of volume.

## Why is a failed interaction expensive?

Because failure in a step-billed system is not an early exit. It is the long path.

Watch what a capable agent does when it meets a query it cannot resolve:

1. Search the knowledge base — *one step*
2. Look at the user's history for context — *one step*
3. Attempt the obvious automated resolution — *two steps*
4. Try an alternative route — *two steps*
5. Call an external system for more context — *two steps*
6. Run a diagnostic path — *two steps*
7. Give up and escalate — *one step*

Eleven steps. Every one of them is the system behaving exactly as designed: thorough, methodical, trying to help. And at the end, a human does the work, at human cost.

A less capable system that gave up after step two produces the identical outcome for the user, at a fraction of the spend. That is the paradox stated as plainly as I can put it: **your most sophisticated behaviour generates your highest costs precisely when it fails.**

## Why does everyone's intuition get this wrong?

Because we all price effort using a mental model borrowed from salaried humans, and it does not transfer.

When a person spends forty minutes on a ticket they cannot solve, that time feels wasted but it does not increase the bill. Their salary is fixed. The cost of trying harder is zero at the margin.

When a system spends eleven steps on a request it cannot solve, each step is a discrete, metered charge. Trying harder has a price, and the price is highest on the requests where trying doesn't work.

That single difference invalidates the cost instincts most people bring to designing these systems. It is why "let's make it more thorough" is a change that sounds like an unambiguous improvement and is actually a cost decision.

## How much does this actually distort the total?

Enough that an average is not a useful number.

Compare the model most budgets are built on with the shape production actually takes:

**The assumption**

| Outcome | Share | Steps | Then what |
|---|---|---|---|
| Handled | 70% | ~2 | Done |
| Not handled | 30% | 0 | Human cost |

Failures are free, so total cost ≈ successes plus the human fallback. This is the model that gets approved.

**What happens**

| Outcome | Share | Steps | Then what |
|---|---|---|---|
| Quick success | ~60% | 1–2 | Done |
| Complex success | ~15% | 3–5 | Done |
| Expensive attempt | ~25% | 6–12 | *Plus* human cost |

The third row is a quarter of the interactions and, at those step counts, the large majority of the inference spend — before the fallback cost is added on top. The shares vary by workload; the shape does not. Instrument yours and you will find some version of that third row, because it is a consequence of how these systems are built rather than a defect in any particular one.

Note also that nothing in the "assumption" table is dishonest. Every number in it is a reasonable guess. It is wrong solely because it assigns zero steps to the failure path.

## What do you do about it?

Four controls. They are unglamorous and they work.

**A step ceiling.** Pick a number — six is a reasonable default — and stop. No meaningful progress after N steps, escalate. This single rule bounds your worst case, which is the number that determines your bill. It is also the easiest to implement: it is a counter.

**A cost ceiling per interaction type.** Different flows deserve different budgets. A billing dispute may be worth ten steps; a password reset is not. Setting these per type rather than globally means you are not forced to choose one number that is too tight for the hard cases and too loose for the easy ones.

**Effort visibility.** Track steps-per-interaction *by input type*. The expensive patterns are always clustered — a category of query that consistently burns the budget and consistently fails. You cannot see it in an average and it is obvious in a breakdown. Once you can see it, you can usually fix it upstream: that category needs a rule, a better retrieval path, or an immediate handoff.

**A success ratio.** Successful steps divided by total steps. Watch it over time. It correlates with cost in a way that success rate does not, and it moves when you make the right changes rather than when volume shifts.

## Doesn't capping effort make the product worse?

Sometimes, slightly, and it is usually the right trade — but the honest version of this argument has to acknowledge what you are giving up.

A step ceiling means some interactions that *would* eventually have resolved get escalated instead. That is a real loss. The question is what it costs relative to the alternative, and the arithmetic usually favours the cap: you are trading a small number of would-have-worked resolutions against a large, unbounded tail of attempts that were never going to work. Accepting a marginally lower resolution rate in exchange for a predictable cost structure is generally a good deal, and it is a much better deal than discovering the tail in a quarterly bill.

There is a second, less obvious benefit. **Failing fast is often better for the user.** A person who gets handed to a human after fifteen seconds is happier than one who watches a system flail for two minutes before handing them to the same human. You are not only saving money; you are removing the worst experience your product currently offers.

## Where this generalises

Every major platform is moving toward consumption-based pricing, and the specifics — what counts as a billable unit, what is included — differ and change. The structure does not. Wherever you pay per step rather than per seat:

- Effort becomes visible and metered. Thoroughness has a price.
- **Failure patterns are cost patterns.** Where a system spends steps unsuccessfully matters as much as where it succeeds.
- Success metrics have to include economics. Resolution rate alone will lead you to optimise in the expensive direction.
- How you design the system's behaviour *is* a financial decision, whether or not anyone treats it as one.

The good news is that this is entirely avoidable, and cheaply. A step counter and a breakdown by input type are an afternoon of work. Without them, you find out at production volume, in a number somebody has to explain.

---

*Part 3 of [The architecture and cost of LLM features](/blog?series=llm-architecture-and-cost). See also [what an LLM feature actually costs to run](/blog/what-an-llm-feature-costs-to-run).*
`;export{e as default};
