const e=`The \`docker\` command is a client. Everything it appears to do is done by a chain of programs behind it, and in production you eventually meet all of them — usually because one has gone wrong and the CLI is reporting it politely.

## The chain

\`\`\`
docker (CLI)
   │  REST over /var/run/docker.sock
dockerd (the daemon)
   │  gRPC
containerd
   │  one shim per container
containerd-shim-runc-v2
   │  fork/exec
runc  ──►  clone(), setns(), cgroups, pivot_root  ──►  your process
\`\`\`

- **\`dockerd\`** owns the Docker-shaped concepts: images with tags, networks, volumes, the build system, the API.
- **\`containerd\`** owns container lifecycle and image distribution. It is a CNCF project used directly by Kubernetes, with Docker as one client among several.
- **The shim** is one process per container, and it is the piece that matters operationally: it holds the container's stdio and exit status, and it is **the reason you can restart \`dockerd\` without killing every running container**.
- **\`runc\`** does the actual work — namespaces, cgroups, \`pivot_root\`, capabilities — then execs your process and exits. It is a short-lived program, not a supervisor.

::terminal-teaser
---
lines:
  - cmd: docker info --format '{{.ServerVersion}} / containerd {{.ContainerdCommit.ID}}'
    out: 29.7.2 / containerd 2.2.2
  - cmd: ps -ef | grep -c '[c]ontainerd-shim'
    out: |-
      7
  - cmd: docker inspect -f '{{.State.Pid}}' api
    out: |-
      48213
  - cmd: sudo readlink /proc/48213/ns/pid
    out: |-
      pid:[4026533117]
---
::

That last pair is the whole trick from *Containers From Scratch*: a container is a host process with different namespaces attached. \`/proc/<pid>/\` answers every question about it directly, without going through Docker at all — which is exactly what you want when Docker is the thing misbehaving.

::quiz
---
question: Why do running containers survive a \`dockerd\` restart?
options:
  - Each container is held by its own containerd shim, which is not a child of dockerd
  - dockerd checkpoints containers to disk before restarting
  - They don't — a daemon restart stops all containers
answer: 0
explanation: The shim owns the container's stdio and reaps its exit code, and it stays alive across a daemon restart. This is what makes \`systemctl restart docker\` survivable on a production host, and it is why \`live-restore\` exists as a daemon option to make it explicit.
---
::

## The specifications underneath

Two OCI specifications separate what Docker is from what a container is:

- **The image spec** — a manifest, a config, and layers as content-addressed tarballs. Why an image built by Docker runs under Podman, containerd, or a Kubernetes node with no Docker on it.
- **The runtime spec** — the \`config.json\` describing namespaces, mounts, cgroup limits, capabilities, and a seccomp profile. \`runc\` consumes exactly this.

Reading a real \`config.json\` is the fastest way to see everything Docker configures on your behalf, and every field maps onto something in this course.

::deep-dive{title="The containerd image store, and looking underneath"}
Engine 29.0 made the **containerd image store the default on fresh installations**, replacing the graph drivers Docker had used for a decade.

What it buys, all of which this course depends on: **full multi-platform images held locally**, **attestations and SBOMs stored as first-class objects** rather than dropped, and lazy-pulling snapshotters becoming possible.

Two caveats. Existing installations that upgraded keep the old store — the change applies to fresh installs, and \`docker info\` tells you which you have. And daemons using \`userns-remap\` do **not** get it, because of an unresolved interaction between the two; a security lesson later in this course returns to that trade-off.

Engine 29.7 also added an experimental **\`embedded-containerd\`** mode, running containerd inside the daemon process rather than as a separate managed one. Worth knowing it exists; not worth adopting yet.

**Looking directly at containerd**, which is occasionally the only way to see what is happening:

\`\`\`
sudo ctr --namespace moby containers list
sudo ctr --namespace moby tasks list
\`\`\`

Docker's containers live in containerd's \`moby\` namespace — a containerd namespace, unrelated to a kernel namespace, and an unfortunate collision of vocabulary. \`nerdctl\` is a more pleasant, Docker-compatible CLI over the same thing.

Reach for these when the Docker API is unresponsive but containers are plainly still serving traffic. It happens, and it is survivable precisely because of the shim.
::

## Where things are on disk

\`\`\`
/var/lib/docker/            # images, containers, volumes, build cache
/var/lib/containerd/        # containerd's own state
/etc/docker/daemon.json     # daemon configuration
/var/run/docker.sock        # the API socket
\`\`\`

Two rules about \`/var/lib/docker\`. **Do not modify it by hand** — the daemon holds state in memory and will not agree with your edits. And **give it its own filesystem** on any real host: a full root filesystem takes the whole machine down, where a full Docker filesystem only stops new builds.

::quiz
---
question: Why is access to \`/var/run/docker.sock\` equivalent to root on the host?
options:
  - The API can start a privileged container mounting the host filesystem, so anyone who can reach it can take the machine
  - The socket is owned by root and readable only by root
  - It exposes the host's password database
answer: 0
explanation: One API call runs \`-v /:/host --privileged\`, and now you have the host. This is why adding a user to the \`docker\` group is granting root, why mounting the socket into a container is a serious decision, and why rootless mode exists.
---
::

## Configuring the daemon

\`/etc/docker/daemon.json\`, applied on daemon restart:

\`\`\`json
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true,
  "default-ulimits": { "nofile": { "Soft": 65536, "Hard": 65536 } },
  "default-address-pools": [
    { "base": "10.201.0.0/16", "size": 24 }
  ]
}
\`\`\`

Every one of those is a production lesson someone learned the hard way. **Log rotation**, because the default is unbounded. **\`live-restore\`**, so containers survive a daemon restart explicitly. **File descriptor limits**, because the default is low for a busy server. And **address pools**, because Docker's default \`172.17.0.0/16\` collides with corporate VPN ranges more often than seems statistically reasonable, and the symptom is one subnet of the office becoming unreachable from containers.

::fill-blank
---
prompt: Print the host PID of the main process in the container named \`api\`.
answer:
  - docker inspect -f '{{.State.Pid}}' api
  - docker inspect --format '{{.State.Pid}}' api
  - docker inspect -f "{{.State.Pid}}" api
hint: Inspect with a format string reaching into the container's State.
placeholder: docker inspect ...
---
::

Next up: security — dropping the privileges a container gets by default and does not need.
`;export{e as default};
