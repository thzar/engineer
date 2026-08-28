const e=`There are two moments a credential can leak into an image: while you build it, and while you run it. They have different mechanisms and different fixes, and most guidance covers one and leaves the other.

## The rule

**An image is a public artifact.** Not because you published it, but because everyone who can pull it can read every byte of every layer, plus the metadata. Anything in the image is available to anyone who has the image.

\`\`\`
docker save myapp:1.0 | tar -xO | grep -r "sk_live"
docker history --no-trunc myapp:1.0
\`\`\`

Neither of those is a hack. They are supported commands doing what they say.

## How secrets get into images

**\`ARG\`.** Build arguments are recorded in the image's metadata and printed by \`docker history --no-trunc\`. Deleting the file the token was used for does not remove the argument.

\`\`\`dockerfile
ARG NPM_TOKEN                 # visible in docker history, forever
RUN npm ci
\`\`\`

**\`ENV\`.** Worse — baked into the image *and* injected into every container started from it, so \`docker inspect\` shows it and so does the process environment.

**\`COPY\`.** A \`.env\` or a key copied in and deleted later is still in the earlier layer. Layers are append-only; the delete is a marker on top.

**A \`RUN\` that writes.** \`git clone https://$TOKEN@github.com/...\` puts the token in \`.git/config\` inside the layer, even if the variable came from a secret.

::quiz
---
question: A Dockerfile does \`ARG TOKEN\`, uses it in one \`RUN\`, and never writes it to disk. Is the token in the published image?
options:
  - Yes — build arguments are stored in image metadata and shown by \`docker history --no-trunc\`
  - No — it only existed during that instruction
  - Only if the build failed
answer: 0
explanation: The value is recorded with the layer that used it. Anyone who pulls the image can read it back. Treat any credential ever passed as \`ARG\` as compromised, and rotate it.
---
::

## Build secrets, done properly

\`\`\`dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \\
    npm ci --omit=dev
\`\`\`

\`\`\`
docker build --secret id=npmrc,src=$HOME/.npmrc -t app .
\`\`\`

The file is a tmpfs mounted for that instruction only. Not a layer, not in \`docker history\`, not in the image.

Secrets can come from a file or straight from the environment, which is what CI wants:

\`\`\`
docker build --secret id=token,env=GITHUB_TOKEN -t app .
\`\`\`

\`\`\`dockerfile
RUN --mount=type=secret,id=token \\
    TOKEN="$(cat /run/secrets/token)" && \\
    curl -H "Authorization: Bearer $TOKEN" -fsSL https://internal/artifact.tar | tar -x
\`\`\`

Unnamed targets land in \`/run/secrets/<id>\`. Note that the value is still only in the shell's memory for that one \`RUN\` — nothing writes it down.

And for Git over SSH, the agent form, so the key itself never enters the build:

\`\`\`dockerfile
RUN --mount=type=ssh git clone git@github.com:acme/private.git
\`\`\`
\`\`\`
docker build --ssh default -t app .
\`\`\`

::fill-blank
---
prompt: Build the current directory, passing the environment variable \`NPM_TOKEN\` as a build secret with the id \`npmtoken\`.
answer:
  - docker build --secret id=npmtoken,env=NPM_TOKEN .
  - docker build --secret id=npmtoken,env=NPM_TOKEN -t app .
  - docker buildx build --secret id=npmtoken,env=NPM_TOKEN .
hint: One flag, then \`id=\` and \`env=\` separated by a comma.
placeholder: docker build --secret ...
---
::

## Runtime configuration

At run time the trade-offs change, because nothing is being baked into a distributable artifact. But \`docker inspect\` still shows every environment variable to anyone who can reach the daemon, and so does the API, and so do most container platforms' dashboards.

The ladder, worst to best:

\`\`\`
-e DATABASE_PASSWORD=hunter2      # in shell history, ps output, and inspect
--env-file .env                   # better: not in history. Still in inspect.
Compose secrets                   # mounted as a file, not an environment variable
An external secret manager        # fetched at start, never on disk
\`\`\`

**Compose secrets** mount a file into the container rather than setting a variable:

\`\`\`yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
\`\`\`

The \`_FILE\` suffix convention is supported by most official images — Postgres, MySQL, Redis and others will read a secret from a file when given \`*_FILE\`. That keeps the value out of the environment entirely.

::quiz
---
question: Why is a Compose \`secret\` better than an environment variable for a database password?
options:
  - It is mounted as a file, so it does not appear in \`docker inspect\` or the container's environment
  - It is encrypted at rest by Docker
  - Environment variables have a length limit
answer: 0
explanation: Local Compose secrets are not encrypted — the improvement is the exposure surface. A file at \`/run/secrets/x\` is readable by the process that needs it and is not enumerated by inspect, the API, \`/proc/<pid>/environ\`, or a crash reporter dumping the environment.
---
::

## Configuration that is not secret

Not everything injected is a credential. Compose \`configs\` handle the rest — a settings file, an nginx conf, a seed script — without rebuilding the image:

\`\`\`yaml
services:
  proxy:
    image: nginx:alpine
    configs:
      - source: nginx_conf
        target: /etc/nginx/conf.d/default.conf

configs:
  nginx_conf:
    file: ./nginx.conf
\`\`\`

Same mechanism as secrets, different intent, and the separation is worth keeping: it makes "what in here is sensitive" answerable by reading the file.

::deep-dive{title="Interpolation, \`.env\`, and the two files people confuse"}
Compose substitutes variables into the YAML before it does anything else:

\`\`\`yaml
services:
  api:
    image: myapp:\${TAG:-latest}
    ports:
      - "\${PORT:?PORT must be set}"
\`\`\`

\`\${VAR:-default}\` supplies a fallback; \`\${VAR:?message}\` fails with your message if it is missing. Same syntax as the shell, deliberately.

**Two different files, both called \`.env\`, and mixing them up is a common half-hour.**

The \`.env\` file *next to your compose file* is read by Compose itself, to substitute \`\${…}\` **in the YAML**. Those values are not passed to containers unless you also list them under \`environment:\`.

The file named by \`env_file:\` on a service is read at container start and becomes that container's **environment**. Compose never interpolates with it.

\`\`\`yaml
services:
  api:
    image: myapp:\${TAG:-latest}   # ← from ./.env
    env_file:
      - ./api.env                 # ← into the container's environment
\`\`\`

So a variable in \`./.env\` that your app cannot see is usually this: it was interpolation-scoped, and nothing put it in the container.

Finally, \`docker compose config\` renders the fully interpolated file with every override and \`include\` resolved. It is the fastest way to answer "what is Compose actually going to run" — and worth checking before you conclude a value is not being picked up.
::

Next up: multi-platform images — one tag that runs on an ARM laptop and an x86 server.
`;export{e as default};
