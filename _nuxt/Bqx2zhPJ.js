const e=`Everything so far has been one container at a time, typed by hand. A real application is four containers with a network, two volumes, an ordering constraint, and eleven flags nobody will remember tomorrow.

**Compose** is that written down. One file, one command, reproducible.

## The file

\`compose.yaml\` in your project root:

\`\`\`yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    depends_on:
      db:
        condition: service_healthy

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
      timeout: 3s
      retries: 5

volumes:
  pgdata:
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker compose up -d
    out: |-
      [+] Running 4/4
       ✔ Network myapp_default  Created
       ✔ Volume myapp_pgdata    Created
       ✔ Container myapp-db-1   Healthy
       ✔ Container myapp-api-1  Started
  - cmd: docker compose ps
    out: |-
      NAME           IMAGE               STATUS
      myapp-api-1    myapp-api           Up 6 seconds
      myapp-db-1     postgres:17-alpine  Up 12 seconds (healthy)
---
::

Read what it did without being asked. It **created a network** — a user-defined one, so \`api\` can reach \`db\` by name, which is the DNS problem from the last lesson solved by default. It **created the volume**. It **waited for Postgres to report healthy** before starting the API. Four things you would otherwise have typed, in order, correctly, every time.

## There is no \`version:\` key

If you have seen Compose files before, you have seen this at the top:

\`\`\`yaml
version: "3.8"     # obsolete — delete it
\`\`\`

**Do not write it.** That key belonged to Compose v1's file-format versioning, which was retired years ago. The current Compose Specification has no version field; the file format is versionless and features are detected from what you actually use. Modern Compose ignores the key, and older versions of Compose v2 warn about it.

Its presence in a tutorial is the most reliable single indicator that the tutorial predates roughly everything in this course.

::deep-dive{title="Why the CLI jumped from v2 to v5"}
Docker Compose v5.0.0 shipped on 2 December 2025, and the version number is a deliberate piece of communication.

There was no v3 and no v4. The project skipped both — explicitly, in the release notes — because the *file format* had legacy versions numbered \`2.x\` and \`3.x\`, and a **CLI** called v3 would have been permanently confused with a **file format** called \`version: "3"\`. Skipping to 5 severs the association.

So when you read a version number now: **v1** was the Python \`docker-compose\` (end of life July 2023), **v2** was the Go rewrite as \`docker compose\`, and **v5** is the current line. \`version: "3.8"\` was never a program at all — it was a schema declaration, and it is dead.

The other headline change in v5.0.0: **Compose no longer has an internal builder.** Builds are delegated to Docker Bake, the same path \`docker build\` takes. In practice this means Compose builds and CLI builds behave identically, and Bake's features are available to a Compose project — the subject of a lesson in *Docker in Practice*.

Later v5 releases have concentrated on reconciliation — how Compose decides what to change when you re-run \`up\` against something already running. v5.2 rewrote the algorithm, v5.4 extended it to volumes and networks, and v5.5 stopped unnecessary container recreation caused by digest churn. If you have upgraded from v2 and containers restart more or less often than you expect, that is what changed.
::

## The commands worth knowing

\`\`\`
docker compose up -d              # create/start everything, detached
docker compose down               # stop and remove containers + network
docker compose down -v            # ...and delete the volumes. Careful.
docker compose ps                 # what is running
docker compose logs -f api        # follow one service
docker compose exec api sh        # shell into a running service
docker compose run --rm api npm test   # one-off container, then delete it
docker compose build              # rebuild images
docker compose pull               # refresh images from the registry
\`\`\`

The two that get mixed up are \`exec\` and \`run\`. **\`exec\` needs the service already running** and joins it. **\`run\` starts a new container** from the same definition — useful for tests, migrations, and shells against a service that is currently crashing.

And \`down -v\` deletes your named volumes. Plain \`down\` does not. That one flag is the difference between "stop the stack" and "stop the stack and destroy the database".

::quiz
---
question: What is the difference between \`docker compose down\` and \`docker compose down -v\`?
options:
  - |-
    \`-v\` also deletes the named volumes, and with them your data
  - |-
    \`-v\` is verbose output
  - |-
    \`-v\` removes the images as well as the containers
answer: 0
explanation: Plain \`down\` removes containers and the network but leaves volumes, so \`up\` again finds your database intact. \`-v\` removes them too. It is the right command for a clean slate and the wrong one at any other time.
---
::

## \`depends_on\` and what it actually promises

\`\`\`yaml
depends_on:
  - db
\`\`\`

This controls **start order only**. Compose starts \`db\` first, then immediately starts \`api\` — it does not wait for Postgres to be ready to accept connections, because it has no way of knowing what "ready" means. Your API tries to connect a hundred milliseconds later and crashes.

The long form fixes it, and requires the dependency to declare a healthcheck:

\`\`\`yaml
depends_on:
  db:
    condition: service_healthy
\`\`\`

Three conditions are available: \`service_started\` (the old behaviour), \`service_healthy\` (waits for the healthcheck to pass), and \`service_completed_successfully\` (waits for a one-shot container to exit 0 — migrations, seed jobs).

::quiz
---
question: |-
  Your API crashes on startup with "connection refused" even though \`depends_on: [db]\` is set. Why?
options:
  - Plain \`depends_on\` only orders startup; it doesn't wait for the database to be ready to accept connections
  - The database service name is wrong
  - |-
    \`depends_on\` doesn't work with the \`build\` key
answer: 0
explanation: |-
  Started and ready are different things. Give \`db\` a \`healthcheck\` and use \`condition: service_healthy\`, which is the whole point of the long form.
---
::

::fill-blank
---
prompt: Start every service in the Compose file in the background.
answer:
  - docker compose up -d
  - docker compose up --detach
hint: Three words plus the same detach flag \`docker run\` uses.
placeholder: docker compose ...
---
::

Next up: the last lesson — finding out what went wrong, and stopping Docker from filling your disk.
`;export{e as default};
