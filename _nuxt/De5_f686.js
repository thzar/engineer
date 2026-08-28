const e=`Your laptop rebuilds in four seconds. CI takes eight minutes for the same commit, every time, because a fresh runner has no cache and the first \`RUN\` misses.

Everything in the Beginner course about layer ordering still applies — but a cache only helps if the machine doing the build has it. This lesson is about moving it.

## Where the cache lives

BuildKit keeps its cache in the builder, not in the image. So a cache is tied to a builder instance, and a CI runner that is created and destroyed per job has a cold one every time.

The fix is a **cache backend**: export the cache somewhere durable at the end of a build, import it at the start of the next.

\`\`\`
docker buildx build \\
  --cache-to   type=registry,ref=ghcr.io/acme/app:buildcache,mode=max \\
  --cache-from type=registry,ref=ghcr.io/acme/app:buildcache \\
  -t ghcr.io/acme/app:1.0 --push .
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker buildx build --cache-from type=registry,ref=ghcr.io/acme/app:buildcache -t app .
    out: |-
      => importing cache manifest from ghcr.io/acme/app:buildcache
      => CACHED [2/6] COPY package*.json ./
      => CACHED [3/6] RUN npm ci --omit=dev
      => [4/6] COPY . .                            0.4s
      [+] Building 11.2s (14/14) FINISHED
---
::

\`mode=max\` is the flag that matters and the one people miss. The default, \`mode=min\`, exports only the layers of the final image — which for a multi-stage build means **none of the expensive intermediate stages**, so the cache imports and the dependency install still runs. \`mode=max\` exports every stage.

::quiz
---
question: You added a registry cache to CI and dependency installs are still not cached. What is most likely missing?
options:
  - |-
    \`mode=max\` on \`--cache-to\` — the default only exports the final stage's layers
  - The \`--push\` flag
  - A separate builder for each stage
answer: 0
explanation: With \`mode=min\`, intermediate stages — where the install happens in any multi-stage build — are not exported at all. The import succeeds and caches almost nothing, which is why it looks like the feature is broken rather than misconfigured.
---
::

## The backends

| Type | Where it stores | Good for |
|---|---|---|
| \`registry\` | a tag in your container registry | anywhere; the portable default |
| \`gha\` | GitHub Actions' cache service | GitHub Actions |
| \`s3\` / \`azblob\` | object storage | self-hosted runners, large caches |
| \`local\` | a directory | a persistent runner or a mounted volume |
| \`inline\` | inside the image itself | simple cases, \`mode=min\` only |

\`inline\` is the easy one and the limited one — the cache metadata rides along inside the published image, so there is nothing extra to manage, but it cannot do \`mode=max\`. For anything multi-stage, use \`registry\`.

A registry cache is a real tag consuming real storage, so give it its own name and a retention policy. \`app:buildcache\` next to \`app:1.0\` is the convention.

## In GitHub Actions

\`\`\`yaml
      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/acme/app:\${{ github.sha }}
          platforms: linux/amd64,linux/arm64
          cache-from: type=gha
          cache-to: type=gha,mode=max
\`\`\`

\`setup-buildx-action\` is required — the default \`docker\` driver cannot export cache or build multi-platform. \`type=gha\` uses the runner's own cache service and needs no registry credentials.

GitHub's cache is scoped per branch, with reads falling back to the default branch. So the first build on a new branch inherits \`main\`'s cache and only pays for what actually differs — which is the behaviour you want and is easy to lose by keying it manually.

::quiz
---
question: Why does a workflow need \`docker/setup-buildx-action\` before \`build-push-action\` for a cached multi-platform build?
options:
  - The default \`docker\` driver supports neither cache export nor multi-platform builds
  - It installs Docker on the runner
  - It authenticates to the registry
answer: 0
explanation: The runner has Docker already, and login is a separate action. What is missing is a \`docker-container\` builder — the default driver builds one platform and cannot export cache to any backend.
---
::

## Cache mounts do not travel

A subtlety that costs people an afternoon: \`RUN --mount=type=cache\` directories are **builder-local and are not exported** by \`--cache-to\`. A fresh CI runner starts with an empty npm cache no matter how well the registry cache is configured.

What the registry cache preserves is the **layer** — so if \`package-lock.json\` has not changed, the whole \`npm ci\` step is a cache hit and the mount is never consulted. The mount only earns its keep when the layer *does* miss, which on a persistent runner is often and on an ephemeral one is every time.

The practical reading: layer caching is what makes CI fast; cache mounts are what make a *miss* less painful. Configure both, expect the first to do the work.

::fill-blank
---
prompt: Add the flag that exports the build cache to the registry ref \`ghcr.io/acme/app:buildcache\`, including intermediate stages.
answer:
  - |-
    --cache-to type=registry,ref=ghcr.io/acme/app:buildcache,mode=max
  - |-
    --cache-to=type=registry,ref=ghcr.io/acme/app:buildcache,mode=max
hint: Type, ref, and the mode that exports every stage.
placeholder: |-
  --cache-to ...
---
::

::deep-dive{title="Managed builders, and when to stop optimising"}
There is a point where the answer is not a better cache but a better machine.

**Docker Build Cloud** gives you managed native builders — real amd64 and arm64 machines with a shared persistent cache — used with one flag:

\`\`\`
docker buildx build --builder cloud-acme-default --platform linux/amd64,linux/arm64 --push -t ghcr.io/acme/app:1.0 .
\`\`\`

The cache is shared across your whole team and CI, so a colleague's build warms yours. And multi-arch stops being an emulation problem, because each platform is built on hardware that natively runs it.

**Docker Offload** is the adjacent idea for running rather than building: containers execute on cloud hardware while the local CLI and Compose experience is unchanged. Useful when the workload wants a GPU or more memory than the laptop has.

Both are paid. Whether they are worth it is arithmetic: developer-minutes per build times builds per day. A five-minute CI build that runs forty times a day is a working day of waiting, every day.

**Before paying for anything**, get the free wins, in this order — they are ordered by how much they typically return:

1. **A real \`.dockerignore\`.** Sending a 500 MB context is pure waste before any cache is consulted.
2. **Correct layer ordering.** Manifest, install, then source. This is still the single biggest lever.
3. **Multi-stage builds**, so heavy stages are skipped for the targets that do not need them.
4. **\`mode=max\` cache export** to a registry or \`gha\`.
5. **Cache mounts** for package managers.
6. **Then** consider paying for hardware.

Most slow builds are still failing at steps one and two, and no amount of managed infrastructure fixes a build that copies the whole repository before installing dependencies.
::

Next up: the last lesson — making images small on purpose, and measuring whether you succeeded.
`;export{e as default};
