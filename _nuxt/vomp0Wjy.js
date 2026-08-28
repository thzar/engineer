const e=`Docker's most under-appreciated feature is that \`docker rm\` works. Nothing you built in this course cleans itself up: the bridge stays, the namespace stays, the cgroup stays, the loopback mount stays, and the iptables rules stay until the machine reboots.

Taking it apart is the last piece of understanding — because the teardown order tells you what depends on what.

## Tear it down in reverse

\`\`\`
# 1. The cgroup
sudo cgdelete -g cpu,memory:/$CONTAINER_ID

# 2. The network namespace (this destroys veth_cont with it)
sudo ip netns delete netns_$CONTAINER_ID

# 3. The host end of the cable, and the bridge
sudo ip link delete veth_host
sudo ip link set bridge0 down && sudo ip link delete bridge0

# 4. The container's filesystem, then the loopback mount
sudo btrfs subvolume delete ./btrfs-mount/$CONTAINER_ID
sudo umount ./btrfs-mount
rm -rf ./btrfs-mount && rm -f ./btrfs-disk.img alpine.tar.gz
\`\`\`

The iptables rules need removing separately — \`-D\` with the same arguments as the \`-A\` that added them:

\`\`\`
sudo iptables -t nat -D POSTROUTING -o $DIF -j MASQUERADE
sudo iptables -D FORWARD -i $BRIDGE_IFACE -o $DIF -j ACCEPT
sudo iptables -D FORWARD -o $BRIDGE_IFACE -m state --state RELATED,ESTABLISHED -j ACCEPT
\`\`\`

::terminal-teaser
---
lines:
  - cmd: ip netns list
    out: ""
  - cmd: ip link show bridge0
    out: |-
      Device "bridge0" does not exist.
  - cmd: ls /sys/fs/cgroup/my-container
    out: |-
      ls: cannot access ... No such file or directory
  - cmd: mount | grep btrfs-mount
    out: ""
---
::

Two details worth noticing. Deleting the network namespace takes \`veth_cont\` with it, because an interface cannot outlive the namespace it lives in — and deleting either end of a veth pair destroys both. And the btrfs subvolume needs \`btrfs subvolume delete\`, not \`rm -rf\`: it is a filesystem object, not a directory.

::quiz
---
question: |-
  Why must the cgroup be deleted before the processes in it are gone — or rather, what happens if you try while a process is still inside?
options:
  - |-
    It fails: a cgroup with member processes cannot be removed until they exit or are moved out
  - It succeeds and kills the processes
  - It succeeds and the processes silently lose their limits
answer: 0
explanation: |-
  \`rmdir\` on a non-empty cgroup returns EBUSY. This is why a container runtime kills the process first and removes the cgroup second, and why leftover cgroups on a host usually mean a process nobody noticed is still running in one.
---
::

## The debugging map

This is what the course was actually for. Six layers, and every container problem you will meet belongs to one of them:

| Symptom | Layer | Where to look |
|---|---|---|
| "No such file or directory" for a binary that exists | filesystem | wrong image, missing shared library, wrong architecture |
| Config file changes vanish on restart | filesystem | written to the writable layer, not a volume |
| Image far bigger than expected | filesystem | files deleted in a later layer are still shipped |
| Can reach IPs but not hostnames | filesystem *and* network | \`/etc/resolv.conf\` in the image; the DNS server it names |
| Two containers can't see each other | network | different networks, or the default bridge's lack of embedded DNS |
| Published port unreachable | network | DNAT rule, or the process bound to 127.0.0.1 inside |
| Container reaches the host but not the internet | NAT | \`ip_forward\`, the MASQUERADE rule, the FORWARD chain |
| Random packet loss under load | NAT | conntrack table full — check \`dmesg\` |
| Exit code 137, \`OOMKilled\` | cgroups | \`memory.max\` vs \`memory.current\`, and \`memory.events\` |
| Latency spikes on an idle host | cgroups | \`cpu.max\` throttling at period boundaries |
| Zombie processes accumulating | namespaces | PID 1 not reaping — needs an init, or \`--init\` |
| Container ignores \`docker stop\` for 10s | namespaces | PID 1 has no \`SIGTERM\` handler |
| \`ps\` inside shows host processes | namespaces | sharing the host PID namespace |

Every row is a place you now know how to inspect directly: \`/proc/PID/ns/\`, \`ip netns exec\`, \`iptables -L -n -v\` with its packet counters, \`/sys/fs/cgroup/*/memory.events\`, \`btrfs subvolume list\`.

::quiz
---
question: |-
  A container can \`ping 8.8.8.8\` but every hostname fails to resolve. Which layer is at fault?
options:
  - The filesystem — \`/etc/resolv.conf\` inside the container's root, or the resolver it points at
  - The network namespace, which is missing a route
  - cgroups, which are throttling the DNS lookups
answer: 0
explanation: |-
  Reaching an IP proves the namespace, routing, and NAT are all working. Name resolution is a file in the root filesystem naming a server, plus that server being reachable — which is why this symptom sends you to the image, not the network.
---
::

## What you actually built

A container is a process with:

- a **root filesystem** of its own, cheaply cloned from a shared base by copy-on-write
- **namespaces** limiting what it can see — processes, mounts, hostname, IPC, network
- a **network stack** of its own, wired to the host by a virtual cable and a bridge
- **NAT** translating its private address on the way out
- **cgroups** capping what it can consume

Namespaces for isolation, cgroups for limits, copy-on-write for cheap images. Everything above that — image formats, registries, layer caching, health checks, restart policies, service discovery, schedulers — is ergonomics and orchestration built on those three ideas.

That is not a dismissal. The ergonomics are the reason anyone uses containers at all, and the nine commands you ran by hand in lesson 8 are nine chances to get it wrong in production. But knowing that the abstraction is this small is what changes how you debug: a container that misbehaves is not a black box, it is a process with a known set of kernel objects attached, and every one of them can be read from \`/proc\` and \`/sys\`.

::deep-dive{title="Where to go next"}
**Read a runtime's config.** The [OCI runtime specification](https://github.com/opencontainers/runtime-spec) defines \`config.json\` — the full description of a container as namespaces, mounts, cgroup limits, capabilities, and a seccomp profile. It is readable in an afternoon, and every field maps onto something in this course.

**Run \`runc\` directly.** It is the piece Docker and containerd both delegate to. \`runc spec\` writes a default \`config.json\`; edit it and \`runc run\` it, with no daemon anywhere. This is the smallest step up from what you have just built.

**Try \`bocker\`.** A container runtime in about 100 lines of shell, doing very nearly what lesson 8 does, with \`run\`, \`images\`, \`ps\`, \`logs\`, and \`rm\`. Reading it end to end is the fastest way to see how the pieces compose into a tool.

**Look at rootless Podman.** It is the same set of primitives with user namespaces added, and it is the practical demonstration of why that one namespace changes the security story.

**Add the hardening.** Take lesson 8's command and add \`capsh --drop=...\`, a seccomp profile, \`pivot_root\` in place of \`chroot\`, and a user namespace. Each is a small change; together they are the difference between the isolation boundary you built and a security boundary.
::

## Credit

The command sequence in this course follows NH66's write-up of their FOSS Meet '26 container workshop, [*What Is a Container, Really? Building One From Scratch With Linux Primitives*](https://nh66.ai/blog/what-is-a-container-really-building-one-from-scratch-with-linux-primitives/) (18 June 2026). The btrfs, veth, NAT, cgroup, and composition steps are theirs; the namespace, \`chroot\`, and teardown lessons expand on them. Worth reading in its original single-page form once you have finished here — it is the same material at a different pace.

If you have not taken *Linux Basics* or *Shell Scripting*, they are the two courses underneath this one.
`;export{e as default};
