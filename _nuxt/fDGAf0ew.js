const e=`Each instruction in a Dockerfile produces a **layer** — a record of what changed in the filesystem. An image is that stack of layers, and a container adds one thin writable layer on top.

This one mechanism explains build speed, image size, and a whole category of "why is my secret still in there" security incidents.

## Layers are stacked and shared

\`\`\`
myapp:1.0
├── layer 5  COPY . .                 (2 MB)   your source
├── layer 4  RUN npm ci --omit=dev    (48 MB)  dependencies
├── layer 3  COPY package*.json ./    (4 KB)
├── layer 2  WORKDIR /app             (0 B)
└── layer 1  FROM node:22-alpine      (52 MB)  base
\`\`\`

Layers are content-addressed and shared. Ten images built \`FROM node:22-alpine\` store that base once. Pulling a new version of your app downloads only the layers that changed — which is why a well-ordered image redeploys in seconds and a badly-ordered one re-downloads everything.

::terminal-teaser
---
lines:
  - cmd: docker history myapp:1.0 --format '{{.Size}}\\t{{.CreatedBy}}'
    out: |-
      2MB      COPY . . # buildkit
      48MB     RUN npm ci --omit=dev # buildkit
      4.1kB    COPY package*.json ./ # buildkit
      0B       WORKDIR /app
      52.3MB   FROM node:22-alpine
---
::

## The cache, and what invalidates it

BuildKit reuses a layer if the instruction and its inputs are unchanged. **When one layer misses, every layer after it is rebuilt** — the stack is ordered, so nothing below a change can be trusted.

Which makes instruction order a performance decision. Compare:

\`\`\`dockerfile
COPY . .                        # <- changes on every commit
RUN npm ci --omit=dev           # <- therefore reinstalls every build
\`\`\`

against:

\`\`\`dockerfile
COPY package*.json ./           # <- changes only when deps change
RUN npm ci --omit=dev           # <- cached across source edits
COPY . .                        # <- the cheap layer goes last
\`\`\`

Same image, same result. The second rebuilds in two seconds where the first takes ninety.

The principle generalises to every ecosystem: **copy the dependency manifest, install, then copy the source.** \`requirements.txt\` then \`pip install\`, \`go.mod\`/\`go.sum\` then \`go mod download\`, \`Cargo.toml\` then a warmup build, \`pom.xml\` then \`mvn dependency:go-offline\`.

::quiz
---
question: You add a comment to one source file and your build reinstalls all dependencies. What is wrong?
options:
  - |-
    \`COPY . .\` runs before the install step, so any source change invalidates the install layer
  - The build cache was cleared
  - Comments count as dependency changes
answer: 0
explanation: Cache invalidation cascades downward. Copying everything before installing means every commit busts the install layer. Copy the manifest first, install, then copy the rest.
---
::

## \`RUN\` chaining, and what it no longer buys

You will see a lot of Dockerfiles doing this:

\`\`\`dockerfile
RUN apt-get update && apt-get install -y curl \\
    && rm -rf /var/lib/apt/lists/*
\`\`\`

The \`&&\` chaining is not stylistic. **A layer is immutable once written**, so deleting a file in a *later* instruction does not remove its bytes from the image — it records a deletion on top, and the original layer still ships and still gets pulled. Cleanup only shrinks the image if it happens inside the same \`RUN\` that created the mess.

That is why the classic mistake is expensive:

\`\`\`dockerfile
RUN apt-get install -y build-essential   # +400 MB
RUN make && make install
RUN apt-get remove -y build-essential    # image is still +400 MB
\`\`\`

Modern BuildKit gives you better answers than chaining — cache mounts, and multi-stage builds where the toolchain simply never exists in the final image. Both are the first two lessons of *Docker in Practice*. Chaining remains the fallback when neither applies.

::quiz
---
question: A Dockerfile installs a 300 MB toolchain in one \`RUN\` and deletes it in a later \`RUN\`. What is the final image size impact?
options:
  - Roughly 300 MB larger — the files still exist in the earlier layer and are still shipped
  - Unchanged, since the files are gone from the final filesystem
  - Smaller, because the delete layer compresses well
answer: 0
explanation: Layers are append-only. The later layer records a whiteout marker; the bytes below it are still in the image and still pulled by everyone. Same instruction, or a separate build stage.
---
::

## Anything written into a layer is public

This is the security half, and it is worth being blunt.

\`\`\`dockerfile
COPY .env /app/.env
RUN ./setup.sh && rm /app/.env     # the file is gone from the final filesystem
\`\`\`

The file is still in the image. Anyone who pulls it can \`docker save\` the image, untar it, and read the layer. The same is true of a secret passed as \`ARG\`, which additionally shows up in \`docker history\` in plain text.

There is no way to remove it after the fact except rebuilding without it and treating the credential as compromised. The real answer is \`RUN --mount=type=secret\`, covered in *Docker in Practice* — a secret mounted for one instruction and never written to any layer.

::fill-blank
---
prompt: Show the layer-by-layer history of the image \`myapp:1.0\`.
answer:
  - docker history myapp:1.0
  - docker image history myapp:1.0
hint: One word, and it means what it sounds like.
placeholder: docker ...
---
::

::deep-dive{title="Reading a BuildKit build, and when to break the cache"}
BuildKit's output tells you what it did with each step:

\`\`\`
 => CACHED [3/6] COPY package*.json ./
 => CACHED [4/6] RUN npm ci --omit=dev
 => [5/6] COPY . .                          0.3s
\`\`\`

\`CACHED\` means reused. A step with a duration ran. The first non-\`CACHED\` line is where your cache broke — and if that line is higher up than you expected, that is the thing to fix.

BuildKit also builds a **graph**, not a list: independent stages run in parallel, and a stage nothing depends on is skipped entirely. This is why a multi-stage build is often faster than the single-stage version rather than slower.

**Deliberately breaking the cache** is occasionally what you want:

\`\`\`
docker build --no-cache -t myapp .          # rebuild everything
docker build --no-cache-filter deps -t myapp .   # rebuild one stage
\`\`\`

The second is the more useful and the less known: it discards the cache for a named stage and keeps the rest.

There is one cache miss that is not your fault. \`RUN apt-get update\` caches happily, and a week later it is installing package lists that no longer match the mirror — the notorious \`404 Not Found\` on a version that was fine yesterday. Keeping \`update\` and \`install\` in the same \`RUN\` is the standard defence, which is the other reason for that \`&&\`.
::

Next up: volumes — where data goes when the container it lived in is deleted.
`;export{e as default};
