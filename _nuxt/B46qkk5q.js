const e=`Image size is not vanity. It is deploy latency on every node, storage on every registry and every host, and — the part that actually costs time — the number of packages a scanner has to find vulnerabilities in.

A 1.2 GB Node image and a 90 MB one run the same code. One of them reports two hundred CVEs from software you never invoke.

## Measure before you optimise

\`\`\`
docker image ls myapp
docker history myapp:1.0 --no-trunc --format '{{.Size}}\\t{{.CreatedBy}}'
docker system df -v
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker history myapp:1.0 --format '{{.Size}}\\t{{.CreatedBy}}' | head -6
    out: |-
      0B        CMD ["node" "dist/server.js"]
      2.1MB     COPY /app/dist ./dist
      184MB     RUN npm ci
      4.1kB     COPY package*.json ./
      0B        WORKDIR /app
      142MB     FROM node:22
---
::

Two lines account for 326 of the 328 MB. That is the general shape: **the base image and the dependency install are almost always the whole story**, and everything else is rounding.

Which means the two decisions worth making are which base, and what ends up in the final stage.

::quiz
---
question: |-
  \`docker history\` shows the base at 142 MB and one \`RUN npm ci\` at 184 MB. Where is the leverage?
options:
  - A smaller base and a runtime stage that installs only production dependencies
  - Combining the \`COPY\` instructions
  - Compressing the source before copying it
answer: 0
explanation: The small layers are noise. \`node:22-alpine\` or \`-slim\` cuts the base substantially, and \`npm ci --omit=dev\` in a runtime stage that only receives the build output typically halves the install.
---
::

## The moves that matter, in order

**Pick a smaller base.** Usually the single biggest win and a one-line change. \`node:22\` → \`node:22-slim\` → \`node:22-alpine\` walks 142 MB down to about 50, then about 12. Verify at each step: Alpine's musl libc breaks prebuilt wheels and some native modules, and a broken image is not small, it is broken.

**Ship only runtime dependencies.** A multi-stage build where the final stage installs with \`--omit=dev\`, \`--no-dev\`, or \`--production\` removes the entire test and build toolchain.

**Do not ship the toolchain.** Compilers, headers, and \`build-essential\` belong in a build stage. If the final image can compile your code, you shipped the compiler.

**Clean inside the same \`RUN\`.** Layers are append-only, so a deletion in a later instruction removes nothing.

**Have a real \`.dockerignore\`.** \`.git\` on a mature repository is often larger than the application.

**Do not \`COPY . .\` into the final stage.** Copy the built artifact. Source, tests, fixtures, and CI configuration have no business in a production image.

## A worked before-and-after

Before — 1.14 GB:

\`\`\`dockerfile
FROM node:22
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
CMD ["node", "dist/server.js"]
\`\`\`

Every problem at once: fat base, whole context copied first (so nothing caches), dev dependencies installed and kept, source and \`.git\` shipped, build tooling in the final image.

After — 78 MB:

\`\`\`dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
CMD ["node", "dist/server.js"]
\`\`\`

Same application. Fifteen times smaller, and it rebuilds in seconds because the dependency layers only move when the lockfile does.

::quiz
---
question: Why does the runtime stage run \`npm ci --omit=dev\` again instead of copying \`node_modules\` from the build stage?
options:
  - The build stage's \`node_modules\` includes dev dependencies; a fresh production install ships only what runs
  - Copying \`node_modules\` between stages is not permitted
  - It is faster
answer: 0
explanation: You could copy it — and you would carry the test framework, the bundler, and the type checker into production. The second install is cached on the lockfile, so it is nearly free, and it is the difference between shipping 400 packages and 90.
---
::

## Going smaller still

Below Alpine there are two more steps, both trading debuggability for surface.

**Distroless** — the language runtime and nothing else. No shell, no package manager, no \`ls\`:

\`\`\`dockerfile
FROM gcr.io/distroless/nodejs22-debian12
COPY --from=build /app/dist /app/dist
CMD ["/app/dist/server.js"]
\`\`\`

**\`scratch\`** — genuinely empty. Only for static binaries:

\`\`\`dockerfile
FROM scratch
COPY --from=build /out/server /server
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
ENTRYPOINT ["/server"]
\`\`\`

That certificate copy is the detail everyone hits: an empty image has no CA bundle, so every outbound HTTPS call fails with a certificate error that looks nothing like "your image is empty". \`scratch\` images also usually need \`/etc/passwd\` for a non-root user and \`/tmp\` if anything writes there.

The real cost of both is at 3am. \`docker exec\` needs a shell, and there is not one. \`docker debug\` (Docker Desktop) attaches a toolbox to a container without changing the image, and is the reason distroless is practical at all.

::fill-blank
---
prompt: Show the layer sizes of \`myapp:1.0\` with the full untruncated commands.
answer:
  - docker history --no-trunc myapp:1.0
  - docker history myapp:1.0 --no-trunc
  - docker image history --no-trunc myapp:1.0
hint: The history command, plus the flag that stops it abbreviating.
placeholder: docker history ...
---
::

::deep-dive{title="What small actually buys, and when to stop"}
The honest accounting, because "smaller is better" is not a strategy.

**Deploy speed.** Layers are cached per host, so on a machine that already has the base, a redeploy only pulls what changed. Well-ordered layers matter more than total size — a 500 MB image with a stable 480 MB base redeploys faster than a 200 MB image whose bottom layer changes every build.

**Attack surface.** This is the serious one. A distro base ships hundreds of packages, and a scanner reports vulnerabilities in every one — including the ones your application never calls. Most are unreachable in practice, but "unreachable in practice" is not a thing you can put in a compliance report, so somebody spends a week triaging. Fewer packages, less triage. That is what *Docker in Production* picks up with hardened images and VEX.

**Cost.** Registry storage and egress are real at scale and negligible below it.

**Where to stop.** Alpine or \`-slim\` plus a multi-stage build gets most of the benefit for almost no operational cost. Distroless is worth it for a service you deploy often and rarely debug interactively. \`scratch\` is worth it for a static binary and painful for anything else.

The one thing not worth doing is squashing layers to make the number smaller. It destroys layer sharing, so every deploy pulls the entire image instead of the changed part — a smaller image that is slower to deploy, which is the opposite of the point.
::

That is *Docker in Practice*: multi-stage builds, BuildKit's mounts, secrets that stay out of layers, multi-platform images, Bake, the Compose features a real project needs, lifecycle done properly, cache that survives CI, and size on purpose.

*Docker in Production* takes it the rest of the way — the engine underneath, container security, supply chain and attestations, Scout, hardened images, observability, and running AI workloads with Model Runner and Compose's \`models\` support.
`;export{e as default};
