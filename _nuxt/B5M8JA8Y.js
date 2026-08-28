const e=`The container has an address, a route, and no way to reach anything beyond the host. Its \`10.0.0.2\` is a private address from RFC 1918 — the packet gets out, and the reply has nowhere to come back to.

**Network Address Translation** fixes that by having the host rewrite the packet's source address to its own on the way out, remember the substitution, and undo it on the way back. Three iptables rules.

## Find your real interface first

Everything below refers to the host's uplink, which is whatever your default route uses:

::terminal-teaser
---
lines:
  - cmd: ip route | grep default
    out: default via 192.168.1.1 dev wlan0 proto dhcp metric 600
---
::

Take the name after \`dev\`. On a laptop it is usually \`wlan0\`; on a server, \`eth0\` or something like \`enp3s0\`.

\`\`\`
DIF="wlan0"              # the host's real interface
BRIDGE_IFACE="bridge0"
\`\`\`

## Enable forwarding

By default a Linux host will not route packets between its interfaces at all — it is a host, not a router. That has to be turned on:

\`\`\`
sudo sysctl -w net.ipv4.ip_forward=1
\`\`\`

This one setting is behind a surprising share of "containers have no internet" incidents, because a \`sysctl -w\` is lost on reboot unless it is written into \`/etc/sysctl.d/\`. Docker sets it on start; nothing sets it for you here.

## The three rules

\`\`\`
# 1. Masquerade container traffic as the host's own
sudo iptables -t nat -A POSTROUTING -o $DIF -j MASQUERADE

# 2. Allow container -> internet
sudo iptables -A FORWARD -i $BRIDGE_IFACE -o $DIF -j ACCEPT

# 3. Allow the replies back
sudo iptables -A FORWARD -o $BRIDGE_IFACE -m state --state RELATED,ESTABLISHED -j ACCEPT
\`\`\`

**Rule 1** is the translation. \`POSTROUTING\` in the \`nat\` table is the last point before a packet leaves; \`MASQUERADE\` rewrites its source address to whatever address the outgoing interface currently has. It is \`SNAT\` for interfaces whose address you don't know in advance — DHCP, a dial-up link, a laptop moving between networks.

**Rule 2** permits forwarding from the bridge out to the world. Forwarding was enabled by the sysctl, but the \`FORWARD\` chain still has to accept the packet.

**Rule 3** is the return path, and it is the interesting one. It does not permit the internet to initiate connections to your container — it permits packets belonging to a connection the container **already started**. \`RELATED,ESTABLISHED\` is conntrack, the kernel's connection tracking table, deciding that a packet is part of a flow it has already seen.

That asymmetry is why a container gets outbound internet access without becoming reachable from outside. Inbound access is a separate, deliberate act — a DNAT rule, which is what \`-p 8080:80\` creates.

::terminal-teaser
---
lines:
  - cmd: sudo ip netns exec netns_my-container ping -c1 8.8.8.8
    out: |-
      64 bytes from 8.8.8.8: icmp_seq=1 ttl=115 time=14.2 ms
  - cmd: sudo iptables -t nat -L POSTROUTING -n -v
    out: |-
      Chain POSTROUTING (policy ACCEPT)
       pkts bytes target      prot opt in   out    source     destination
          4   336 MASQUERADE  all  --  *    wlan0  0.0.0.0/0  0.0.0.0/0
---
::

The packet counter on that rule is the fastest diagnostic there is: zero means traffic is not reaching NAT at all, and the problem is routing or the \`FORWARD\` chain rather than translation.

::quiz
---
question: |-
  Rule 3 permits \`RELATED,ESTABLISHED\` traffic back to the bridge. Why not simply accept everything inbound?
options:
  - Because only replies to connections the container started should get in — accepting everything would expose it to the internet
  - Because conntrack is faster than a plain ACCEPT rule
  - Because MASQUERADE requires a state match to function
answer: 0
explanation: |-
  A blanket ACCEPT on the return path would let anyone on the network initiate connections into the container. Matching on connection state keeps the door open only for traffic the container asked for, which is exactly the property that makes outbound-only the safe default.
---
::

## What NAT costs you

Worth knowing before you assume it is free.

- **Conntrack has a table, and the table has a size.** Every tracked flow occupies an entry. Under enough connections you hit \`nf_conntrack: table full, dropping packet\` in \`dmesg\`, and traffic fails in a way that looks like random packet loss.
- **Inbound connections need explicit mapping.** Hence port publishing, and hence the fact that two containers cannot both publish host port 8080.
- **The container does not know its own public address.** It sees \`10.0.0.2\`; the world sees the host's address. Anything that advertises its own address — SIP, FTP in active mode, some clustering protocols — needs to be told what to say.
- **It costs a little latency and CPU** on every packet. Rarely decisive, occasionally measurable at high packet rates.

Kubernetes avoids most of this by giving every pod a routable address on a flat network, which is what a CNI plugin is for. The trade is complexity: you need something that actually routes those addresses.

::deep-dive{title="Reading the rules Docker writes"}
With Docker installed, \`sudo iptables -t nat -L -n\` shows the same shapes:

\`\`\`
Chain POSTROUTING (policy ACCEPT)
MASQUERADE  all  --  172.17.0.0/16   0.0.0.0/0

Chain DOCKER (2 references)
RETURN     all  --  0.0.0.0/0        0.0.0.0/0
DNAT       tcp  --  0.0.0.0/0        0.0.0.0/0    tcp dpt:8080 to:172.17.0.2:80
\`\`\`

The \`MASQUERADE\` is rule 1 above, scoped to the bridge subnet instead of an interface. The \`DNAT\` line is one \`-p 8080:80\` — inbound packets for host port 8080 get their destination rewritten to the container.

Two things follow that catch people out.

**Docker's rules can outrank yours.** They live in a \`DOCKER\` chain jumped to early from \`PREROUTING\`, so a published port is reachable even if you thought your \`INPUT\` firewall closed it. \`INPUT\` is not consulted for forwarded traffic at all. Publishing to \`127.0.0.1:8080:80\` rather than \`8080:80\` is the fix when you want a port bound only locally.

**Restarting Docker rewrites the chains.** Rules you added by hand into a Docker-managed chain disappear. \`DOCKER-USER\` exists precisely for this: it is jumped to before Docker's own rules and is never flushed.
::

::fill-blank
---
prompt: |-
  Turn on IPv4 packet forwarding on the host at runtime.
answer:
  - sudo sysctl -w net.ipv4.ip_forward=1
  - sysctl -w net.ipv4.ip_forward=1
  - sudo sysctl net.ipv4.ip_forward=1
hint: One sysctl key, set to 1.
placeholder: sudo sysctl ...
---
::

Next up: cgroups — capping what the container is allowed to consume, rather than what it is allowed to see.
`;export{e as default};
