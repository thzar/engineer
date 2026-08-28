const e=`\`docker logs\` works beautifully for one container on one host. It stops working the moment there are thirty containers across six hosts and the one you need died an hour ago.

Production observability for containers is three separate questions with three separate answers: what did it print, what did the daemon do, and what is it consuming.

## Logging drivers

The daemon's logging driver decides where a container's stdout and stderr go.

| Driver | Where | \`docker logs\` works |
|---|---|---|
| \`json-file\` | a JSON file per container — the historical default | yes |
| \`local\` | a compressed, rotated binary format | yes |
| \`journald\` | systemd's journal | yes |
| \`syslog\` / \`fluentd\` / \`gelf\` | a remote collector | **no** |
| \`awslogs\` / \`gcplogs\` | a cloud provider's log service | no |
| \`none\` | discarded | no |

\`\`\`json
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3", "compress": "true" }
}
\`\`\`

**\`local\` is the right default on a real host.** It rotates, compresses, and is cheaper to write than \`json-file\`. Engine 29.5 added custom attributes to it, so entries can be tagged at the driver level rather than by the application.

::terminal-teaser
---
lines:
  - cmd: docker info --format '{{.LoggingDriver}}'
    out: local
  - cmd: docker inspect -f '{{.HostConfig.LogConfig.Type}}' api
    out: local
  - cmd: du -sh /var/lib/docker/containers/*/*-json.log 2>/dev/null | sort -h | tail -3
    out: |-
      2.1G  .../f3a1...-json.log
      7.8G  .../9c2e...-json.log
---
::

**The default \`json-file\` driver has no size limit.** A chatty container will write until the disk is full, and because the files are not volumes they never appear in \`docker system df\`. That second command is the one to run on any host you have inherited.

::quiz
---
question: Why does an unconfigured Docker host eventually run out of disk even with no large images or volumes?
options:
  - The default \`json-file\` log driver has no rotation, so container logs grow without limit
  - Stopped containers are never deleted
  - The build cache is never pruned
answer: 0
explanation: All three are real, and the logs are the one that is invisible — they live under \`/var/lib/docker/containers/\`, not in anything \`docker system df\` reports. Set \`max-size\` and \`max-file\` globally in \`daemon.json\`, not per container, so nothing can be started without them.
---
::

## Forwarding without giving up \`docker logs\`

A remote driver like \`fluentd\` or \`gelf\` breaks \`docker logs\`, which is the command everyone reaches for first at 3am. The usual production shape avoids that trade:

**Write locally with rotation, and ship the files with a collector.** A sidecar or host agent — Fluent Bit, Vector, Promtail, the OpenTelemetry Collector — reads \`/var/lib/docker/containers/*/*.log\`, enriches with container metadata, and forwards. \`docker logs\` keeps working; the logs also reach your aggregator.

Then, in the application: **log JSON to stdout and nothing else.** No files, no log rotation inside the container, no syslog. One stream, structured, and the platform decides where it goes. A container writing its own log files is producing data nobody collects and disk nobody bounded.

## Events

\`docker events\` is the daemon's activity stream, and it answers questions logs cannot:

\`\`\`
docker events --since 1h --filter event=oom
docker events --filter container=api --filter event=restart
docker events --filter type=image --filter event=pull
docker events --format '{{.Time}} {{.Type}} {{.Action}} {{.Actor.Attributes.name}}'
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker events --since 30m --filter event=die --format '{{.Time}} {{.Actor.Attributes.name}} exit={{.Actor.Attributes.exitCode}}'
    out: |-
      1756370412 api exit=137
      1756370498 api exit=137
      1756370671 api exit=137
---
::

Three OOM kills in four minutes, with timestamps. \`docker ps\` would have shown that container as \`Up 12 seconds\` and looking healthy — because it is up, for the fourth time. **Events are how a crash loop stops hiding**, and \`RestartCount\` is the other half:

\`\`\`
docker inspect -f '{{.RestartCount}} {{.State.Status}}' api
\`\`\`

::quiz
---
question: A container shows \`Up 8 seconds\` in \`docker ps\` and appears healthy, but users report intermittent errors. What reveals the problem?
options:
  - |-
    \`docker events\` and \`RestartCount\` — it is restarting repeatedly and each \`Up\` is a fresh start
  - |-
    \`docker logs\`, which would show the errors
  - |-
    \`docker stats\`, which shows CPU spikes
answer: 0
explanation: |-
  \`docker ps\` shows uptime of the *current* attempt, so a crash loop with backoff looks like a young, healthy container. \`RestartCount\` in the hundreds against an 8-second uptime is the giveaway; \`docker events --filter event=die\` gives you the exit codes and timing.
---
::

## Metrics

\`\`\`
docker stats
docker stats --no-stream --format '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}\\t{{.PIDs}}'
\`\`\`

Fine interactively, useless as a record — it does not persist. For real metrics, read cgroups directly or run an exporter:

- **cAdvisor** exposes per-container CPU, memory, network and disk in Prometheus format.
- **The daemon itself** can expose Prometheus metrics via \`"metrics-addr"\` in \`daemon.json\` — those are about \`dockerd\`, not your containers.
- **\`/sys/fs/cgroup/.../memory.events\`** is the ground truth for OOM kills and reclaim pressure, as covered in the limits lesson.

The container-specific metrics worth alerting on, as opposed to the generic host ones: **restart count increasing**, **OOM kill events**, **CPU throttling time** (a throttled container is slow, not busy, and CPU-percent alerts miss it entirely), and **health status transitions**. Engine 29 added \`Health\` to the container list API, so a collector can read health without inspecting each container.

::fill-blank
---
prompt: Show container OOM-kill events from the last hour.
answer:
  - docker events --since 1h --filter event=oom
  - docker events --filter event=oom --since 1h
  - docker events --since 1h --filter event=oom --filter type=container
hint: The events command, a time window, and a filter on the event name.
placeholder: docker events ...
---
::

::deep-dive{title="Correlating a container back to a host process"}
When something is wrong at the host level — CPU pinned, disk saturated, a suspicious network connection — you have a PID and need to know which container it belongs to. Or the reverse.

**Container to host PID:**

\`\`\`
docker inspect -f '{{.State.Pid}}' api
\`\`\`

**Host PID to container**, which is the direction you usually need:

\`\`\`
cat /proc/48213/cgroup
0::/system.slice/docker-7c1f9a3e4d82ab....scope
\`\`\`

The cgroup path contains the container ID. From there:

\`\`\`
docker inspect --format '{{.Name}}' 7c1f9a3e4d82
\`\`\`

**Everything a container is doing, from the host**, without a shell inside it:

\`\`\`
docker top api                                    # its processes
sudo nsenter -t 48213 -n ss -tulpn                # its sockets, host tooling
sudo ls -l /proc/48213/fd | wc -l                 # open file descriptors
\`\`\`

That \`nsenter\` is the technique worth remembering. It runs a **host binary** inside the **container's namespaces** — so you can inspect the network of a distroless container that has no shell, no \`ss\`, and no \`netstat\`. It is \`docker exec\` without the requirement that the tool exist in the image, and it is the reason minimal images are debuggable at all.

The general principle from the first lesson holds throughout: **a container is a host process with namespaces and a cgroup attached.** When the Docker-shaped tooling runs out, \`/proc\`, \`/sys/fs/cgroup\`, and \`nsenter\` still answer the question.
::

Next up: the last lesson — running AI workloads, with Model Runner and Compose's model support.
`;export{e as default};
