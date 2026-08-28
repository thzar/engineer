const e=`A container's default security posture is better than a bare process and considerably worse than most people assume. It runs as **root** — the host's root, with a reduced but still substantial capability set — with a permissive seccomp filter and a writable filesystem.

None of that is required by anything you are likely to run. This lesson is turning it off.

## Do not run as root

\`\`\`dockerfile
FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
USER node
CMD ["node", "server.js"]
\`\`\`

Most official images ship a suitable non-root user already — \`node\`, \`postgres\`, \`nginx\`. Where one does not, make it, and use a high fixed UID so it cannot collide with a host account that means something:

\`\`\`dockerfile
RUN adduser -D -u 10001 app
USER 10001
\`\`\`

Prefer the **numeric** form in \`USER\`. Kubernetes' \`runAsNonRoot\` check reads the image config and cannot tell whether a *name* resolves to UID 0, so a named user is rejected by some policies even when it is fine.

::terminal-teaser
---
lines:
  - cmd: docker run --rm alpine id
    out: uid=0(root) gid=0(root) groups=0(root)
  - cmd: docker run --rm --user 10001:10001 alpine id
    out: uid=10001 gid=10001
  - cmd: docker run --rm alpine capsh --print | head -2
    out: |-
      Current: cap_chown,cap_dac_override,cap_fowner,cap_setgid,cap_setuid,
      cap_net_bind_service,cap_net_raw,cap_sys_chroot,...
---
::

## Drop capabilities

Root inside a container has around fourteen of Linux's forty-odd capabilities. A web application needs none of them.

\`\`\`
docker run --cap-drop ALL --cap-add NET_BIND_SERVICE myapp
\`\`\`
\`\`\`yaml
services:
  api:
    cap_drop: [ALL]
    cap_add: [NET_BIND_SERVICE]
\`\`\`

Drop everything, then add back only what actually fails. In practice most services need nothing at all — \`NET_BIND_SERVICE\` only matters for binding below port 1024, and the better answer there is to listen on 8080 and publish it as 80.

Two that deserve naming because they are the ones granted casually and they are the ones that end badly. **\`SYS_ADMIN\`** is close to root on the host — mounting filesystems, manipulating namespaces — and is the usual "just add this to make it work" for anything that mounts. **\`SYS_PTRACE\`** lets a process inspect and manipulate others in its namespace; useful for a debugger, not for a service.

## \`--privileged\` is not a debugging step

\`\`\`
docker run --privileged myapp        # don't
\`\`\`

\`--privileged\` drops **all** of it: every capability granted, seccomp and AppArmor disabled, all host devices exposed. A privileged container can load kernel modules, read raw disks, and reach the host trivially. It is the single largest security decision available in one flag, and it is most often typed by someone narrowing down a permission error.

The right move when something needs a privilege is to find the specific one:

\`\`\`
docker run --cap-add SYS_TIME myapp          # not --privileged
docker run --device /dev/ttyUSB0 myapp       # not --privileged
\`\`\`

::quiz
---
question: A container fails with "operation not permitted" on a mount. A colleague suggests \`--privileged\`. What is the better response?
options:
  - Identify the specific capability or device needed and grant only that
  - Add \`--privileged\` and revisit later
  - Run the container as root instead
answer: 0
explanation: |-
  \`--privileged\` grants every capability and disables seccomp and AppArmor at once, and "revisit later" reliably means never. \`--cap-add SYS_ADMIN\`, or a \`--device\`, is narrower — and if the answer really is SYS_ADMIN, that is worth knowing rather than hiding.
---
::

## Seccomp, AppArmor, and no-new-privileges

Docker applies a **default seccomp profile** blocking around forty syscalls that no normal workload uses — \`kexec_load\`, \`mount\`, \`ptrace\`, and the rest of the kernel's attack surface. It is on unless you disable it, which \`--privileged\` does silently.

A custom profile, when you know what your workload calls:

\`\`\`
docker run --security-opt seccomp=./profile.json myapp
\`\`\`

And the flag worth adding to essentially everything:

\`\`\`
docker run --security-opt no-new-privileges myapp
\`\`\`

That sets the kernel's \`no_new_privs\` bit: the process and its children can never gain privileges through a setuid binary. It costs nothing and closes the most common privilege-escalation path inside a container.

## Read-only root filesystem

\`\`\`
docker run --read-only --tmpfs /tmp --tmpfs /run myapp
\`\`\`
\`\`\`yaml
services:
  api:
    read_only: true
    tmpfs: [/tmp, /run]
\`\`\`

Most services never write outside \`/tmp\`. Making the root filesystem read-only means an attacker who achieves code execution cannot drop a binary, modify configuration, or persist. The \`tmpfs\` mounts give back the few directories that genuinely need writing, in RAM, discarded on exit.

Turning this on usually surfaces one or two surprises — a framework writing a cache, a library writing a lockfile — and each one is worth knowing about anyway.

::quiz
---
question: What does \`--security-opt no-new-privileges\` prevent?
options:
  - A process gaining privileges by executing a setuid binary
  - The container from running as root
  - New capabilities being added after start
answer: 0
explanation: It sets the kernel's \`no_new_privs\` bit, so \`execve\` can never grant more privilege than the caller had. It closes the standard escalation path from a compromised unprivileged process to root inside the container, and it breaks almost nothing.
---
::

## A hardened service

\`\`\`yaml
services:
  api:
    image: ghcr.io/acme/api@sha256:9f2a1c...
    user: "10001:10001"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    pids_limit: 200
    mem_limit: 512m
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "/healthcheck"]
      interval: 30s
      start_period: 20s
\`\`\`

Every line is a decision this course has argued for. Note the image is pinned by **digest**, not tag — a later lesson makes that case.

::fill-blank
---
prompt: Run \`myapp\` dropping all Linux capabilities.
answer:
  - docker run --cap-drop ALL myapp
  - docker run --cap-drop=ALL myapp
  - docker run --cap-drop all myapp
hint: One flag, and the value that means everything.
placeholder: docker run ...
---
::

::deep-dive{title="Rootless mode and user namespaces"}
Everything above hardens the container. Two options harden the *daemon*, and they address the fact that a container escape normally lands you as real root on the host.

**Rootless mode** runs the whole daemon as an unprivileged user:

\`\`\`
dockerd-rootless-setuptool.sh install
export DOCKER_HOST=unix:///run/user/1000/docker.sock
\`\`\`

A breakout gets you the user's privileges and nothing more. The trade-offs are real: binding ports below 1024 needs extra configuration, some storage drivers and network features are unavailable, and there is a small performance cost. Engine 29.5 improved the networking side by switching the rootless default to the \`gvisor-tap-vsock\` driver, replacing slirp4netns.

**\`userns-remap\`** keeps a normal root daemon but maps container UIDs to an unprivileged host range:

\`\`\`json
{ "userns-remap": "default" }
\`\`\`

Root inside the container is UID 100000 outside. Cheaper to adopt than rootless and covers the main risk.

**The catch, and it is current:** daemons using \`userns-remap\` do **not** get the containerd image store, because of an unresolved interaction between the two. So on Engine 29 you are choosing between UID remapping and the new store's multi-platform and attestation support. Worth knowing before you find out during a migration.

The honest summary: **a container is an isolation boundary, and hardening is what moves it toward being a security boundary.** For genuinely untrusted code — running someone else's build, executing user-submitted programs — the answer is a VM boundary: Firecracker, gVisor, Kata. Docker was not designed to be the last line of defence against code that is actively trying to escape.
::

Next up: resource limits — capping what a container can consume before it takes the host with it.
`;export{e as default};
