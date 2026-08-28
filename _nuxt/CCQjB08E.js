const e=`### Agents in production

# An agent is a state machine with an LLM picking the transitions

Most systems described as agents are state machines where a language model chooses the next transition. That is a useful definition because it makes the design question obvious: for each transition, do you already know the answer? If you do, write it in code. The model should do work inside the states, not decide the order of them.

Almost every reliability problem I have seen in a production LLM feature traces back to a decision that was handed to the model when it did not need to be. Not because the model is bad at deciding — often it decides correctly — but because a decision the model makes is one that can go differently on a Tuesday, and a decision in code is one that cannot.

## What is the actual difference between orchestration and reasoning?

Orchestration is choosing which step runs next. Reasoning is doing something with unbounded input. They get conflated because a loop that calls tools looks like thought, and it usually isn't.

Here is the test I apply. Write down the steps your agent takes on a successful run. Then ask, for each arrow between them: **was that ever really in question?** In most pipelines the honest answer is no. Parse the request, retrieve the context, generate the draft, validate it, save it. That sequence was fixed before anyone wrote a prompt. Letting the model rediscover it on every run buys nothing and costs you a class of failure where it skips a step, repeats one, or invents a sixth.

The model earns its keep at the two ends: turning messy input into structured intent on the way in, and turning structure into something readable on the way out. In the middle, where lookups and rules and arithmetic happen, deterministic code is faster, cheaper, testable, and behaves the same next quarter — which the model you deployed this year may not.

## Where does the model actually belong?

| Job | Give it to |
|---|---|
| Turning free text into a structured intent | The model |
| Deciding which of four known steps runs next | Code |
| Retrieving records from your own database | Code |
| Judging whether a draft matches a rubric | The model |
| Computing a total, a date, a score | Code |
| Drafting prose from a structured brief | The model |
| Routing into a fixed taxonomy | Code, usually a classifier |
| Handling the residue the rules could not cover | The model |

The pattern in the right-hand column: the model is at the edges. Everything with a knowable answer sits in the middle, written down. This is the same argument as [where AI belongs in your architecture](/blog/where-ai-belongs-in-your-architecture), applied one level down — inside a single feature rather than across a system.

## How do you build it as an explicit graph?

Declare the nodes, declare the edges, and give the run a state object that every node reads and writes. That is it — the pattern is old and boring and it is exactly what makes generative pipelines debuggable.

The shape I use for every generation workflow on my platform is the same four parts, repeated:

- **A state object.** Everything the run knows so far, in one typed structure. Nodes take state and return state. Nothing is hidden in a closure.
- **A planner.** The node that makes the model call — given the state, propose something. This is where reasoning lives.
- **A presenter.** Formats the proposal for the client. Deliberately separate from the planner, because how a thing is generated and how it is shown to a human are different concerns that change at different times.
- **A commit step.** Takes what the human chose and persists it as a draft. Nothing reaches published state without passing through here.

Four workflows — proposing a course structure, proposing the units inside it, writing an article, generating assessments — and all four have that identical skeleton. That is not an accident of tidiness; it is what lets me test them the same way, instrument them the same way, and fix a bug in one place.

The graph is explicit. Edges are declared, not inferred. When a run misbehaves I can point at a node.

## What do you get from making the graph explicit?

Five things, and they are the five things that are hardest to retrofit:

1. **Testable transitions.** An edge in code is a branch you can write a test for. An edge in a prompt is a behaviour you can only sample.
2. **Bounded cost.** A declared graph has a maximum number of model calls. A loop where the model decides whether to continue does not, which is how [interactions that fail expensively](/blog/the-most-expensive-call-is-the-one-that-fails) happen.
3. **Resumability.** Persisted state plus a known node means a failed run restarts where it stopped rather than from the beginning.
4. **Attributable failures.** "Generation failed" is not a bug report. "The assessment node returned output that failed schema validation twice" is.
5. **Cheap model swaps.** When each node has one job and a checkable output, you can move a node to a smaller model and measure the effect on that node alone.

Point five is worth dwelling on. In a monolithic agent, changing models is an all-or-nothing bet you evaluate by vibes. In a graph, it is a per-node decision with a per-node measurement — and most nodes turn out not to need the expensive model.

## Where does the human fit in the graph?

As a node, not as a reviewer at the end.

This is the design choice I would defend hardest. My pipeline does not generate a course and then ask someone to approve it. It proposes candidate structures and *stops*. A person picks one, or removes items from it, or asks for different ones. Only then does the next stage run.

That pause is doing enormous work. It bounds error propagation — a bad plan cannot silently become forty bad articles, because the plan is confirmed before the articles exist. It puts the judgment call where judgment actually lives. And it makes the whole thing feel like a tool rather than a slot machine, because the person is steering rather than grading.

The general principle: **put the human where a wrong answer would be expensive to undo, not where it is convenient to add a review step.** Approval at the end is the most expensive place to catch an error and the least useful place to make a decision.

## When is a loop actually right?

When the number of steps genuinely cannot be known in advance. Open-ended research over a corpus, iterative debugging where each result determines the next probe, exploration where the goal is discovery — those are real, and forcing them into a fixed graph would be the mistake in the other direction.

But even there, the loop wants a frame around it: a hard step limit, a budget ceiling, a required progress signal, and a defined thing that happens when it hits any of them. A loop with no exit condition other than the model's own judgement is not an agent, it is an outage with a spinner.

The rule I would give a team: **fixed graph by default, loops where you can name the reason.** If someone cannot articulate why the step count is unknowable, it is knowable and it should be written down.

---

*Part 4 of [Agents in production](/blog?series=agents-in-production). Start from [the pillar post](/blog/what-it-takes-to-ship-an-llm-agent) if you came in here.*
`;export{e as default};
