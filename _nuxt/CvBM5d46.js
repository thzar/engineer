const e=`Docker knows whether your process is running. It does not know whether your application works, and it will happily keep a wedged container in the rotation forever unless you tell it how to check.

The other half of the same subject: containers have to stop as well as start, and stopping badly is where dropped requests and corrupted state come from.

## Healthchecks

\`\`\`dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \\
  CMD curl -fsS http://localhost:3000/healthz || exit 1
\`\`\`

Or in Compose, where it does not need to be baked into the image:

\`\`\`yaml
services:
  api:
    image: myapp
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 3s
      start_period: 40s
      retries: 3
\`\`\`

The container gets a status: \`starting\`, then \`healthy\` or \`unhealthy\`.

::terminal-teaser
---
lines:
  - cmd: docker ps
    out: |-
      CONTAINER ID   IMAGE   STATUS
      a7f2c91e4b06   myapp   Up 2 minutes (healthy)
  - cmd: docker inspect -f '{{.State.Health.Status}}' api
    out: healthy
  - cmd: docker inspect -f '{{range .State.Health.Log}}{{.ExitCode}} {{.Output}}{{end}}' api
    out: 0 OK
---
::

\`start_period\` is the field people leave out and then fight. During it, failures do **not** count toward \`retries\` — it is the grace window for an app that takes thirty seconds to connect to its database and warm a cache. Without it, a slow-starting service is marked unhealthy before it ever had a chance.

Engine 29 also surfaces health in the API's container list, so tooling can read it without inspecting each container individually.

::quiz
---
question: What does \`start_period\` do in a healthcheck?
options:
  - Failures during it don't count toward \`retries\`, giving a slow-starting app time to come up
  - It delays the first check by that duration
  - It is the maximum time the container may take to start before being killed
answer: 0
explanation: Checks still run during the period — a success ends it early — but failures are forgiven. Omit it on an app with a slow warmup and it is marked unhealthy while it is still legitimately starting.
---
::

## Write the check honestly

A healthcheck that always passes is worse than none, because it makes an outage look like a healthy service.

\`\`\`yaml
test: ["CMD-SHELL", "exit 0"]                    # meaningless
test: ["CMD", "curl", "-f", "http://localhost:3000/"]   # is the port open?
test: ["CMD", "curl", "-fsS", "http://localhost:3000/healthz"]  # does the app work?
\`\`\`

A useful \`/healthz\` checks the things whose failure means this container cannot serve: the database connection, a required cache, a filesystem it must write to. It should **not** check things it does not control — a downstream API being slow should not take your whole fleet out of rotation.

Note \`CMD\` versus \`CMD-SHELL\`: the array form execs directly and needs no shell in the image, while \`CMD-SHELL\` runs through \`/bin/sh\` and lets you use pipes and \`||\`. Distroless images can only use the first, which is why healthchecks for them are usually a small static binary shipped alongside the app.

## Stopping: what \`docker stop\` actually does

1. \`SIGTERM\` to PID 1.
2. Wait — ten seconds by default.
3. \`SIGKILL\` if it is still alive.

So a graceful shutdown means catching \`SIGTERM\`, refusing new work, finishing in-flight requests, closing connections, and exiting. If your process does not, it gets killed mid-request every single deploy.

Two things routinely break this even in applications that *do* handle the signal:

**Shell form in the Dockerfile.** \`CMD node server.js\` becomes \`/bin/sh -c "node server.js"\`. The shell is PID 1, does not forward signals, and your app never hears anything. Use the exec form: \`CMD ["node", "server.js"]\`.

**Nothing reaping children.** A PID 1 that spawns processes must \`wait()\` on them or they accumulate as zombies. \`--init\` inserts a tiny init process that handles both reaping and signal forwarding:

\`\`\`
docker run --init myapp
\`\`\`
\`\`\`yaml
services:
  api:
    init: true
\`\`\`

::quiz
---
question: A container always takes exactly 10 seconds to stop, then dies. What is happening?
options:
  - PID 1 is ignoring SIGTERM, so Docker waits out the grace period and SIGKILLs it
  - The healthcheck is blocking shutdown
  - Docker always waits 10 seconds before stopping a container
answer: 0
explanation: Ten seconds is the default grace period, and hitting it exactly every time means nothing acted on the SIGTERM. Usually shell form making \`/bin/sh\` PID 1; sometimes an application with no signal handler. Both drop in-flight requests on every deploy.
---
::

## Tuning the grace period

\`\`\`
docker run --stop-timeout 30 myapp
docker stop -t 30 api
\`\`\`
\`\`\`dockerfile
STOPSIGNAL SIGQUIT
\`\`\`
\`\`\`yaml
services:
  api:
    stop_grace_period: 30s
    stop_signal: SIGQUIT
\`\`\`

\`STOPSIGNAL\` matters for software that does not use the convention — nginx treats \`SIGTERM\` as a *fast* shutdown that drops connections and \`SIGQUIT\` as the graceful one, which is exactly backwards from what Docker sends by default.

Engine 29.7 added a **\`default-stop-timeout\` daemon option**, so a host can set the fleet-wide default instead of every container carrying its own flag.

::fill-blank
---
prompt: Stop the container named \`api\`, allowing 30 seconds before it is killed.
answer:
  - docker stop -t 30 api
  - docker stop --time 30 api
  - docker stop --timeout 30 api
  - docker stop -t30 api
hint: One flag for the grace period, then the container name.
placeholder: docker stop ...
---
::

::deep-dive{title="Restart policies, and the crash loop that hides itself"}
\`\`\`
docker run --restart unless-stopped myapp
\`\`\`

| Policy | Behaviour |
|---|---|
| \`no\` | the default — never restart |
| \`on-failure[:N]\` | restart on a non-zero exit, optionally at most N times |
| \`always\` | restart always, including after a daemon restart |
| \`unless-stopped\` | like \`always\`, but stays stopped if you stopped it deliberately |

\`unless-stopped\` is the right default for a service. \`always\` will resurrect a container you deliberately stopped when the machine reboots, which is rarely what anyone meant.

Docker backs off between restarts, doubling the delay up to a limit — so a container crashing on startup goes from restarting every second to every couple of minutes. Which is where this gets deceptive: \`docker ps\` shows \`Up 3 seconds\` and looks fine, because it *is* up, for the third time this minute.

\`\`\`
docker inspect -f '{{.RestartCount}}' api
docker events --filter container=api --filter event=restart
\`\`\`

A \`RestartCount\` in the hundreds on a container reporting \`Up 3 seconds\` is a crash loop presenting as a healthy service.

**Restart policy and healthcheck do not interact.** An \`unhealthy\` container is *not* restarted by Docker — it is marked, and something above it is expected to act. Compose does not act. Swarm and Kubernetes do, which is why people who learned health checks on Kubernetes expect a restart that never comes. On a plain Docker host, an unhealthy container sits there being unhealthy until you or your monitoring notice.
::

Next up: build caching across machines — making CI as fast as your laptop.
`;export{e as default};
