const e=`Run \`docker run alpine /bin/sh\` and you land in what looks like a brand-new machine. Its own filesystem. Its own network interface. Its own process list, where your shell is PID 1. Its own memory limit. It feels like a very small virtual machine.

It isn't. There is no hypervisor here, and no second kernel. **A container is an ordinary Linux process that has been lied to about the world around it** — and this course is about who tells the lies, and how.

## The evidence that it isn't a VM

Start a container and look at it from the host:

::terminal-teaser
---
lines:
  - cmd: docker run -d --name demo alpine sleep 300
    out: 8f3c1a...
  - cmd: ps -eo pid,comm | grep sleep
    out: |-
      30412 sleep
  - cmd: docker exec demo ps -eo pid,comm
    out: |-
      PID   COMMAND
          1 sleep
          7 ps
---
::

The same process. One kernel, one process table, one scheduler. From the host it is PID 30412 among hundreds; from the inside it is PID 1 and nearly alone.

A virtual machine could not do this. A VM runs its own kernel on emulated hardware, and its processes are invisible to the host because they are genuinely somewhere else. Here nothing is emulated and nothing is hidden — the container's process is simply being shown a filtered view of the machine it is already running on.

::quiz
---
question: |-
  \`docker exec\` into a container and run \`uname -r\`. Whose kernel version do you see?
options:
  - The host's — a container shares the host kernel and has none of its own
  - The container image's, which ships a kernel
  - A virtualised version reported by the container runtime
answer: 0
explanation: |-
  There is exactly one kernel involved. This is why a Linux container cannot run on a Windows or macOS kernel without a Linux VM underneath, and why a container needing a specific kernel feature depends on the *host* having it, not the image.
---
::

## Four ideas, and Docker is the bow on top

Strip away the tooling and a container is the intersection of four things:

1. **An isolated filesystem** — its own \`/\`, so it sees its own libraries and binaries rather than yours.
2. **An isolated network** — its own interfaces and routing table, so it can bind port 80 without fighting you for it.
3. **Capped resources** — a ceiling on CPU and memory, so it cannot starve the host.
4. **An isolated process tree** — its own PID space, so it cannot see or signal your processes.

Every one of those is a plain kernel feature with a name, a command-line tool, and a manual page. None of them was invented by Docker; most predate it by years. Docker's contribution was packaging, distribution, and an ergonomic front end — which is a genuinely large contribution, and also not the same thing as the isolation itself.

::deep-dive{title="What we are building, and why by hand"}
Over the next eight lessons we assemble a container from those primitives, with no container runtime installed at any point. No Docker, no containerd, no runc, no Podman.

The layers, in the order we build them:

- a **copy-on-write root filesystem** with btrfs snapshots, so containers share a base image without being able to damage it
- **namespaces** — PID, mount, UTS, IPC — via \`unshare\`
- **\`chroot\`**, to make the snapshot the container's \`/\`
- a **veth pair and bridge**, giving it a private wire to the host
- **iptables NAT**, so that private wire reaches the internet
- **cgroups**, capping CPU and memory

Then one command that composes all six into a single process, and a cleanup lesson that takes it apart again.

The point is not that you should build containers this way. The point is that when a production container cannot resolve DNS, or gets OOM-killed at a limit nobody set, or sees a volume mount that behaves strangely, you will know which of these six layers to look at — instead of restarting the pod and hoping.

The walkthrough follows NH66's write-up of their FOSS Meet '26 container workshop, [*What Is a Container, Really?*](https://nh66.ai/blog/what-is-a-container-really-building-one-from-scratch-with-linux-primitives/), which is the source for the exact command sequence used here.
::

## What you need to follow along

A Linux machine you have root on, and are willing to make a mess of. A VM or a cloud box is ideal; none of this belongs on a laptop you need working an hour from now.

The tools come from three packages:

\`\`\`
sudo apt update
sudo apt install -y btrfs-progs iproute2 iptables cgroup-tools util-linux
\`\`\`

\`util-linux\` supplies \`unshare\` and \`nsenter\` and is almost certainly installed already. Everything else is small.

You also need to know that this course assumes the ground covered in *Linux Basics* and *Shell Scripting* — the filesystem, processes, permissions, and enough shell to read a five-line command. Nothing beyond that.

::quiz
---
question: |-
  Which of these is *not* one of the kernel mechanisms a container is built from?
options:
  - A hypervisor that virtualises the CPU for the container
  - Namespaces, which limit what a process can see
  - cgroups, which limit what a process can consume
answer: 0
explanation: |-
  Hypervisors belong to virtual machines. Containers use no CPU virtualisation at all — the process runs directly on the host CPU, at native speed, scheduled by the host kernel like everything else. That is the whole performance argument for containers.
---
::

Next up: namespaces — the mechanism that decides what a process is allowed to see.
`;export{e as default};
