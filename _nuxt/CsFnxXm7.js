const e=`By default a container may use every core and all the memory on the machine. One service with a leak takes down everything else on the host, including whatever you would have used to log in and fix it.

Limits are cgroups, the mechanism *Containers From Scratch* sets by hand. Docker's flags write the same files.

## Memory

\`\`\`
docker run --memory 512m --memory-reservation 256m myapp
\`\`\`
\`\`\`yaml
services:
  api:
    mem_limit: 512m
    mem_reservation: 256m
\`\`\`

**\`--memory\`** is a hard cap. Cross it and the kernel's OOM killer kills something *inside that cgroup* — the host is unaffected, which is the entire point.

**\`--memory-reservation\`** is a soft limit: a target the kernel pushes the container back toward under host memory pressure, without killing anything. Setting reservation below limit gives you a container that is squeezed before it is killed.

::terminal-teaser
---
lines:
  - cmd: docker run -d --name api --memory 512m myapp
    out: 7c1f9a3e4d82
  - cmd: docker stats --no-stream api
    out: |-
      NAME   CPU %   MEM USAGE / LIMIT     MEM %   PIDS
      api    2.14%   487.2MiB / 512MiB     95.16%  23
  - cmd: docker inspect -f '{{.State.OOMKilled}} {{.State.ExitCode}}' api
    out: true 137
---
::

**Exit code 137 plus \`OOMKilled: true\` is a complete diagnosis.** The process was \`SIGKILL\`ed by the kernel for exceeding its own limit — which is why the logs simply stop, with no stack trace and no shutdown message. Signal 9 cannot be caught.

::quiz
---
question: A container is OOMKilled at 512 MB while the host has 60 GB free. What is happening?
options:
  - The limit is per-cgroup, so free host memory is irrelevant once the container hits its own ceiling
  - The host is misreporting free memory
  - Docker reserves the rest of the host memory for itself
answer: 0
explanation: That independence is the purpose of the limit. The kernel kills inside the cgroup and the rest of the host never notices. Either the limit is too low for the workload or the workload leaks — \`docker stats\` over time distinguishes them.
---
::

## Runtimes do not see the limit

The trap that produces most unexplained OOM kills. A limited container still sees the **host's** total memory through \`/proc/meminfo\`, because \`/proc\` is not namespaced for this. A runtime that sizes its heap from "available memory" sizes it against 60 GB and then dies at 512 MB.

Modern runtimes are mostly container-aware now — the JVM since 10 with \`UseContainerSupport\`, .NET Core, recent Node — but "mostly" is doing work in that sentence, and anything that reads \`/proc/meminfo\` directly is not.

Be explicit rather than hopeful:

\`\`\`
docker run --memory 512m -e NODE_OPTIONS="--max-old-space-size=400" myapp
docker run --memory 2g   -e JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75" myapp
\`\`\`

Leave headroom. The heap is not the process — thread stacks, native allocations, and the runtime itself all sit outside it, and a heap sized at exactly the container limit is guaranteed to be killed.

::quiz
---
question: A JVM in a 512 MB container is OOMKilled despite a heap that looks small. Why?
options:
  - The heap is only part of the process — thread stacks, metaspace and native allocations count against the cgroup too
  - The JVM ignores cgroup limits entirely
  - OOM kills are triggered by CPU, not memory
answer: 0
explanation: The cgroup counts every page the process touches. A 480 MB heap in a 512 MB container leaves nothing for metaspace, code cache, or stacks. \`MaxRAMPercentage\` around 75 is the usual starting point.
---
::

## CPU

\`\`\`
docker run --cpus 1.5 myapp                # hard: 1.5 cores' worth
docker run --cpu-shares 512 myapp          # relative weight under contention
docker run --cpuset-cpus 0-3 myapp         # pin to specific cores
\`\`\`

**\`--cpus\`** is a quota — a ceiling enforced whether or not the machine is busy. **\`--cpu-shares\`** is a weight that only matters when cores are contended; an unloaded machine lets the container use everything.

The distinction is worth caring about, because a hard CPU limit is more aggressive than it looks. A throttled process is **stopped mid-period and resumed at the start of the next**, which shows up as latency spikes at the period boundary rather than uniform slowness. A great many "mysterious p99" investigations end at a CPU limit somebody set for safety on a service that was never going to starve anything.

Weights first. Quotas when you genuinely need a ceiling — a noisy batch job, or a tenant you are billing.

## Processes and file descriptors

\`\`\`
docker run --pids-limit 200 myapp
docker run --ulimit nofile=65536:65536 myapp
\`\`\`

\`--pids-limit\` caps processes in the cgroup and is the answer to a fork bomb, accidental or otherwise. Without it, a runaway \`fork()\` exhausts the host's PID space and nothing on the machine can start a process — including your shell.

\`nofile\` matters for anything holding many connections; Docker's default is often lower than a busy server needs, and the failure looks like random connection errors under load.

::fill-blank
---
prompt: Run \`myapp\` limited to 512 MB of memory and 1.5 CPUs.
answer:
  - docker run --memory 512m --cpus 1.5 myapp
  - docker run --cpus 1.5 --memory 512m myapp
  - docker run -m 512m --cpus 1.5 myapp
  - docker run --memory=512m --cpus=1.5 myapp
hint: Two flags before the image name.
placeholder: docker run ...
---
::

## Setting the numbers

Do not guess. Run the workload under realistic load and watch:

\`\`\`
docker stats
docker stats --no-stream --format '{{.Name}}\\t{{.MemUsage}}\\t{{.CPUPerc}}'
\`\`\`

Then set the memory limit **above observed peak with real headroom** — for a garbage-collected runtime, peak is not steady state, and a limit at peak means the first unusual request kills you. Set CPU as a **weight** unless you specifically need a ceiling.

And instrument the outcome, because a limit that is too low produces exactly the symptom of a limit that is absent: an application that stops working. \`docker events --filter event=oom\` tells you which it was.

::deep-dive{title="cgroup v2, \`memory.high\`, and reading the truth from the kernel"}
Docker's flags are a thin layer over cgroup files, and reading them directly is often faster than reasoning about the flags.

**cgroup v2** is the unified hierarchy every current distribution ships. **cgroup v1 is deprecated**, with support continuing until May 2029 — long enough not to panic, short enough that a new host should be v2.

\`\`\`
stat -fc %T /sys/fs/cgroup     # cgroup2fs = v2, tmpfs = v1
cat /sys/fs/cgroup/system.slice/docker-<id>.scope/memory.events
\`\`\`

\`\`\`
low 0
high 0
max 3428
oom 2
oom_kill 2
\`\`\`

That file is the one to read when a container dies without explanation. \`oom_kill\` counts actual kills. A large \`max\` count with **zero** kills is the more interesting case: the container is repeatedly hitting its ceiling and reclaiming, which means it is thrashing page cache and running slowly rather than dying. No log line anywhere says so.

**\`memory.high\` is the control Docker does not expose.** Where \`memory.max\` is a cliff, \`memory.high\` is a throttle — cross it and the process is put under heavy reclaim pressure and slowed, but not killed. Setting \`high\` somewhat below \`max\` gives a warning zone that shows up in \`memory.events\` long before anything dies. Kubernetes does not expose it either. For a service where a slow response beats a restart, it is worth setting on the cgroup directly.

Two more worth knowing by name: **\`pids.max\`** is what \`--pids-limit\` writes, and **\`io.max\`** rate-limits block device throughput per cgroup — the answer to one container saturating a disk everyone shares, and something Docker exposes only partially through \`--device-read-bps\` and friends.
::

Next up: the supply chain — SBOMs, provenance, and proving where an image came from.
`;export{e as default};
