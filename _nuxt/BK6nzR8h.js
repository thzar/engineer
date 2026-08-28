const e=`Six lessons, six mechanisms, all of them independent. This is the one where they compose — a single process wrapped in every layer at once, which is a container and nothing more than a container.

## The whole setup, in order

Assuming a fresh machine, here is everything from the previous lessons in the order it has to happen:

\`\`\`
CONTAINER_ID="my-container"
DIF="wlan0"                    # your real uplink: ip route | grep default
BRIDGE_IFACE="bridge0"

# --- 1. Copy-on-write root filesystem ------------------------------
truncate -s 5G ./btrfs-disk.img
mkfs.btrfs -f ./btrfs-disk.img
mkdir -p ./btrfs-mount
sudo mount -o loop ./btrfs-disk.img ./btrfs-mount

sudo btrfs subvolume create ./btrfs-mount/base-image
curl -o alpine.tar.gz \\
  https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-minirootfs-3.19.1-x86_64.tar.gz
sudo tar -xf alpine.tar.gz -C ./btrfs-mount/base-image

sudo btrfs subvolume snapshot \\
  ./btrfs-mount/base-image \\
  ./btrfs-mount/$CONTAINER_ID

# --- 2. Bridge and veth pair ---------------------------------------
sudo ip link add name bridge0 type bridge
sudo ip addr add 10.0.0.1/24 dev bridge0
sudo ip link set bridge0 up

sudo ip link add dev veth_host type veth peer name veth_cont
sudo ip link set veth_host master bridge0
sudo ip link set veth_host up

# --- 3. Network namespace ------------------------------------------
sudo ip netns add netns_$CONTAINER_ID
sudo ip link set veth_cont netns netns_$CONTAINER_ID

sudo ip netns exec netns_$CONTAINER_ID ip link set dev lo up
sudo ip netns exec netns_$CONTAINER_ID ip addr add 10.0.0.2/24 dev veth_cont
sudo ip netns exec netns_$CONTAINER_ID ip link set dev veth_cont up
sudo ip netns exec netns_$CONTAINER_ID ip route add default via 10.0.0.1

sudo bash -c "echo 'nameserver 8.8.8.8' > ./btrfs-mount/$CONTAINER_ID/etc/resolv.conf"

# --- 4. NAT ---------------------------------------------------------
sudo sysctl -w net.ipv4.ip_forward=1
sudo iptables -t nat -A POSTROUTING -o $DIF -j MASQUERADE
sudo iptables -A FORWARD -i $BRIDGE_IFACE -o $DIF -j ACCEPT
sudo iptables -A FORWARD -o $BRIDGE_IFACE -m state --state RELATED,ESTABLISHED -j ACCEPT

# --- 5. cgroup ------------------------------------------------------
sudo cgcreate -g cpu,memory:/$CONTAINER_ID
sudo cgset -r cpu.weight=50 $CONTAINER_ID
sudo cgset -r memory.max=536870912 $CONTAINER_ID
\`\`\`

Nothing new. Every line has appeared in a previous lesson.

## The command

\`\`\`
sudo cgexec -g cpu,memory:$CONTAINER_ID \\
  ip netns exec netns_$CONTAINER_ID \\
  unshare --fork --pid --mount --uts --ipc --mount-proc \\
  chroot ./btrfs-mount/$CONTAINER_ID \\
  /bin/sh -c "mount -t proc proc /proc && hostname $CONTAINER_ID && /bin/sh"
\`\`\`

Read it from the outside in. Each program does one thing to the environment and then executes the next one, so the layers nest — and by the time the innermost \`/bin/sh\` starts, every cage is already around it.

| Layer | What it adds |
|---|---|
| \`cgexec -g cpu,memory:...\` | runs the process inside the CPU and memory cgroup |
| \`ip netns exec netns_...\` | moves it into the isolated network stack |
| \`unshare --fork --pid --mount --uts --ipc\` | fresh process tree, mount table, hostname, and IPC |
| \`--mount-proc\` | remounts \`/proc\` so the new PID view is visible |
| \`chroot ./btrfs-mount/...\` | makes the btrfs snapshot the new \`/\` |
| the inner \`/bin/sh -c\` | mounts \`/proc\`, sets the hostname, starts the real shell |

That last line is worth naming: **it is the entrypoint**. In Docker terms, everything above it is what the runtime does, and \`/bin/sh\` is your \`ENTRYPOINT\` plus \`CMD\`.

::quiz
---
question: |-
  Why must \`chroot\` come after \`unshare --mount\` rather than before it?
options:
  - So the mount of \`/proc\` inside the new root happens in the container's own mount namespace, not the host's
  - Because chroot cannot run as a child of unshare
  - Order does not matter; the layers are independent
answer: 0
explanation: |-
  Mounting is the ordering constraint. If \`chroot\` ran first and the mount namespace were created afterwards, the \`mount -t proc\` would land in the host's mount table and stay there after the container exited. \`unshare --mount\` first means every mount the container makes is discarded with it.
---
::

## What it looks like from inside

::terminal-teaser
---
lines:
  - cmd: hostname
    out: my-container
  - cmd: ps -e
    out: |-
      PID   USER     TIME  COMMAND
          1 root      0:00 /bin/sh
          8 root      0:00 ps -e
  - cmd: cat /etc/os-release
    out: NAME="Alpine Linux"
  - cmd: ip addr show veth_cont
    out: |-
      inet 10.0.0.2/24 scope global veth_cont
  - cmd: ping -c1 8.8.8.8
    out: |-
      64 bytes from 8.8.8.8: icmp_seq=1 ttl=115 time=13.8 ms
  - cmd: free -m
    out: |-
      Mem:  total 512   used 4   free 508
---
::

Its own hostname. Two processes, its shell being PID 1. An Alpine userland on an Ubuntu kernel. Its own IP, with working internet through NAT. 512 MB of memory, on a host with far more.

You have built a container. No Docker was installed at any point.

## Check it from the host

The more convincing demonstration is from the other side:

::terminal-teaser
---
lines:
  - cmd: ps -ef | grep '[/]bin/sh'
    out: root  30412  30402  0 09:14 ?  00:00:00 /bin/sh
  - cmd: sudo ls -l /proc/30412/root
    out: |-
      lrwxrwxrwx 1 root root 0 -> /home/you/btrfs-mount/my-container
  - cmd: sudo readlink /proc/30412/ns/pid /proc/self/ns/pid
    out: |-
      pid:[4026532445]
      pid:[4026531836]
  - cmd: cat /proc/30412/cgroup
    out: |-
      0::/my-container
---
::

One process on the host, PID 30412, with a different root, a different PID namespace, and a cgroup. That is the entire difference between a container and any other process on the machine — and \`/proc/PID/\` is where you go to establish it, for a hand-built container and a Kubernetes pod alike.

::quiz
---
question: |-
  From the host, \`readlink /proc/PID/ns/net\` for a container process matches your own shell's. What does that tell you?
options:
  - The container is sharing the host's network stack — no network isolation is in effect
  - The container is stopped
  - Both processes are in the same cgroup
answer: 0
explanation: |-
  Identical namespace inodes mean the same namespace. For the network namespace that is \`--network host\` or, here, a missing \`ip netns exec\`. It also means the container can bind host ports and see host interfaces — worth confirming rather than assuming when something is reachable that should not be.
---
::

::deep-dive{title="What a real runtime does that this does not"}
The command above is a container by the definition we started with. It is not a *safe* one, and the gap is worth naming precisely.

**Capabilities.** Our process runs as full root with every capability. \`runc\` drops all but a small default set — no \`CAP_SYS_ADMIN\`, no \`CAP_SYS_MODULE\`, no \`CAP_NET_ADMIN\`. Without that, the container can load kernel modules and reconfigure the host's network.

**seccomp.** Docker's default profile blocks around 40 syscalls outright — \`kexec_load\`, \`mount\`, \`ptrace\`, and the rest of the kernel attack surface a normal workload never touches. We block none.

**User namespaces.** Our root is the host's root. UID 0 inside is UID 0 outside, so a filesystem escape is a full host compromise.

**\`pivot_root\` instead of \`chroot\`.** As covered in lesson 3: our \`chroot\` is escapable by a root process in a dozen lines of C.

**A read-only \`/sys\`, a proper \`/dev\`, masked \`/proc\` paths.** \`/proc/kcore\`, \`/proc/sysrq-trigger\`, and \`/sys/firmware\` are masked or read-only in a real runtime. Ours are wide open.

**Lifecycle.** Nothing here reaps zombies, forwards signals, restarts on failure, streams logs, or cleans up when the process exits.

That list is what the OCI runtime specification is: not a different mechanism, but the same mechanisms plus every hardening step. Which is the honest summary of the whole course — **you have built the isolation, not the security.**
::

Next up: the cleanup, and the debugging map this all adds up to.
`;export{e as default};
