const e=`An image built on an Apple Silicon laptop is \`linux/arm64\`. Run it on a normal cloud VM and you get \`exec format error\`, or — worse, because it looks like it works — silent QEMU emulation at a fraction of the speed.

A **multi-platform image** is one tag that carries several architectures, with the registry handing each puller the right one.

## What is actually stored

A multi-platform tag points at a **manifest list** (or "image index"): a small document listing one manifest per platform, each pointing at its own layers.

::terminal-teaser
---
lines:
  - cmd: docker buildx imagetools inspect nginx:1.29-alpine
    out: |-
      Name:      docker.io/library/nginx:1.29-alpine
      MediaType: application/vnd.oci.image.index.v1+json
      Manifests:
        Platform:  linux/amd64
        Platform:  linux/arm64
        Platform:  linux/arm/v7
        Platform:  linux/s390x
---
::

\`docker pull nginx:1.29-alpine\` on an ARM machine fetches the arm64 manifest and nothing else. The selection happens in the client, from the index, at pull time.

::quiz
---
question: What does a multi-platform tag actually point at in the registry?
options:
  - A manifest list indexing one manifest per platform, each with its own layers
  - A single image containing binaries for every architecture
  - The amd64 image, with others converted on demand
answer: 0
explanation: Nothing is fat and nothing is converted. The index is a few hundred bytes; the client reads it, picks the matching platform, and pulls only those layers.
---
::

## You need a different builder

The default \`docker\` driver builds one platform at a time. Multi-platform needs a builder that can hold several results:

\`\`\`
docker buildx create --name multi --driver docker-container --use
docker buildx inspect --bootstrap
\`\`\`

The drivers worth knowing:

| Driver | What it is |
|---|---|
| \`docker\` | the default, built into the daemon. One platform per build. |
| \`docker-container\` | BuildKit in a container. Multi-platform, cache export, most features. |
| \`remote\` | a BuildKit instance you connect to over the network. |
| \`cloud\` | Docker Build Cloud — managed native builders for each architecture. |

\`docker-container\` is the one to reach for locally, and the catch is that it cannot load a multi-platform result into your local image store. Push it, or build one platform at a time with \`--load\`.

## The three ways to build for another architecture

**Emulation.** Easiest, slowest. QEMU translates instructions so an arm64 build runs on an amd64 machine unchanged.

\`\`\`
docker run --privileged --rm tonistiigi/binfmt --install all

docker buildx build --platform linux/amd64,linux/arm64 -t acme/app:1.0 --push .
\`\`\`

No Dockerfile changes. Docker Desktop bundles QEMU already. But anything compute-heavy — compiling, running a test suite — gets very slow, often ten times or worse.

**Cross-compilation.** Fastest, and language-dependent. Build natively and target the other architecture, using the build arguments BuildKit provides:

\`\`\`dockerfile
# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS build
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \\
    GOOS=$TARGETOS GOARCH=$TARGETARCH go build -o /out/server ./cmd/server

FROM alpine:3.22
COPY --from=build /out/server /usr/local/bin/server
ENTRYPOINT ["server"]
\`\`\`

\`--platform=$BUILDPLATFORM\` pins the build stage to the **builder's native** architecture, so the compiler runs at full speed. \`$TARGETOS\` and \`$TARGETARCH\` say what to produce. The final stage has no \`--platform\`, so it is built for each target — it only copies a binary, which is free.

Go, Rust, .NET and anything else with a real cross-compiler suit this. Interpreted languages with native extensions usually do not.

**Native nodes.** Best of both, most setup: a builder with a real machine per architecture.

\`\`\`
docker buildx create --name multi --node amd64 --platform linux/amd64
docker buildx create --append --name multi --node arm64 --platform linux/arm64
\`\`\`

Each stage runs natively on the matching node. This is what Docker Build Cloud sells as a service.

::quiz
---
question: Why does \`FROM --platform=$BUILDPLATFORM\` on the build stage speed up a cross-compiled multi-arch build?
options:
  - It pins the toolchain to the builder's own architecture so the compiler runs natively instead of under emulation
  - It skips the build stage for non-native platforms
  - It caches the stage across platforms
answer: 0
explanation: Without it, BuildKit builds that stage once per target platform — under QEMU for the foreign one, which is where all the time goes. With it, one native compiler run produces each target binary via \`GOOS\`/\`GOARCH\`.
---
::

## Building and shipping it

\`\`\`
docker buildx build \\
  --platform linux/amd64,linux/arm64 \\
  -t ghcr.io/acme/app:1.0 \\
  --push .
\`\`\`

\`--push\` matters. A multi-platform result cannot be loaded into the local image store by the \`docker-container\` driver, so \`--load\` fails and building without either output flag leaves you with nothing but a warmed cache.

Building only for your own machine while iterating:

\`\`\`
docker buildx build --load -t app:dev .
\`\`\`

::fill-blank
---
prompt: Build for both linux/amd64 and linux/arm64 and push the result as \`ghcr.io/acme/app:1.0\`.
answer:
  - docker buildx build --platform linux/amd64,linux/arm64 -t ghcr.io/acme/app:1.0 --push .
  - docker buildx build --platform linux/arm64,linux/amd64 -t ghcr.io/acme/app:1.0 --push .
  - docker build --platform linux/amd64,linux/arm64 -t ghcr.io/acme/app:1.0 --push .
hint: Platforms comma-separated in one flag, and an output flag so the result goes somewhere.
placeholder: docker buildx build ...
---
::

::deep-dive{title="What Engine 29's image store changed here"}
Multi-platform images used to be awkward locally for one specific reason: **the old image store could hold only one architecture per tag.** So a multi-platform build had to go straight to a registry — you could not keep the result, and \`docker image save\` gave you one platform silently.

Engine 29 made the **containerd image store the default on fresh installs**, and it holds full indexes. Consequences:

- \`docker image save\` and \`docker image load\` take \`--platform\` and handle multiple platforms.
- You can inspect and keep multi-platform images locally rather than round-tripping through a registry.
- Attestations attached to a build are stored properly instead of being dropped.

\`docker info\` tells you which store you have; installations that upgraded rather than being freshly installed keep the old one.

**Two habits regardless of store.** Check what you actually produced — \`docker buildx imagetools inspect <tag>\` lists the platforms in a published index. And check what you are running when something is inexplicably slow: \`docker image inspect -f '{{.Architecture}}'\`, because an amd64 image quietly emulated on arm64 does not announce itself, it just runs at a third of the speed.
::

Next up: Bake — the declarative file that replaces a page of buildx flags, and which Compose v5 now builds through.
`;export{e as default};
