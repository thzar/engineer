const e=`The Compose file from the Beginner course runs two services. A real project has a dozen, of which four should not start on a laptop, and needs different settings in CI than in development without maintaining two files that drift apart.

Compose has specific answers for all of that.

## Overrides: several files, merged

\`docker compose\` reads \`compose.yaml\` and, if it exists, \`compose.override.yaml\` on top of it — automatically, with no flags.

\`compose.yaml\` — what is always true:

\`\`\`yaml
services:
  api:
    build: .
    environment:
      DATABASE_URL: postgres://app:secret@db:5432/app
    depends_on:
      db:
        condition: service_healthy
\`\`\`

\`compose.override.yaml\` — development only, and typically gitignored or committed as the local default:

\`\`\`yaml
services:
  api:
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      LOG_LEVEL: debug
    volumes:
      - ./src:/app/src
\`\`\`

Name files explicitly and the automatic override is skipped:

\`\`\`
docker compose -f compose.yaml -f compose.prod.yaml up -d
\`\`\`

The merge rules are worth knowing because one of them surprises people: **scalars are replaced, sequences are appended**. Two files that both define \`ports:\` give you *both* lists concatenated, not the second one winning. Use \`!reset\` to clear an inherited value, or \`!override\` to replace a list wholesale:

\`\`\`yaml
services:
  api:
    ports: !override
      - "8080:3000"
\`\`\`

::quiz
---
question: Two Compose files both define \`ports:\` for the same service. What does the merged result contain?
options:
  - Both lists concatenated — sequences append rather than replace
  - Only the second file's list
  - An error about a duplicate key
answer: 0
explanation: Scalars are overwritten, lists are appended. This is how you add a port in an override without restating the base ones — and how you accidentally publish two ports. \`!override\` replaces the list instead.
---
::

## Profiles: services that stay off

\`\`\`yaml
services:
  api:
    build: .

  db:
    image: postgres:17-alpine

  admin:
    image: adminer
    profiles: [tools]

  loadtest:
    build: ./bench
    profiles: [bench]
\`\`\`

A service with a \`profiles\` key does **not** start unless its profile is requested:

\`\`\`
docker compose up -d                        # api and db only
docker compose --profile tools up -d        # ...plus adminer
COMPOSE_PROFILES=tools,bench docker compose up -d
\`\`\`

This is how one file serves a team without everyone running the observability stack, the seed job, and the admin UI on a laptop. Naming a profiled service directly (\`docker compose up admin\`) also activates it.

## \`include\`: composing the compose file

Large projects split services across files, and \`include\` pulls another complete Compose file into this one — paths and all resolved relative to *its* directory, which is what makes it different from a merge:

\`\`\`yaml
include:
  - path: ./infra/observability.yaml
  - path: ./services/payments/compose.yaml

services:
  api:
    build: .
\`\`\`

Each included file stays independently runnable, which means a team can own their own service's Compose file and the top-level file stays readable.

## Lifecycle: init containers and hooks

Historically, "run migrations before the app starts" meant an entrypoint shell script that did two jobs badly. Compose has three keys for it now.

\`\`\`yaml
services:
  api:
    build: .
    depends_on:
      db:
        condition: service_healthy
    pre_start:
      - command: ./manage.py migrate
    post_start:
      - command: ./scripts/warm-cache.sh
        user: root
    pre_stop:
      - command: ./scripts/drain.sh
\`\`\`

**\`pre_start\`** (Compose v5.3) is an init container: it runs to completion before the service's own process starts, in the same environment. Migrations, schema checks, fixture loading.

**\`post_start\`** runs after the container starts, alongside the main process.

**\`pre_stop\`** runs before the container is stopped — connection draining, deregistering from a load balancer.

The alternative you will still see is a one-shot service plus \`service_completed_successfully\`, which is the right shape when the job is genuinely separate:

\`\`\`yaml
  migrate:
    build: .
    command: ./manage.py migrate
    depends_on:
      db: { condition: service_healthy }

  api:
    depends_on:
      migrate: { condition: service_completed_successfully }
\`\`\`

::quiz
---
question: When does a \`pre_start\` command run relative to the service's main process?
options:
  - To completion, before the main process starts — it is an init container
  - Concurrently with the main process
  - After the container is healthy
answer: 0
explanation: That is the point of it. It replaces the entrypoint script that ran migrations and then exec'd the real command, and it keeps the failure visible instead of buried in a wrapper.
---
::

## \`pull_policy\` and refresh windows

\`\`\`yaml
services:
  api:
    image: ghcr.io/acme/api:main
    pull_policy: daily
\`\`\`

Beyond \`always\`, \`never\`, \`missing\` and \`build\`, Compose accepts time-based policies — \`daily\`, \`weekly\`, \`every_12h\`. A mutable tag gets refreshed on a schedule instead of on every \`up\` (slow, and offline-hostile) or never (stale for weeks).

::fill-blank
---
prompt: Start the stack in the background with the \`tools\` profile activated.
answer:
  - docker compose --profile tools up -d
  - docker compose --profile=tools up -d
hint: The profile flag goes before the subcommand, not after it.
placeholder: docker compose ...
---
::

::deep-dive{title="The commands that answer 'what is it actually going to do'"}
Compose files acquire overrides, includes, profiles, and interpolation until nobody can predict the result by reading them. Three commands settle it.

**\`docker compose config\`** renders the final, fully-merged, fully-interpolated file. Every override applied, every \`include\` inlined, every \`\${VAR}\` resolved. If a value is not what you expect, this is where you find out, and it is worth running in CI as a validation step — it exits non-zero on a malformed file.

\`\`\`
docker compose config
docker compose --profile tools config --services
docker compose config --variables       # what interpolation is looking for
\`\`\`

**\`docker compose ps --format json\`** gives machine-readable state, including health, which is what a wait-for-ready script in CI should be reading rather than grepping human output.

**\`docker compose --dry-run up -d\`** shows what *would* happen — which containers get created, recreated, started, or left alone — without touching anything. This became considerably more useful in v5, where the reconciliation algorithm was rewritten twice: if you have upgraded from v2 and containers are recreating more or less than you expect, \`--dry-run\` tells you what the new algorithm has decided and why.
::

Next up: Compose Watch — the development loop where you stop rebuilding by hand.
`;export{e as default};
