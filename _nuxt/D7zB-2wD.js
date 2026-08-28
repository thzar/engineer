const e=`### Agents in production

# Long-running agents belong in a queue, not a request

The moment your feature needs more than one model call, it has outgrown the HTTP request. Put the work on a queue, stream progress back over a separate channel, and make every step individually retryable. This is not premature engineering — it is the cheapest point at which to make the change, and everything after it gets easier.

The reason teams resist is that the request-response version works in development. One user, one call, eight seconds, fine. It keeps working right up until two things happen at once: real concurrency, and a chain long enough that some proxy in front of you gives up first.

## Why can't the work just live in the request?

Four separate reasons, any one of which is sufficient.

**Timeouts are not yours to set.** Your framework's timeout is one of several. There is a load balancer, possibly a CDN, possibly a corporate proxy, and a browser. A six-step generation that takes ninety seconds will be killed by whichever of those is least patient, and you will not always be told which.

**A blocked worker is a wasted worker.** A synchronous LLM call holds a web worker for its entire duration, doing nothing but waiting on a socket. Ten concurrent generations on a ten-worker pool means the eleventh visitor cannot load your homepage. You have coupled the availability of your entire application to the latency of a third-party API.

**Retries become all-or-nothing.** If step five of six fails inside a request, the honest options are to fail the whole thing or to redo steps one through four. Both are bad, and the second is bad *and* expensive, because you pay for those tokens again.

**Concurrency control has nowhere to live.** Your model provider has rate limits and a practical throughput ceiling. In a request-based design the only thing regulating how many calls you make at once is how many users happen to click at once, which is not a control system.

## What does the queue-based shape look like?

Three components, and the separation between them is the whole design:

| Component | Job |
|---|---|
| **API** | Accepts the request, creates a session record, enqueues a task, returns immediately with a session id |
| **Worker** | Runs the actual graph — model calls, validation, retries — and publishes progress events |
| **Channel** | A WebSocket (or SSE) the client subscribes to with that session id, receiving partial output as it lands |

The client's flow is: ask, get an id, subscribe, watch. Nothing is blocked, nothing times out, and the user sees the work happening.

This is the architecture I run. A studio client opens a socket, sends a prompt with a session id, and the server dispatches to a worker; progress streams back through a channel-layer group keyed on that session, so the browser shows units appearing one at a time rather than a spinner for ninety seconds. The HTTP API handles everything that is genuinely a request — CRUD, uploads, publishing. Generation never touches it.

## How do you stop it from melting the model provider?

By sizing worker concurrency against the provider, not against the machine.

This is the detail that most queue setups get wrong, because the default is wrong for this workload. Most task runners default their worker count to the number of CPU cores, which is the right heuristic for CPU-bound work and exactly the wrong one here. Your workers are not computing anything. They are waiting on a network call. The right number is a function of what your model endpoint will actually serve concurrently before it starts rate-limiting or degrading — and that number has nothing to do with your hardware.

Make it a configuration value, not a derived one, so you can tune it when you change provider or tier without redeploying a different machine. In my setup the worker concurrency defaults to core count but is explicitly overridable by an environment variable for exactly this reason: the sizing question is "how much fan-out will the LLM endpoint tolerate," and that answer changes independently of everything else.

Two more settings matter, and both are non-obvious:

- **Prefetch of one.** By default many workers grab a batch of tasks to reduce broker round-trips. With tasks that run for two minutes, a worker that has grabbed four of them has created a two-minute queue behind itself while another worker sits idle. Set the prefetch multiplier to 1 so tasks are pulled one at a time and distribute evenly.
- **Acknowledge late.** Acknowledge a task after it completes, not when it is received. If a worker dies mid-generation — deploy, OOM, spot instance reclaimed — late acknowledgement means the task is redelivered instead of vanishing. Early acknowledgement means a user's generation silently never finishes and nothing anywhere records that it should have.

These two together are the difference between a queue that degrades gracefully and one that loses work under exactly the conditions where losing work is most expensive.

## What should you actually stream back?

Partial results, not percentages. A progress bar that moves is a lie you have to maintain; a unit appearing in a list is the real thing arriving.

This is a product decision disguised as an infrastructure one. Streaming genuine partial output changes what the wait feels like — the user is reading while the system is still working, so the perceived latency is the time to *first* useful output rather than the time to last. It also gives them a reason to intervene early when the direction is wrong, which is worth more than the waiting time you saved.

It has a second effect that is easy to miss: streaming partial output forces your pipeline to have meaningful intermediate states. A design where nothing is showable until the end is usually a design where nothing is checkable until the end either. If you can stream it, you can validate it, and you can retry just that piece.

## What does this buy you beyond not timing out?

The ability to be careful, which is the real payoff.

Once you are off the request path, latency stops being the constraint on how much work a generation is allowed to do. That changes what you can build:

- **Validate and retry.** Output fails its schema? Retry that step with the validation error fed back in. In a request budget you cannot afford a second attempt. In a queue it costs you seconds you were never counting.
- **Check the work.** A second pass that reviews the first is affordable when nobody is holding a connection open.
- **Fan out.** Ten units of a course generate in parallel across workers rather than in sequence inside one request.
- **Resume.** A session that fails at step five restarts at step five, because the first four results were persisted as they landed.

Every one of these is a reliability improvement that is simply unavailable in a synchronous design. That is the argument: not that queues are faster, but that they are the precondition for building something careful enough to trust. It is the same trade as [narrowing the task](/blog/narrow-agents-beat-smart-ones) — you give up an appealing simplicity and you get back a system whose failures are bounded.

## What this costs you

Honesty about the trade: it is more moving parts. You now operate a broker, workers, and a channel layer. There is a session model to persist, a subscription to authenticate, and a set of failure states — worker died, task orphaned, client disconnected mid-stream — that did not exist before and all need handling.

That is a real cost, and for a single model call behind a button it is not worth paying. The threshold is roughly: **more than one model call, or any single call that can exceed ten seconds.** Below that, keep it in the request. Above it, the queue is not overengineering, it is the version that survives having users.

---

*Part 3 of [Agents in production](/blog?series=agents-in-production). Next: [an agent is a state machine with an LLM picking the transitions](/blog/an-agent-is-a-state-machine).*
`;export{e as default};
