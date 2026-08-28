const e=`BuildKit has been Docker's default builder for years, and most Dockerfiles still do not use anything it added. This lesson is the features that make a real difference, and the one line that turns them on.

## The syntax directive

\`\`\`dockerfile
# syntax=docker/dockerfile:1
\`\`\`

First line of the file, before any comment you actually meant. It tells BuildKit which **frontend** to use — the parser that interprets the Dockerfile — and it downloads it.

That indirection is the point. Your Dockerfile syntax is no longer tied to your Docker version. A CI runner on an older engine still gets current syntax, and new features arrive by pulling a new frontend rather than upgrading the daemon.

\`docker/dockerfile:1\` tracks the latest stable 1.x. Pin harder if you need reproducibility (\`docker/dockerfile:1.26\`), and use the \`-labs\` variants for experimental features.

::terminal-teaser
---
lines:
  - cmd: docker build -t app .
    out: |-
      => resolve image config for docker.io/docker/dockerfile:1
      => docker-image://docker.io/docker/dockerfile:1.26.0
      => [internal] load build definition from Dockerfile
---
::

## Heredocs

Long \`RUN\` chains held together by \`&&\` and backslashes are hard to read and harder to diff. Heredocs work:

\`\`\`dockerfile
RUN <<EOF
set -eux
apt-get update
apt-get install -y --no-install-recommends curl ca-certificates
rm -rf /var/lib/apt/lists/*
EOF
\`\`\`

Still one layer, still one shell, and \`set -eux\` at the top gives you what \`&&\` was really for — stopping on the first failure. Without it, each line runs independently and the layer succeeds even if the install failed.

They also write files without a chain of \`echo\`s:

\`\`\`dockerfile
COPY <<EOF /etc/nginx/conf.d/app.conf
server {
  listen 80;
  location / { proxy_pass http://api:3000; }
}
EOF
\`\`\`

## Cache mounts

The one with the biggest day-to-day effect. \`RUN --mount=type=cache\` gives a directory that **persists across builds** but is **not part of the image**:

\`\`\`dockerfile
RUN --mount=type=cache,target=/root/.npm \\
    npm ci --omit=dev
\`\`\`

The npm cache survives, so a rebuild after a dependency change re-downloads only what changed instead of the whole tree. And because the mount is not a layer, none of it ships.

Per ecosystem:

\`\`\`dockerfile
# apt — note the extra flag to stop apt deleting its own cache
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \\
    --mount=type=cache,target=/var/lib/apt,sharing=locked \\
    rm -f /etc/apt/apt.conf.d/docker-clean && \\
    apt-get update && apt-get install -y --no-install-recommends curl

# pip
RUN --mount=type=cache,target=/root/.cache/pip \\
    pip install -r requirements.txt

# Go
RUN --mount=type=cache,target=/go/pkg/mod \\
    --mount=type=cache,target=/root/.cache/go-build \\
    go build -o /out/server ./cmd/server

# Cargo
RUN --mount=type=cache,target=/usr/local/cargo/registry \\
    --mount=type=cache,target=/app/target \\
    cargo build --release
\`\`\`

\`sharing=locked\` serialises concurrent builds that want the same cache, which is what apt needs — its lock files do not survive two builders at once.

::quiz
---
question: How does \`RUN --mount=type=cache\` differ from just letting a layer hold the cache directory?
options:
  - The cache persists across builds but never becomes part of the image
  - It is faster to write but otherwise identical
  - It caches the layer itself rather than its contents
answer: 0
explanation: A cache mount lives in the builder, not the image, so it survives cache invalidation of the layer above it and adds nothing to what you ship. A cache baked into a layer is the opposite on both counts — invalidated with the layer, and shipped forever.
---
::

## Bind mounts at build time

\`RUN --mount=type=bind\` exposes files from the context or another stage for one instruction, without copying them in:

\`\`\`dockerfile
RUN --mount=type=bind,source=package.json,target=package.json \\
    --mount=type=bind,source=package-lock.json,target=package-lock.json \\
    --mount=type=cache,target=/root/.npm \\
    npm ci --omit=dev
\`\`\`

The manifests are readable during the install and are not in the resulting layer. Combined with a cache mount, this is the fastest install step you can write.

## Secrets that never touch a layer

The important one. \`ARG\` and \`ENV\` both leak — \`ARG\` shows up in \`docker history\` in plain text, and \`ENV\` is baked into the image and visible to anyone who pulls it.

\`\`\`dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \\
    npm ci --omit=dev
\`\`\`

\`\`\`
docker build --secret id=npmrc,src=$HOME/.npmrc -t app .
\`\`\`

The file is mounted as a tmpfs for the duration of that one instruction. It is not a layer, not in \`docker history\`, and not in the image. The next lesson is entirely about this.

::quiz
---
question: |-
  Why is \`ARG GITHUB_TOKEN\` plus \`RUN git clone https://$GITHUB_TOKEN@…\` unsafe even if the token is never written to a file?
options:
  - Build arguments are recorded in the image metadata and visible in \`docker history\`
  - |-
    \`git clone\` writes the token into \`.git/config\`
  - It is safe as long as the build is not pushed
answer: 0
explanation: Both, actually — \`git\` does write the remote URL into \`.git/config\` — but the metadata leak is the one that catches people out, because it survives even if you delete the checkout. \`docker history --no-trunc\` on the published image shows the value. Use \`--mount=type=secret\`.
---
::

::fill-blank
---
prompt: Add a build-time cache mount for pip's cache directory \`/root/.cache/pip\` to a RUN instruction. Write just the mount flag.
answer:
  - |-
    --mount=type=cache,target=/root/.cache/pip
  - |-
    --mount=type=cache,target=/root/.cache/pip,sharing=locked
hint: Two settings, comma-separated — what kind of mount, and where it appears.
placeholder: |-
  --mount=...
---
::

::deep-dive{title="Build checks, SSH mounts, and \`--no-cache-filter\`"}
**Build checks.** BuildKit lints your Dockerfile as it builds and reports problems it can see — a stage name that collides, \`ENV\` used where \`ARG\` was meant, a \`FROM\` without a tag, casing inconsistencies:

\`\`\`
docker build --check .
\`\`\`

That runs the checks *only*, without building, which makes it a cheap CI step. The \`check\` parser directive (frontend 1.8) can promote warnings to errors so a bad Dockerfile fails the pipeline:

\`\`\`dockerfile
# syntax=docker/dockerfile:1
# check=error=true
\`\`\`

**SSH mounts**, for private Git dependencies:

\`\`\`dockerfile
RUN --mount=type=ssh \\
    go mod download
\`\`\`
\`\`\`
docker build --ssh default .
\`\`\`

The builder gets access to your local SSH **agent**, not your key. The key never enters the build, so it cannot end up in a layer. This is how a private Go module or a \`git+ssh\` npm dependency should be fetched — and it is what the two Nuxt apps in this workspace do for the rendering engine.

**Targeted cache busting.** \`--no-cache\` rebuilds everything, which is usually more than you wanted:

\`\`\`
docker build --no-cache-filter deps -t app .
\`\`\`

That invalidates the \`deps\` stage and keeps everything else. It is the right tool when a cache mount has gone stale or an \`apt-get update\` is serving package lists that no longer exist on the mirror.
::

Next up: build secrets in full — the several ways credentials end up in an image, and the one way they do not.
`;export{e as default};
