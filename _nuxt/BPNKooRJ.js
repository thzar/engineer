const e=`The container needs to talk. Right now it has no network at all — or rather, it has the host's, which is worse: it can bind the host's ports and see the host's interfaces.

Fixing that takes three pieces. A **network namespace** to hold an isolated stack. A **veth pair** — a virtual cable with a plug at each end. And a **bridge**, which is a software switch on the host that the container plugs into.

## A network namespace is a whole second stack

Not a filter, not a virtual interface: a complete, independent set of interfaces, routing tables, ARP caches, iptables rules, and port space.

\`\`\`
sudo ip netns add netns_my-container
sudo ip netns exec netns_my-container ip addr
\`\`\`

\`\`\`
1: lo: <LOOPBACK> mtu 65536 qdisc noop state DOWN
    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
\`\`\`

One interface, \`lo\`, and it is down. Nothing else — no ethernet, no routes, no way out. \`ip netns exec NAME COMMAND\` is how you run anything inside it.

Note that \`lo\` starts **down**. A container that cannot reach its own \`127.0.0.1\` has usually hit exactly this, and the fix is one line further down.

::quiz
---
question: |-
  Two containers are in separate network namespaces. Both bind port 8080. What happens?
options:
  - Both succeed — each namespace has its own independent port space
  - The second fails with "address already in use"
  - The kernel assigns the second one a different port
answer: 0
explanation: |-
  Ports belong to a network namespace, not to the machine. This is why every container in a cluster can serve on 8080 and why publishing a port is a separate, explicit act — a mapping from a host port into the namespace, which is what \`-p 8080:8080\` sets up.
---
::

## A bridge, to plug things into

A bridge is a virtual layer-2 switch living in the host's kernel. Give it an address and it also becomes the containers' gateway:

\`\`\`
sudo ip link add name bridge0 type bridge
sudo ip addr add 10.0.0.1/24 dev bridge0
sudo ip link set bridge0 up
\`\`\`

That is \`docker0\` on any machine running Docker, under a different name. Run \`ip addr show docker0\` and you will see the same shape — a bridge holding \`172.17.0.1/16\`, acting as the default gateway for every container on the default network.

## The veth pair: a cable with two ends

A **veth** is created as a pair, and it behaves exactly like a physical cable: whatever goes in one end comes out the other. One end stays on the host and plugs into the bridge; the other is handed to the container.

\`\`\`
# The virtual cable: veth_host <-> veth_cont
sudo ip link add dev veth_host type veth peer name veth_cont

# Plug the host end into the bridge and switch it on
sudo ip link set veth_host master bridge0
sudo ip link set veth_host up
\`\`\`

::terminal-teaser
---
lines:
  - cmd: ip link show veth_host
    out: |-
      4: veth_host@veth_cont: <BROADCAST,MULTICAST> master bridge0 state DOWN
  - cmd: sudo ip link set veth_host up
    out: ""
  - cmd: ip link show master bridge0
    out: |-
      4: veth_host@veth_cont: <BROADCAST,MULTICAST,UP,LOWER_UP> master bridge0 state UP
---
::

The \`@veth_cont\` in the name is the kernel telling you which interface is the other end of this cable.

## Move one end into the namespace

This is the step where the isolation actually happens:

\`\`\`
sudo ip link set veth_cont netns netns_my-container
\`\`\`

\`veth_cont\` now disappears from the host's \`ip link\` output entirely. An interface belongs to exactly one network namespace, and it has just moved. The cable still runs between the two — that is the point — but the host can no longer configure or see that end.

## Configure it from the inside

Every remaining command runs inside the namespace, via \`ip netns exec\`:

\`\`\`
sudo ip netns exec netns_my-container ip link set dev lo up
sudo ip netns exec netns_my-container ip addr add 10.0.0.2/24 dev veth_cont
sudo ip netns exec netns_my-container ip link set dev veth_cont up
sudo ip netns exec netns_my-container ip route add default via 10.0.0.1
\`\`\`

In order: bring up loopback, give the container end an address on the bridge's subnet, bring the interface up, and add a default route pointing at the bridge.

::terminal-teaser
---
lines:
  - cmd: sudo ip netns exec netns_my-container ip addr show veth_cont
    out: |-
      3: veth_cont@if4: <BROADCAST,MULTICAST,UP,LOWER_UP> state UP
          inet 10.0.0.2/24 scope global veth_cont
  - cmd: sudo ip netns exec netns_my-container ping -c1 10.0.0.1
    out: |-
      64 bytes from 10.0.0.1: icmp_seq=1 ttl=64 time=0.061 ms
  - cmd: sudo ip netns exec netns_my-container ping -c1 8.8.8.8
    out: |-
      connect: Network is unreachable
---
::

The container can reach the host. It cannot reach the internet — \`10.0.0.0/24\` is a private range that no router on the way out will carry a reply back to. Fixing that is the next lesson.

::quiz
---
question: |-
  Why does the container reach 10.0.0.1 but not 8.8.8.8, even with a default route configured?
options:
  - Its source address is in a private range, so replies from the internet have nowhere to return to
  - The default route is wrong and should point at the container's own address
  - ICMP is blocked by default in a new network namespace
answer: 0
explanation: |-
  Routing out is fine — the packet leaves. Nothing on the public internet knows how to route a reply to 10.0.0.2, and the host is not yet rewriting the source address on its way through. That rewrite is NAT.
---
::

## DNS is a file, not a protocol setting

Name resolution has nothing to do with the network namespace. It is \`/etc/resolv.conf\` inside the container's **filesystem**:

\`\`\`
sudo sh -c "echo 'nameserver 8.8.8.8' > ./btrfs-mount/my-container/etc/resolv.conf"
\`\`\`

Two isolation mechanisms, one problem — which is why "the container has network but can't resolve anything" is such a common failure. The network namespace is set up correctly; the file in the root filesystem is empty or missing.

::deep-dive{title="What Docker adds on top of exactly this"}
Everything above is what \`docker network create\` does, with three additions.

**Automation and lifecycle.** A veth pair per container, named from the container ID, created on start and destroyed on stop. IP addresses handed out from the bridge's subnet by an internal IPAM allocator instead of typed by hand.

**An embedded DNS server.** On a user-defined network, Docker runs a resolver at \`127.0.0.11\` inside each container and writes that address into \`/etc/resolv.conf\`. It resolves container names to their current addresses, which is what makes \`postgres:5432\` work in a compose file. This is also why containers on the *default* bridge cannot resolve each other by name — the embedded DNS only serves user-defined networks, and that one difference accounts for a large share of "it works in compose but not with plain \`docker run\`".

**Port publishing.** \`-p 8080:80\` is a DNAT rule in the host's \`nat\` table rewriting the destination of inbound packets to the container's address, plus a userland proxy process as a fallback. \`sudo iptables -t nat -L DOCKER\` shows the rules for every published port on the machine.

None of it is a different mechanism. It is bookkeeping on top of veth pairs, a bridge, and iptables.
::

::fill-blank
---
prompt: |-
  Run \`ip addr\` inside the network namespace \`netns_web\`.
answer:
  - sudo ip netns exec netns_web ip addr
  - ip netns exec netns_web ip addr
  - sudo ip netns exec netns_web ip a
hint: The pattern is \`ip netns exec NAMESPACE COMMAND\`.
placeholder: sudo ip netns ...
---
::

Next up: NAT — the three iptables rules that let a private address reach the public internet.
`;export{e as default};
