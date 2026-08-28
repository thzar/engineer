const e=`Namespaces control what a process can **see**. They say nothing about what it can **consume** — a process in every namespace we have built can still allocate all the memory on the machine and spin every core.

**Control groups** are the other half. A cgroup is a set of processes with limits attached, and the kernel enforces the limits on the whole group.

## Which version are you on

There are two generations, and the commands differ:

\`\`\`
stat -fc %T /sys/fs/cgroup
\`\`\`

\`cgroup2fs\` means v2 — the unified hierarchy, and what every current distribution ships. \`tmpfs\` means v1, with a separate tree per controller. Docker on a modern host uses v2; a 2019-era CentOS box uses v1.

The concepts are identical. The filenames are not, which is the whole reason a container tool has version-detection code in it.

## The filesystem is the API

There is no cgroup syscall. You create a group by making a directory, and set a limit by writing to a file:

\`\`\`
sudo mkdir /sys/fs/cgroup/my-container
\`\`\`

The kernel populates it immediately with the controls:

::terminal-teaser
---
lines:
  - cmd: sudo mkdir /sys/fs/cgroup/my-container
    out: ""
  - cmd: ls /sys/fs/cgroup/my-container
    out: |-
      cgroup.procs  cpu.max  cpu.weight  memory.max  memory.high
      memory.current  memory.events  pids.max  io.max
  - cmd: cat /sys/fs/cgroup/my-container/memory.max
    out: max
---
::

\`max\` means no limit. Change it by writing a number:

\`\`\`
# 512 MB hard cap
echo 536870912 | sudo tee /sys/fs/cgroup/my-container/memory.max

# 50% of one CPU: 50000 microseconds of runtime per 100000 microsecond period
echo "50000 100000" | sudo tee /sys/fs/cgroup/my-container/cpu.max
\`\`\`

And you put a process into the group by writing its PID:

\`\`\`
echo $$ | sudo tee /sys/fs/cgroup/my-container/cgroup.procs
\`\`\`

That is the entire interface. Children inherit membership, so putting a shell in the group puts everything it launches in the group too.

::quiz
---
question: |-
  What does \`cpu.max\` set to \`50000 100000\` mean?
options:
  - The group may use 50000 microseconds of CPU time in every 100000 microsecond period — half of one core
  - The group is capped at 50000 processes
  - The group gets 50000 shares out of 100000 when the CPU is contended
answer: 0
explanation: |-
  It is quota and period, in microseconds — a hard ceiling enforced whether or not the machine is busy. \`cpu.weight\` is the other kind: a *relative* share that only matters under contention, and lets a group use the whole machine when nothing else wants it.
---
::

## Quota versus weight

The distinction matters more in practice than the syntax does.

- **\`cpu.max\`** is a **hard ceiling**. The group is throttled at its quota even on a completely idle machine. This is Kubernetes' CPU *limit*.
- **\`cpu.weight\`** is a **relative share**, used only when the CPU is contended. A group with weight 50 competing against one with weight 100 gets a third of the time — but on an idle machine it can use everything. This is Kubernetes' CPU *request*.

Setting a hard CPU limit is a much more aggressive thing to do than it looks. A process throttled by \`cpu.max\` is stopped mid-period and resumed at the start of the next one, which shows up as latency spikes at the period boundary rather than as uniform slowness. Plenty of production CPU-throttling incidents are a limit set "for safety" on a service that was never going to starve anything.

## \`cgroup-tools\`, the convenience layer

Writing to \`/sys/fs/cgroup\` by hand is fine, but the walkthrough this course follows uses \`cgroup-tools\`, which wraps it:

\`\`\`
sudo apt update && sudo apt install -y cgroup-tools

sudo cgcreate -g cpu,memory:/$CONTAINER_ID
sudo cgset -r cpu.weight=50 $CONTAINER_ID          # relative CPU share
sudo cgset -r memory.max=536870912 $CONTAINER_ID   # hard cap at 512 MB
\`\`\`

Then \`cgexec\` launches a process directly into the group:

\`\`\`
sudo cgexec -g cpu,memory:$CONTAINER_ID /bin/sh
\`\`\`

Same mechanism, one command instead of a \`mkdir\`, two \`echo\`s, and a \`tee\`.

## What happens at the memory limit

Nothing gentle. A process that allocates past \`memory.max\` gets an allocation failure, and the kernel's OOM killer chooses a victim **within the cgroup** — not on the whole machine, which is exactly the point.

::terminal-teaser
---
lines:
  - cmd: sudo cgexec -g memory:my-container sh -c 'head -c 900M /dev/zero | tail -c 1'
    out: Killed
  - cmd: cat /sys/fs/cgroup/my-container/memory.events
    out: |-
      low 0
      high 0
      max 214
      oom 1
      oom_kill 1
---
::

\`memory.events\` is the file to read when a container dies without explanation. \`oom_kill 1\` says the kernel killed something for exceeding the limit; a high \`max\` count with no kills means the group is repeatedly hitting the ceiling and reclaiming, which is a container that needs more memory and is currently paying for it in page-cache thrashing.

This is \`OOMKilled\` in \`kubectl describe pod\`, and exit code 137 — 128 plus signal 9.

::quiz
---
question: |-
  A container is repeatedly OOMKilled at 512 MB while the host has 60 GB free. What is going on?
options:
  - The limit is per-cgroup — free host memory is irrelevant to a group that has hit its own ceiling
  - The host is misreporting available memory
  - The container is leaking memory faster than the host can allocate
answer: 0
explanation: |-
  The whole purpose of the limit is to make the group's ceiling independent of the machine's. The kernel kills inside the cgroup and the rest of the host never notices. Either the limit is too low or the workload genuinely leaks — and \`memory.events\` plus \`memory.current\` over time will tell you which.
---
::

::deep-dive{title="\`memory.high\` — the throttle before the cliff"}
cgroup v2 adds a second memory control that has no v1 equivalent and is under-used.

- **\`memory.max\`** is the hard limit. Cross it and something gets killed.
- **\`memory.high\`** is a throttle. Cross it and the process is put under heavy reclaim pressure and *slowed down*, but not killed.

Setting \`high\` somewhat below \`max\` gives you a warning zone: a workload drifting upward gets progressively slower and shows up in \`memory.events\` as a rising \`high\` count, long before anything is killed. For a service where a slow response beats a restart, that is a much better failure mode than a cliff.

Kubernetes exposes only the hard limit, which is one reason a memory limit there is such a blunt instrument.

Two other controllers are worth knowing by name. **\`pids.max\`** caps the number of processes in the group and is the answer to a fork bomb — Docker's \`--pids-limit\`. **\`io.max\`** rate-limits block device throughput per cgroup, which is what stops one noisy container from saturating a disk everyone shares.
::

::fill-blank
---
prompt: |-
  Cap the cgroup \`my-container\` at 512 MB of memory by writing directly to the cgroup v2 filesystem. (512 MB is 536870912 bytes.)
answer:
  - echo 536870912 | sudo tee /sys/fs/cgroup/my-container/memory.max
  - echo 536870912 > /sys/fs/cgroup/my-container/memory.max
  - sudo sh -c "echo 536870912 > /sys/fs/cgroup/my-container/memory.max"
hint: Write the byte count into the group's \`memory.max\` file.
placeholder: echo 536870912 ...
---
::

Next up: assembling everything — one command, four cages, and a shell that believes it owns the machine.
`;export{e as default};
