const e=`A **namespace** wraps a global system resource so that the processes inside it see their own copy of it. That is the entire idea. The kernel has one process table, but a process in a PID namespace sees only the entries belonging to that namespace — and numbered from 1.

Namespaces are what makes a container's view of the machine false. Everything else in this course is either a resource limit or a filesystem trick.

## The seven kinds

| Namespace | Isolates | Flag |
|---|---|---|
| **PID** | process IDs — the container's first process is PID 1 | \`--pid\` |
| **Mount** | the mount table — its own view of what is mounted where | \`--mount\` |
| **Network** | interfaces, routing tables, firewall rules, ports | \`--net\` |
| **UTS** | hostname and domain name | \`--uts\` |
| **IPC** | shared memory, semaphores, message queues | \`--ipc\` |
| **User** | UID and GID mapping — root inside, unprivileged outside | \`--user\` |
| **Cgroup** | the cgroup hierarchy the process can see | \`--cgroup\` |

They are independent. A process can be in a new PID namespace while sharing the host's network — which is exactly what \`docker run --network host\` does, and what every pod in Kubernetes does with the containers that share it.

## Seeing them

Every process exposes its namespaces as symlinks in \`/proc\`:

::terminal-teaser
---
lines:
  - cmd: ls -l /proc/self/ns/
    out: |-
      lrwxrwxrwx 1 you you 0 ipc -> 'ipc:[4026531839]'
      lrwxrwxrwx 1 you you 0 mnt -> 'mnt:[4026531841]'
      lrwxrwxrwx 1 you you 0 net -> 'net:[4026531992]'
      lrwxrwxrwx 1 you you 0 pid -> 'pid:[4026531836]'
      lrwxrwxrwx 1 you you 0 uts -> 'uts:[4026531838]'
  - cmd: lsns -t pid
    out: |-
      NS         TYPE NPROCS PID USER COMMAND
      4026531836 pid     241   1 root /sbin/init
---
::

Those numbers are inode numbers, and they are how you answer "are these two processes in the same namespace?" — compare the inodes. Two processes with the same \`net:[...]\` number share a network stack; two with different \`pid:[...]\` numbers cannot see each other's processes.

This is also the diagnostic that settles arguments. Comparing \`/proc/PID/ns/net\` between a container process and the host tells you definitively whether \`--network host\` is in effect, regardless of what the deployment manifest claims.

::quiz
---
question: |-
  Two processes have identical inode numbers for \`/proc/PID/ns/net\` but different ones for \`/proc/PID/ns/pid\`. What is true of them?
options:
  - They share a network stack but cannot see each other in \`ps\`
  - They are the same process seen twice
  - They are in the same container
answer: 0
explanation: |-
  Namespaces are per-type and independent. Same net namespace means the same interfaces, routes, and port space — one can reach the other on localhost. Different PID namespaces means neither appears in the other's process table. This combination is exactly a Kubernetes pod with two containers.
---
::

## \`unshare\` creates them

\`unshare\` runs a program with new namespaces of the kinds you name. The whole mechanism, in one command:

\`\`\`
sudo unshare --fork --pid --mount-proc /bin/sh
\`\`\`

Inside that shell:

\`\`\`
# ps -e
  PID TTY          TIME CMD
    1 pts/0    00:00:00 sh
    5 pts/0    00:00:00 ps
\`\`\`

Two processes on a machine running hundreds. The shell is PID 1.

Three parts of that command are load-bearing:

- **\`--pid\`** asks for a new PID namespace.
- **\`--fork\`** is required with it. The process that calls \`unshare\` does *not* move into the new PID namespace — only its children do, because a process's PID cannot change while it is running. \`--fork\` makes \`unshare\` fork, and the child becomes PID 1.
- **\`--mount-proc\`** remounts \`/proc\` inside a new mount namespace. Without it, \`ps\` reads the host's \`/proc\` and lists every process on the machine, even though the isolation is genuinely in place. The isolation is real; the *view* comes from \`/proc\`, which is a filesystem, which is why a PID namespace is nearly useless without a mount namespace to go with it.

::quiz
---
question: |-
  You run \`unshare --pid /bin/sh\` without \`--fork\`, and \`ps\` still shows every process. What went wrong?
options:
  - |-
    Both problems at once — the shell never entered the new namespace, and \`/proc\` was never remounted
  - Nothing — PID namespaces only take effect after a reboot
  - |-
    \`--pid\` requires root, and the command silently ignored it
answer: 0
explanation: |-
  Without \`--fork\`, \`unshare\` execs the shell in the *old* PID namespace; the new one is created and immediately empty. And even with \`--fork\`, \`ps\` reads \`/proc\`, which without \`--mount-proc\` is still the host's. Both flags are needed for the demonstration to show anything.
---
::

## PID 1 is a real job

Being PID 1 is not just a small number. The kernel gives it two special duties, and containers inherit both problems.

**It reaps orphans.** When a process's parent dies, the orphan is re-parented to PID 1, which is expected to \`wait()\` on it. A PID 1 that doesn't becomes a zombie factory — which is why long-running containers whose entrypoint is a plain application sometimes accumulate defunct processes.

**It ignores signals it has no handler for.** The default action for \`SIGTERM\` is "terminate", but the kernel suppresses that for PID 1. A shell script as PID 1 that installs no \`trap\` will not die on \`docker stop\` — it waits out the grace period and gets \`SIGKILL\`ed instead. That is the usual explanation for a container that always takes ten seconds to stop.

::deep-dive{title="User namespaces, and rootless containers"}
The user namespace is the one that changes the security story, and the one we do *not* use in this course.

It maps UIDs across the boundary: UID 0 inside can be UID 100000 outside. The process believes it is root — it can \`chown\`, install packages, bind port 80 — while the kernel treats every one of its actions as coming from an unprivileged user.

\`\`\`
unshare --user --map-root-user /bin/sh
# id
uid=0(root) gid=0(root)
# touch /etc/anything
touch: cannot touch '/etc/anything': Permission denied
\`\`\`

Root, and powerless. This is the foundation of rootless Podman and of Docker's userns-remap mode, and it is the single biggest mitigation for container escape: a container breakout without a user namespace lands you as real root on the host, and with one it lands you as nobody.

We build without it because it complicates every subsequent step — the filesystem needs UID mapping, the network setup needs privileges the namespace has just taken away — and the goal here is to see the mechanisms clearly. **A container built the way this course builds it is an isolation boundary, not a security boundary.** Worth being precise about that, because it is exactly the distinction that gets lost in production.
::

## \`nsenter\` joins an existing one

The counterpart to \`unshare\`: enter namespaces that already exist, given a PID that is in them.

\`\`\`
sudo nsenter -t 30412 -p -m -u -n /bin/sh
\`\`\`

That is essentially what \`docker exec\` is. It finds the container's PID 1 on the host, joins the same namespaces, and runs your command there. It is also the tool that gets you into a container whose image has no shell — \`nsenter\` runs a binary from the *host's* filesystem inside the container's other namespaces, so a distroless container with a broken network is still debuggable.

::fill-blank
---
prompt: |-
  Start \`/bin/sh\` in a new PID namespace with \`/proc\` remounted, so \`ps\` shows only the namespace's processes. (You are already root.)
answer:
  - unshare --fork --pid --mount-proc /bin/sh
  - unshare --pid --fork --mount-proc /bin/sh
  - unshare --mount-proc --fork --pid /bin/sh
hint: Three flags — one for the namespace, one so a child actually enters it, one for the process view.
placeholder: unshare ...
---
::

Next up: the root filesystem — \`chroot\`, a real Alpine userland, and what "its own \`/\`" actually means.
`;export{e as default};
