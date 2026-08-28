const e=`Two things you will do more than anything else once you actually depend on Docker: work out why a container is not behaving, and stop Docker eating the disk. Neither is difficult; both go faster if you know which command answers which question.

## The four commands that answer most questions

\`\`\`
docker logs -f --tail 100 web       # what did it print?
docker inspect web                  # how was it configured?
docker stats                        # what is it consuming, live?
docker events                       # what is the daemon doing right now?
\`\`\`

\`inspect\` returns a wall of JSON, which is why it takes a format string:

::terminal-teaser
---
lines:
  - cmd: docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' web
    out: exited 137
  - cmd: docker inspect -f '{{.State.OOMKilled}}' web
    out: |-
      true
  - cmd: docker inspect -f '{{json .NetworkSettings.Networks}}' web
    out: |-
      {"appnet":{"IPAddress":"172.19.0.3","Aliases":["web"]}}
---
::

That first pair is a complete diagnosis. **Exit code 137 is 128 + 9**, meaning the process was killed with \`SIGKILL\`, and \`OOMKilled: true\` says the kernel did it for exceeding a memory limit. No log line, no stack trace — the process was not asked to stop, it was stopped.

## Reading exit codes

| Code | Means |
|---|---|
| \`0\` | clean exit |
| \`1\` | generic application error — read the logs |
| \`125\` | the daemon itself failed — usually a bad flag |
| \`126\` | the command was found but is not executable |
| \`127\` | command not found — wrong path, or missing in this base image |
| \`137\` | SIGKILL — an OOM kill, or a \`stop\` that timed out |
| \`143\` | SIGTERM — a clean \`docker stop\` the process honoured |

\`126\` and \`127\` are almost always an image problem rather than a code problem: a script without the executable bit, a shebang pointing at \`/bin/bash\` in an Alpine image that only has \`/bin/sh\`, or a binary built for the wrong architecture.

::quiz
---
question: A container exits with code 137 and its logs end mid-request with no error. What happened?
options:
  - It was SIGKILLed — most likely an out-of-memory kill against its own limit
  - It called \`exit(137)\` deliberately
  - The image is corrupt
answer: 0
explanation: 137 is 128 + 9, and signal 9 cannot be caught or handled — which is exactly why the logs just stop. Confirm with \`docker inspect -f '{{.State.OOMKilled}}'\`. Either the limit is too low or the workload leaks.
---
::

## When the container will not start at all

If it exits immediately and the logs are empty, you cannot \`exec\` into it — there is nothing running to join. Override the entrypoint and get a shell in the same image instead:

\`\`\`
docker run --rm -it --entrypoint sh myapp
\`\`\`

Now you are inside the image's filesystem and can check whether the file exists, whether it is executable, and what the environment actually looks like. Nine times out of ten it is a path.

For an image with no shell at all — distroless, \`scratch\` — Docker Desktop ships \`docker debug\`, which attaches a toolbox of debugging binaries to a running or stopped container without changing the image:

\`\`\`
docker debug myapp
\`\`\`

## Where the disk went

\`\`\`
docker system df
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker system df
    out: |-
      TYPE            TOTAL   ACTIVE   SIZE      RECLAIMABLE
      Images          47      6        12.4GB    9.87GB (79%)
      Containers      31      4        1.2GB     1.1GB (91%)
      Local Volumes   22      3        8.9GB     7.2GB (80%)
      Build Cache     412     0        18.3GB    18.3GB (100%)
---
::

Build cache is usually the biggest number and the one people forget exists. Forty gigabytes of it is unremarkable on a machine that builds regularly.

\`\`\`
docker container prune          # stopped containers
docker image prune              # untagged images
docker image prune -a           # every image no container is using
docker builder prune            # build cache
docker builder prune --keep-storage 10GB   # keep a working set

docker system prune             # containers + networks + dangling images + cache
docker system prune -a --volumes   # everything. Including your data.
\`\`\`

**\`docker system prune -a --volumes\` is the dangerous one.** It deletes every unused volume, and "unused" means "no container currently references it" — which includes the database volume of a stack you stopped for the weekend. Run \`docker volume ls\` first and know what you are agreeing to.

::quiz
---
question: |-
  \`docker system df\` shows 18 GB of build cache. What reclaims it without touching images or volumes?
options:
  - |-
    \`docker builder prune\`
  - |-
    \`docker image prune -a\`
  - |-
    \`docker system prune -a --volumes\`
answer: 0
explanation: Build cache is its own storage type with its own prune command. \`image prune\` does not touch it, and the \`system prune -a --volumes\` form would work but also deletes your volumes, which is a very expensive way to reclaim cache.
---
::

## Cap the logs before they cap you

The default logging driver writes JSON to disk **with no size limit**. A chatty container will happily produce hundreds of gigabytes, and because the file is not in \`/var/lib/docker/volumes\` it does not show up in \`docker system df\` at all.

Set a limit globally in \`/etc/docker/daemon.json\`:

\`\`\`json
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
\`\`\`

The \`local\` driver is a better default than \`json-file\`: it compresses, rotates, and is cheaper to write. Engine 29.5 also added custom attributes to it, so you can tag log entries at the driver level.

Per service in Compose:

\`\`\`yaml
services:
  api:
    logging:
      driver: local
      options:
        max-size: "10m"
        max-file: "3"
\`\`\`

::fill-blank
---
prompt: Show how much disk space Docker is using, broken down by images, containers, volumes and build cache.
answer:
  - docker system df
  - docker system df -v
hint: Three words, and the last one is the same as the Unix disk-free command.
placeholder: docker system ...
---
::

::deep-dive{title="A checklist for the four failures you will actually hit"}
**"Connection refused" to a container you just published.** Nearly always the process inside bound to \`127.0.0.1\` instead of \`0.0.0.0\`. Inside a container, loopback means the container's own loopback, and nothing from outside can reach it. Configure the server to listen on all interfaces. If it is not that, check the \`-p\` order — host first.

**"No such file or directory" for a file that is definitely there.** On Alpine, this is usually the *dynamic linker* missing, not your file: a glibc-linked binary on musl. Check with \`ldd\`. Use a \`-slim\` Debian base or build a static binary.

**Works locally, fails in CI.** Architecture, most of the time — an image built on an ARM laptop and run on an x86 runner. \`docker image inspect -f '{{.Architecture}}'\` on both. Multi-platform builds are the fix, and they are a lesson in *Docker in Practice*.

**Permission denied on a bind-mounted file.** UIDs are numbers and do not map across the boundary. A container running as UID 1000 cannot write to a host directory owned by UID 501. Either run the container as the host's UID (\`--user "$(id -u):$(id -g)"\`) or use a named volume, where Docker owns the permissions and the question does not arise.

The general habit worth taking from this course: when something is wrong, ask **which layer** — image, container, network, volume — before you start changing things. The commands above each answer one of those, and the answer is usually one command away.
::

That is the whole of everyday Docker: run, build, store, connect, compose, debug. *Docker in Practice* picks up from here with multi-stage builds, BuildKit's cache and secret mounts, multi-platform images, Bake, and the Compose features that make a real development loop.
`;export{e as default};
