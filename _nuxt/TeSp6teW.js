const e=`Almost every image built by someone learning Docker ships the tools that built it. The compiler, the dev dependencies, the package manager's cache, sometimes the source and the \`.git\` directory. None of it runs in production; all of it is pulled on every deploy and scanned by every CVE tool.

**Multi-stage builds** are the fix, and they are one keyword.

## More than one \`FROM\`

\`\`\`dockerfile
# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /out/server ./cmd/server

FROM alpine:3.22
RUN adduser -D -u 10001 app
COPY --from=build /out/server /usr/local/bin/server
USER app
ENTRYPOINT ["server"]
\`\`\`

Each \`FROM\` starts a new stage with a clean filesystem. \`COPY --from=build\` reaches back into an earlier one and takes exactly what it names.

**Only the last stage becomes the image.** The Go toolchain, the module cache, the source tree — all of it existed during the build and none of it is in the result.

::terminal-teaser
---
lines:
  - cmd: docker build -t api:single -f Dockerfile.single .
    out: |-
      => => naming to docker.io/library/api:single
  - cmd: docker build -t api:multi .
    out: |-
      => => naming to docker.io/library/api:multi
  - cmd: docker image ls api
    out: |-
      IMAGE   TAG      SIZE
      api     single   1.14GB
      api     multi    16.8MB
---
::

Two orders of magnitude, same binary. The single-stage image is mostly the Go toolchain.

::quiz
---
question: In a two-stage build, what happens to the first stage's filesystem?
options:
  - It is discarded — only the final stage becomes the image, and only what you \`COPY --from\` survives
  - It becomes the image's lower layers
  - It is kept as a separate cached image and pushed alongside
answer: 0
explanation: Stages are independent filesystems. The builder keeps earlier stages around locally for caching, but they are not part of the image, are not pushed, and are not pulled by anyone.
---
::

## The pattern per ecosystem

The shape is always the same — a fat stage that produces an artifact, a thin stage that runs it. What differs is what "artifact" means.

**Node** — install dev dependencies, build, then install production dependencies fresh:

\`\`\`dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
\`\`\`

**Python**, where the artifact is a virtualenv rather than a binary:

\`\`\`dockerfile
FROM python:3.14-slim AS build
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.14-slim
COPY --from=build /opt/venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY . .
USER 10001
CMD ["python", "-m", "app"]
\`\`\`

Copying a whole venv works because it is self-contained — as long as both stages use the same base and the same Python version, which is why they are pinned identically.

## Stages are a graph, not a list

BuildKit does not run stages top to bottom. It builds a dependency graph and **runs independent stages in parallel**, skipping any stage nothing depends on.

\`\`\`dockerfile
FROM node:22-alpine AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS test
COPY . .
RUN npm test

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
\`\`\`

\`test\` and \`build\` both extend \`deps\` and neither depends on the other, so they run concurrently. And a plain \`docker build .\` **never runs the tests** — nothing in the \`runtime\` chain references \`test\`, so BuildKit prunes it.

Which is a feature, not a bug. Ask for it explicitly when you want it:

\`\`\`
docker build --target test .        # run the tests
docker build -t app:latest .        # ship the image, skip them
\`\`\`

::quiz
---
question: A Dockerfile has a \`test\` stage running \`npm test\`, but \`docker build .\` never runs it. Why?
options:
  - Nothing in the final stage's dependency chain references \`test\`, so BuildKit prunes it
  - Tests are disabled in BuildKit by default
  - The \`test\` stage needs an explicit \`RUN --network\` flag
answer: 0
explanation: BuildKit builds the graph needed to produce the target and nothing else. Run it with \`--target test\`, or make it a real gate in CI as its own build step.
---
::

::fill-blank
---
prompt: Build only up to the stage named \`build\`, tagging the result \`app:build\`.
answer:
  - docker build --target build -t app:build .
  - docker build -t app:build --target build .
  - docker buildx build --target build -t app:build .
hint: One flag names the stage to stop at.
placeholder: docker build ...
---
::

::deep-dive{title="\`COPY --link\`, and copying from an image you never built"}
**\`COPY --link\`** changes how a copy is layered. Normally a \`COPY\` layer is written on top of the previous filesystem, so it depends on everything below it — change an earlier layer and the copy is redone. With \`--link\`, the copied content becomes an independent layer, merged in later:

\`\`\`dockerfile
COPY --link --from=build /out/server /usr/local/bin/server
\`\`\`

The copy no longer depends on the layers under it, so changing the base image does not invalidate it. On a big \`COPY\` after a frequently-changing base, it is a large rebuild saving. The caveat: the destination is created fresh rather than merged into what was there, so it is not a drop-in replacement when you are copying *into* an existing populated directory.

**\`COPY --from\` also accepts an image name**, not just a stage:

\`\`\`dockerfile
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
\`\`\`

This is how you pull a single binary out of a published image without a stage of your own, and it is increasingly how tools ship — one static binary in a scratch image, designed to be copied out.

**Two more worth knowing**, both recent frontend additions: \`COPY --parents\` (frontend 1.20) preserves directory structure when copying with wildcards, so \`COPY --parents src/**/*.json ./\` keeps the paths instead of flattening them. And \`COPY --exclude\` (1.19) filters within a copy without editing \`.dockerignore\`.

All four need the syntax line — \`# syntax=docker/dockerfile:1\` — which is the next lesson's subject.
::

Next up: BuildKit and the modern Dockerfile — heredocs, cache mounts, and the features that first line unlocks.
`;export{e as default};
