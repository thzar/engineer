const e=`Every container gets its own network stack — its own interfaces, routing table, and port space. That is why two containers can both listen on port 80 without arguing, and why neither of them is reachable from your browser until you say so.

## The default bridge, and why not to use it

Start a container with no network options and it lands on a bridge called \`bridge\`, which appears on the host as \`docker0\`.

\`\`\`
docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
8f2c1a9b7d34   bridge    bridge    local
1e4d8c2f9a01   host      host      local
c73b5e1a8d92   none      null      local
\`\`\`

Containers on the default bridge can reach each other **by IP address only**. There is no name resolution between them. Which is close to useless, because container IPs are assigned at start and change.

The fix is one command:

\`\`\`
docker network create appnet
docker run -d --name db     --network appnet postgres:17
docker run -d --name api    --network appnet myapi
\`\`\`

On a **user-defined** network, Docker runs an embedded DNS resolver and containers resolve each other **by container name**. The API connects to \`postgres://db:5432\` and it works, permanently, regardless of what address \`db\` gets today.

::terminal-teaser
---
lines:
  - cmd: docker network create appnet
    out: c9a17f3e2b48
  - cmd: docker run -d --name db --network appnet -e POSTGRES_PASSWORD=x postgres:17
    out: 4f81c93ae207
  - cmd: docker run --rm --network appnet alpine ping -c1 db
    out: |-
      PING db (172.19.0.2): 56 data bytes
      64 bytes from 172.19.0.2: seq=0 ttl=64 time=0.089 ms
---
::

**This is the single most valuable networking fact in Docker**, and the reason so many tutorials mysteriously fail: the embedded DNS server serves user-defined networks only, never the default bridge. If two containers cannot find each other by name, they are almost always on the default bridge. Compose creates a user-defined network for you automatically, which is why the problem seems to disappear the moment people move to Compose.

::quiz
---
question: Two containers started with plain \`docker run\` cannot reach each other by name. What is the fix?
options:
  - Put them both on a user-defined network — the default bridge has no DNS resolution
  - Publish their ports with \`-p\`
  - Add entries to each container's \`/etc/hosts\`
answer: 0
explanation: Name resolution between containers is a feature of user-defined networks. Publishing exposes ports to the *host*, which is a different problem. \`docker network create\` and \`--network\` is the whole fix.
---
::

## Publishing, and the direction of travel

\`\`\`
docker run -p 8080:80 nginx
\`\`\`

Publishing connects **the host** to a container port. It has nothing to do with container-to-container traffic.

That distinction resolves a lot of confusion in multi-service setups. Your API talks to Postgres on \`db:5432\` over the shared network — Postgres does **not** need \`-p 5432:5432\` for that. Publishing the database port only makes it reachable from your laptop, and on a server, from anywhere that can route to the host.

So: publish what humans and the outside world need. Leave everything internal unpublished.

::quiz
---
question: An API container and a Postgres container are on the same user-defined network. Does Postgres need \`-p 5432:5432\` for the API to reach it?
options:
  - No — publishing is for host access; container-to-container traffic uses the shared network directly
  - Yes, otherwise the port is closed
  - Only if they are on different hosts
answer: 0
explanation: Inside the network the port was never closed. Publishing it adds host-side exposure you probably do not want, and on a public server means the internet unless you bind to \`127.0.0.1\`.
---
::

## Reaching the host from a container

Containers see a private address, not yours. To connect back to something running on the host, use the special name Docker provides:

\`\`\`
docker run --rm alpine ping -c1 host.docker.internal
\`\`\`

This resolves on Docker Desktop out of the box. On Linux you have to ask for it:

\`\`\`
docker run --add-host=host.docker.internal:host-gateway myapp
\`\`\`

Reach for it in development — a container talking to a database running natively on your laptop — and design it out of anything you ship, because in production there is rarely a "host" to talk to.

## The other network modes

\`\`\`
docker run --network host nginx     # no isolation: uses the host's stack directly
docker run --network none alpine    # loopback only, no external access
\`\`\`

\`host\` mode removes the network namespace entirely. The container binds host ports directly, so \`-p\` is meaningless and port conflicts are real again. It is worth it for a small class of things — high-throughput proxies where the extra hop matters, or tools that need to see the host's real interfaces — and it is not worth it as a way to make a networking problem go away. It is also **Linux-only**; on Docker Desktop the "host" is the Linux VM, not your machine.

\`none\` is for jobs that should have no network at all. An untrusted build step, a batch process that only touches mounted files.

::fill-blank
---
prompt: Create a user-defined bridge network called \`appnet\`.
answer:
  - docker network create appnet
  - docker network create --driver bridge appnet
  - docker network create -d bridge appnet
hint: Three words. Bridge is the default driver, so you don't have to name it.
placeholder: docker network ...
---
::

::deep-dive{title="What Engine 29 changed underneath"}
Docker's networking is bridges, veth pairs, and iptables rules on the host — the same primitives *Containers From Scratch* builds by hand. Engine 29 reworked several of them, which matters if you have host firewall rules or memorised chain names.

**The isolation chains are gone.** \`DOCKER-ISOLATION-STAGE-1\` and \`DOCKER-ISOLATION-STAGE-2\` were removed and the bridge rules restructured. One visible consequence: containers can now reach published ports across networks when the userland proxy is not running, which previously did not work.

**There is an nftables backend.** The \`firewall-backend\` daemon option can select nftables instead of iptables — experimental, but the direction of travel, since most distributions have moved on from iptables already.

**macvlan and ipvlan no longer install a default gateway** unless you configure one explicitly. Existing setups that relied on the old behaviour need the gateway spelled out.

**Legacy container links are deprecated.** The environment variables \`--link\` used to inject are on their way out, with \`DOCKER_KEEP_DEPRECATED_LEGACY_LINKS_ENV_VARS=1\` as a temporary escape hatch. \`--link\` was superseded by user-defined networks years ago; if you still have it, this is the nudge.

The rule that has not changed, and the one worth carrying: **Docker's rules are inserted ahead of a naive host firewall.** Publishing a port with \`-p 8080:80\` on a public server makes it reachable even if \`ufw\` says otherwise, because forwarded traffic never passes through the \`INPUT\` chain. Bind to \`127.0.0.1:8080:80\` when you mean local only, and put deliberate rules in the \`DOCKER-USER\` chain, which is the one place Docker will not overwrite them.
::

Next up: Compose — declaring all of this in a file instead of remembering it.
`;export{e as default};
