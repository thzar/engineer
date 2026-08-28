const e=`Every container you have run came from an image, and every image came from somewhere. This lesson is about that somewhere, and about the naming scheme that confuses people for longer than it should.

## Reading an image name

A full image reference has four parts, and you almost never write all of them:

\`\`\`
docker.io/library/nginx:1.29-alpine
└──┬───┘ └──┬────┘ └─┬─┘ └────┬────┘
registry  namespace  name    tag
\`\`\`

Omit the registry and you get Docker Hub. Omit the namespace on Docker Hub and you get \`library\`, the official-images namespace. Omit the tag and you get \`latest\`.

So \`nginx\` and \`docker.io/library/nginx:latest\` are the same thing. And \`ghcr.io/myorg/myapp:v2\` is a different registry entirely — the registry is just a hostname, and every cloud provider runs one.

::terminal-teaser
---
lines:
  - cmd: docker pull nginx:1.29-alpine
    out: |-
      1.29-alpine: Pulling from library/nginx
      Digest: sha256:9d1b1c0f...
      Status: Downloaded newer image for nginx:1.29-alpine
  - cmd: docker image ls
    out: |-
      IMAGE          TAG          ID             SIZE
      nginx          1.29-alpine  4c1e2b8a91d7   52.3MB
      alpine         latest       a8f4e2c11b09   7.8MB
---
::

## \`latest\` is not the latest

This is the naming trap, and it costs people real time.

\`latest\` is not a version. It is not resolved at pull time to whatever is newest. **It is just the default tag** — the one used when you do not name one — and it points at whatever the publisher last pushed under that name. Which may be months old, or a release candidate, or an entirely different major version than last week.

\`\`\`
FROM node:latest        # unpredictable: could change under you tomorrow
FROM node:22            # better: pinned to a major line, still gets patches
FROM node:22.14-alpine  # better still for reproducibility
FROM node@sha256:9f2a…  # exact bytes, immutable, what production wants
\`\`\`

Tags are **mutable pointers**. A publisher can move \`node:22\` to new bytes at any time, and most do — that is how you get security patches. A **digest** (\`@sha256:…\`) is the content hash and cannot move. The Advanced course argues for digests in production; for now, the habit worth forming is simply never writing \`latest\` in a Dockerfile.

::quiz
---
question: Your build worked yesterday and fails today. Nothing in your repository changed. The Dockerfile starts \`FROM python:latest\`. What is the likely cause?
options:
  - The \`latest\` tag now points at different bytes — probably a new Python version
  - Docker Hub rate-limited your pull
  - The build cache expired
answer: 0
explanation: Tags are mutable pointers and \`latest\` is the one most likely to move. This is the whole argument for pinning. Rate limiting is real too, but it fails loudly with a 429 rather than a compile error.
---
::

## What \`docker image ls\` shows now

Docker Engine 29 changed this command's default output. It now uses what was previously behind \`--tree\`, and it **no longer lists untagged images unless you pass \`--all\`**.

\`\`\`
docker image ls              # tagged images, tree view
docker image ls --all        # including untagged intermediate layers
docker image ls --tree       # explicit, same as the default now
\`\`\`

If you learned Docker before this and remember a flat table full of \`<none>\` entries, that is what changed. The \`<none>\` images did not go anywhere; they are just no longer the first thing you see.

## Building and tagging

\`\`\`
docker build -t myapp:1.0 .
docker tag myapp:1.0 myapp:latest
docker tag myapp:1.0 ghcr.io/myorg/myapp:1.0
\`\`\`

\`docker tag\` does not copy anything. It adds a second name pointing at the same image ID — like a hard link. Which is why re-tagging is instant regardless of image size, and why deleting one tag does not delete the image if another still points at it.

To push, the tag must contain the destination registry. That is why the third line above exists: you cannot push \`myapp:1.0\` anywhere, because that name says Docker Hub's \`library\` namespace, which you do not own.

::terminal-teaser
---
lines:
  - cmd: docker login ghcr.io
    out: Login Succeeded
  - cmd: docker push ghcr.io/myorg/myapp:1.0
    out: |-
      The push refers to repository [ghcr.io/myorg/myapp]
      1.0: digest: sha256:7c3e1a... size: 1163
---
::

::fill-blank
---
prompt: Give the existing image \`myapp:1.0\` a second name so it can be pushed to \`ghcr.io/acme/myapp\` as version \`1.0\`.
answer:
  - docker tag myapp:1.0 ghcr.io/acme/myapp:1.0
  - docker image tag myapp:1.0 ghcr.io/acme/myapp:1.0
hint: One command, source name then destination name.
placeholder: docker tag ...
---
::

## Choosing a base image

The base image decides most of your final size, most of your CVE count, and which debugging tools you have at 3am. The usual ladder:

| Base | Size | Trade-off |
|---|---|---|
| \`ubuntu\`, \`debian\` | 70–120 MB | everything works, everything is present, largest surface |
| \`*-slim\` | 25–80 MB | same distro, docs and extras stripped |
| \`alpine\` | 5–15 MB | musl libc, not glibc — some binaries and wheels break |
| distroless | 2–20 MB | no shell, no package manager; hard to debug, hard to exploit |
| \`scratch\` | 0 | nothing at all; static binaries only |

Alpine's catch is worth stating because it costs people an afternoon: it uses **musl** rather than glibc. Most things are fine; Python packages with compiled wheels, some Node native modules, and anything shipping a glibc-linked binary are not, and the failure is usually a confusing "not found" for a file that plainly exists.

::quiz
---
question: A Python app runs on \`python:3.13\` but crashes on \`python:3.13-alpine\` with errors about missing shared libraries. Why?
options:
  - Alpine uses musl libc rather than glibc, so prebuilt wheels compiled against glibc don't load
  - Alpine ships an older Python
  - Alpine images cannot run Python at all
answer: 0
explanation: The wheels are built for \`manylinux\`, which means glibc. On Alpine, pip falls back to building from source — so it either needs a compiler toolchain in the image or fails outright. \`python:3.13-slim\` is usually the better small base for Python.
---
::

::deep-dive{title="Rate limits, mirrors, and why your CI started failing"}
Docker Hub applies pull-rate limits to anonymous and free accounts, counted per IP. Which is fine on a laptop and not fine on shared CI, where every job on the runner shares one address and the pool exhausts before lunch.

Symptoms: \`toomanyrequests: You have reached your pull rate limit\`, usually appearing suddenly on a pipeline that was fine last week because the team grew.

The fixes, in ascending order of effort:

- **Authenticate in CI.** A logged-in pull counts against your account, not the shared IP.
- **Pull from a different registry.** Many official images are mirrored — \`mcr.microsoft.com\`, \`public.ecr.aws\`, \`quay.io\`, \`ghcr.io\`.
- **Run a pull-through cache.** The \`registry:3\` image can proxy Docker Hub, so your builders pull once and serve locally after that.

The daemon also takes a \`registry-mirrors\` setting in \`/etc/docker/daemon.json\`, which redirects Hub pulls without touching a single image name in your Dockerfiles.
::

Next up: writing a Dockerfile — turning your own code into one of these things.
`;export{e as default};
