const e=`A container's writable layer dies with the container. That is the design, not a limitation — it is what makes containers disposable, reproducible, and safe to restart. But real applications have state, and state has to live somewhere else.

Docker gives you three places, and choosing between them is most of what this lesson is.

## The three kinds of mount

| Kind | Managed by | Lives at | Use for |
|---|---|---|---|
| **Named volume** | Docker | \`/var/lib/docker/volumes/…\` | databases, uploads, anything the app owns |
| **Bind mount** | you | any host path you name | source code in development, config files |
| **tmpfs** | kernel | RAM only, never disk | secrets and scratch that must not persist |

\`\`\`
docker run -v mydata:/var/lib/postgresql/data postgres:17   # named volume
docker run -v "$PWD:/app" node:22 npm test                  # bind mount
docker run --tmpfs /tmp alpine                              # tmpfs
\`\`\`

The syntax is confusingly overloaded: \`-v\` means a named volume when the left side is a bare name, and a bind mount when it looks like a path. \`./data\` binds; \`data\` creates a volume called \`data\`. One character of difference, entirely different behaviour.

::terminal-teaser
---
lines:
  - cmd: docker volume create pgdata
    out: pgdata
  - cmd: docker run -d --name db -v pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=x postgres:17
    out: c4d81f9a2e77
  - cmd: docker rm -f db
    out: db
  - cmd: docker volume ls
    out: |-
      DRIVER    VOLUME NAME
      local     pgdata
---
::

The container is gone; the data is not. Start a new Postgres against the same volume and the database is exactly as it was.

::quiz
---
question: You run Postgres with no volume, write data, then \`docker rm\` the container and start a fresh one from the same image. What happened to the data?
options:
  - It is gone — it lived in the removed container's writable layer
  - It is in the image, and the new container will see it
  - Docker keeps it for 24 hours before deleting
answer: 0
explanation: Every write with no mount underneath goes to the container's own layer, which is deleted with the container. Nothing warns you. This is the most common way people lose a development database.
---
::

## \`--mount\` says what \`-v\` means

The newer syntax is verbose and unambiguous, and worth using in anything that outlives a terminal session:

\`\`\`
docker run --mount type=volume,source=pgdata,target=/var/lib/postgresql/data postgres:17
docker run --mount type=bind,source="$PWD",target=/app,readonly node:22
docker run --mount type=tmpfs,target=/tmp alpine
\`\`\`

Longer, and it removes two real hazards. It states the type instead of inferring it from punctuation. And it **fails if a bind source does not exist**, where \`-v\` silently creates an empty directory — the reason a bind-mounted config file sometimes shows up inside the container as an empty *directory* with the same name.

## Bind mounts are for development

The characteristic development loop:

\`\`\`
docker run -d -p 3000:3000 -v "$PWD/src:/app/src" myapp
\`\`\`

Edit on the host, the container sees it immediately, the process reloads. No rebuild.

Three things to know before relying on it:

- **It is a live window, not a copy.** Deleting a file on the host deletes it in the container.
- **A mount hides whatever was underneath.** Bind-mounting \`/app\` over an image that installed \`node_modules\` at \`/app/node_modules\` makes those dependencies disappear. The usual fix is an anonymous volume over the subdirectory: \`-v "$PWD:/app" -v /app/node_modules\`.
- **UIDs are numbers, not names.** A container running as UID 1000 writing to a host directory owned by a different UID gets permission denied, and the file it does create is owned by a user your host may not have.

Compose has a purpose-built answer to all of this — \`develop.watch\`, covered in *Docker in Practice*.

::quiz
---
question: You bind-mount your project into \`/app\`, but the container's \`node_modules\` installed at build time has vanished. Why?
options:
  - The bind mount covers \`/app\` entirely, hiding everything the image put there
  - The install failed during the build
  - Bind mounts delete existing directories
answer: 0
explanation: A mount replaces the view at its target, like mounting over a directory anywhere in Unix. The image's contents are still in the layer, just not visible. Mount an anonymous volume at \`/app/node_modules\` to punch a hole back through.
---
::

## Backing a volume up

Volumes live under \`/var/lib/docker\`, which you should not go rummaging in. The portable approach is a throwaway container with both the volume and a host directory attached:

\`\`\`
docker run --rm \\
  -v pgdata:/data:ro \\
  -v "$PWD":/backup \\
  alpine tar czf /backup/pgdata.tar.gz -C /data .
\`\`\`

And to restore:

\`\`\`
docker run --rm \\
  -v pgdata:/data \\
  -v "$PWD":/backup \\
  alpine sh -c "cd /data && tar xzf /backup/pgdata.tar.gz"
\`\`\`

For a database, prefer the database's own tool — \`pg_dump\` via \`docker exec\` gives you a consistent snapshot, where a file-level copy of a running Postgres may not.

::fill-blank
---
prompt: Run \`postgres:17\` with a named volume called \`pgdata\` mounted at \`/var/lib/postgresql/data\`, using the short flag.
answer:
  - docker run -v pgdata:/var/lib/postgresql/data postgres:17
  - docker run --volume pgdata:/var/lib/postgresql/data postgres:17
  - docker run -d -v pgdata:/var/lib/postgresql/data postgres:17
hint: The left side of the colon is a bare name, not a path — that is what makes it a volume.
placeholder: docker run ...
---
::

::deep-dive{title="Anonymous volumes, and the disk that fills up"}
Some images declare \`VOLUME /var/lib/mysql\` in their Dockerfile. If you start such a container without naming a mount, Docker creates an **anonymous volume** — a real volume with a 64-hex-character name and no other identity.

It behaves like a named one, except nothing refers to it. Remove the container and it stays. Start the container again and you get a *new* anonymous volume, so your data appears to have vanished while the old volume sits on disk forever.

That is the usual explanation for a Docker host quietly running out of space:

\`\`\`
docker system df                  # where the space actually went
docker volume ls -f dangling=true # volumes no container references
docker volume prune               # delete them — read the list first
\`\`\`

\`docker volume prune\` is the one prune command to be careful with. \`docker container prune\` and \`docker image prune\` throw away things you can recreate; volumes are the only place your data was.

\`docker run --rm\` removes anonymous volumes along with the container, which is why one-shot containers are safe. Long-lived services should be given named volumes, so there is a name to back up, inspect, and reason about.
::

Next up: networking — how containers reach each other and the outside world.
`;export{e as default};
