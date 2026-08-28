const e=`The development loop that puts people off containers is: edit a file, rebuild the image, recreate the container, wait, refresh. Thirty seconds for a one-character change.

The old workaround was bind-mounting your source in, which works until it does not — the dependency directory disappears under the mount, the UIDs are wrong, and a change to \`package.json\` needs a rebuild the mount cannot give you.

**Compose Watch** is the built-in answer, and it distinguishes between changes that need copying and changes that need rebuilding.

## The three actions

\`\`\`yaml
services:
  web:
    build: .
    command: npm run dev
    ports:
      - "127.0.0.1:3000:3000"
    develop:
      watch:
        - action: sync
          path: ./src
          target: /app/src
          ignore:
            - node_modules/

        - action: rebuild
          path: ./package.json

        - action: sync+restart
          path: ./config/app.yaml
          target: /app/config/app.yaml
\`\`\`

\`\`\`
docker compose up --watch          # run the stack and watch
docker compose watch               # watch only, logs kept separate
\`\`\`

**\`sync\`** copies changed files into the running container. Nothing restarts. For anything with hot reload — Vite, nodemon, \`flask --debug\`, \`air\` — this is the fast path, and it is genuinely instant.

**\`rebuild\`** builds a new image and replaces the container. For a dependency manifest, or a compiled language where the source is not what runs.

**\`sync+restart\`** copies the file and restarts the container's process without rebuilding. For configuration a running process reads once at startup.

::terminal-teaser
---
lines:
  - cmd: docker compose up --watch
    out: |-
      ✔ Container app-web-1  Started
      Watch enabled
  - cmd: |-
      # edit src/routes.js on the host
    out: |-
      Syncing service "web" after changes were detected:
        - src/routes.js
  - cmd: |-
      # edit package.json on the host
    out: |-
      Rebuilding service "web" after changes were detected...
      ✔ Container app-web-1  Recreated
---
::

::quiz
---
question: Which action fits a change to \`requirements.txt\` in a Python service?
options:
  - |-
    \`rebuild\` — the dependency set changed, so the image has to be built again
  - |-
    \`sync\` — copy the file in and the running process will notice
  - |-
    \`sync+restart\` — copy it and restart the process
answer: 0
explanation: Copying the file in does nothing on its own; the packages are installed at build time. \`rebuild\` is the only action that reruns the install. The usual pairing is \`sync\` on the source directory and \`rebuild\` on the manifest.
---
::

## Why this beats a bind mount

Watch **copies into** the container rather than mounting over it. That single difference removes the three classic bind-mount problems:

- **Nothing gets hidden.** The image's \`node_modules\` at \`/app/node_modules\` stays exactly where it was, because no mount is covering \`/app\`. No anonymous-volume workaround needed.
- **Ownership is the container's.** Files arrive owned by the container's user, so no permission-denied on a file your host user created.
- **Rebuilds are part of the model.** A bind mount has no concept of "this change needs a new image". Watch does.

The cost is that it is one-directional: files a container generates do not come back to the host. Anything you need on the host — a generated migration, a lockfile update — still wants a bind mount or a \`docker compose cp\`.

::quiz
---
question: You bind-mounted your project over \`/app\` and the image's installed \`node_modules\` vanished. How does Watch avoid this?
options:
  - It copies files into the container instead of mounting over the directory, so nothing is hidden
  - It mounts \`node_modules\` separately by default
  - It reinstalls dependencies on every change
answer: 0
explanation: A mount replaces the view at its target and hides whatever the image put there. A copy leaves the rest of the directory intact — which is why the anonymous-volume trick stops being necessary.
---
::

## \`ignore\`, and why it matters more than it looks

\`\`\`yaml
        - action: sync
          path: .
          target: /app
          ignore:
            - node_modules/
            - .git/
            - "*.log"
            - dist/
\`\`\`

\`ignore\` paths are relative to \`path\`. Without them, watching a project root means watching every dependency directory and every build artifact — thousands of files, a constant stream of sync events, and on macOS and Windows a noticeable CPU cost from the filesystem event bridge.

Watch also honours \`.dockerignore\` for \`rebuild\` actions, but \`ignore\` is what governs \`sync\`. They are worth keeping consistent.

::fill-blank
---
prompt: Start the stack in the foreground with file watching enabled, in one command.
answer:
  - docker compose up --watch
  - docker compose up -w
  - docker compose watch
hint: The normal start command plus one flag.
placeholder: docker compose up ...
---
::

## A complete development file

\`\`\`yaml
services:
  api:
    build:
      context: .
      target: dev
    command: npm run dev
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgres://app:secret@db:5432/app
    depends_on:
      db:
        condition: service_healthy
    develop:
      watch:
        - action: sync
          path: ./src
          target: /app/src
        - action: sync
          path: ./public
          target: /app/public
        - action: rebuild
          path: ./package.json

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
\`\`\`

Note \`target: dev\` on the build. Watch pairs naturally with a multi-stage Dockerfile that has a \`dev\` stage carrying the dev dependencies and the watcher, and a production stage that has neither.

::deep-dive{title="When Watch is the wrong tool"}
Watch only applies to services built from a local \`build:\` context. A service running a pulled image has nothing to sync into and nothing to rebuild, so the key is ignored.

Three situations where something else is a better fit:

**A compiled language with a slow build.** \`rebuild\` on every source change means a full image build. Native tooling with a file watcher inside the container — \`air\` for Go, \`cargo watch\` for Rust — plus \`sync\` on the source is usually faster, because the incremental compiler cache survives.

**You need generated files back on the host.** Watch pushes one way. A framework that writes migrations, updates a lockfile, or regenerates types is producing artifacts you want committed. Bind-mount that specific directory, or \`docker compose cp\` after the fact.

**Very large trees on macOS or Windows.** File events cross a VM boundary, and a watch over tens of thousands of files is measurably expensive. Narrow \`path\` to the directories that actually change, rather than watching the root and ignoring most of it.

The general shape worth keeping: **sync the code, rebuild the dependencies, and keep the dev stage separate from the production one.** Everything else is tuning.
::

Next up: healthchecks, signals, and lifecycle — making a container start, stop, and fail the way you intended.
`;export{e as default};
