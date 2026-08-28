const e=`Docker is not a container. Docker is a set of tools for building, shipping, and running containers — and the distinction matters, because the container is a kernel feature and Docker is the ergonomics wrapped around it.

If you have taken *Containers From Scratch*, you have already built one by hand: namespaces, cgroups, a copy-on-write filesystem, nine commands. This course is the other direction. Everything here is what those nine commands became once someone made them pleasant to use.

## The pieces

Running \`docker run\` involves four things, and knowing which is which saves a lot of confused debugging:

| Piece | What it is |
|---|---|
| **The CLI** | the \`docker\` command you type. It talks to the daemon over a socket, and can talk to a daemon on another machine. |
| **The daemon** (\`dockerd\`) | the long-running process that actually does the work. Holds your images, containers, networks, volumes. |
| **containerd + runc** | what the daemon delegates to. \`containerd\` manages container lifecycle; \`runc\` is the thing that actually calls the kernel. |
| **A registry** | where images live when they are not on your machine. Docker Hub by default. |

::terminal-teaser
---
lines:
  - cmd: docker version --format '{{.Client.Version}} / {{.Server.Version}}'
    out: 29.7.2 / 29.7.2
  - cmd: docker run --rm hello-world
    out: |-
      Unable to find image 'hello-world:latest' locally
      latest: Pulling from library/hello-world
      Status: Downloaded newer image for hello-world:latest
      Hello from Docker!
---
::

Read what that second command actually did. The image was not present, so the CLI asked the daemon, the daemon pulled it from Docker Hub, unpacked it, created a container from it, ran it, and the container exited. \`--rm\` then deleted the container. Five distinct operations behind one word.

::quiz
---
question: You run a Docker command and get "Cannot connect to the Docker daemon". What does that tell you?
options:
  - The CLI is installed and working, but the daemon it talks to isn't running or isn't reachable
  - Docker is not installed
  - The image you asked for does not exist
answer: 0
explanation: The CLI got far enough to try. It is a separate program from the daemon and they talk over a socket, so the CLI being fine tells you nothing about the daemon. Usually the fix is starting the service — or, on Linux, that your user is not in the \`docker\` group and cannot open the socket.
---
::

## Images and containers are different things

This is the single most useful distinction in Docker, and it is worth being pedantic about because almost every confusing error message depends on it.

An **image** is a read-only stack of filesystem layers plus metadata saying what to run. It is inert. It is a template.

A **container** is a running (or stopped) instance of an image, with a thin writable layer on top. You can create fifty containers from one image; they share every byte of the image and differ only in what they have written.

\`\`\`
docker images        # the templates you have
docker ps            # the running instances
docker ps -a         # ...including the stopped ones
\`\`\`

The relationship is exactly class-and-object, or program-and-process. \`docker rmi\` deletes a template; \`docker rm\` deletes an instance. Deleting an image that a container still uses fails, for the same reason you cannot delete a program's binary out from under a running process.

::quiz
---
question: You edit a file inside a running container, then stop it and start a fresh container from the same image. Is your edit there?
options:
  - No — the edit lived in the first container's writable layer, and the image was never touched
  - Yes — changes are saved back into the image automatically
  - Only if you ran the container with \`--rm\`
answer: 0
explanation: Images are read-only. Every write goes to the container's own thin layer and dies with it. Persisting anything on purpose means a volume, and baking something into the image means a rebuild — both covered later in this course.
---
::

## One kernel, no VM

Worth stating plainly because the intuition points the wrong way: **a Linux container shares the host's kernel.** There is no guest operating system inside an image and no hypervisor underneath.

That is why an Alpine image is eight megabytes — it contains a userland, not an OS. It is why a container starts in milliseconds instead of the tens of seconds a VM takes. And it is why Docker on macOS and Windows runs a Linux VM in the background: Linux containers need a Linux kernel, so if the host has not got one, one is provided.

::deep-dive{title="Where the images actually live now"}
Docker Engine 29.0 changed a default that had been in place for a decade: **the containerd image store is now the default on fresh installations**, replacing the legacy graph drivers.

This is mostly invisible, and where it is visible it is an improvement:

- **Multi-platform images can be held locally.** The old store could only keep one architecture per tag, which is why building a multi-arch image used to mean pushing it straight to a registry to see it. \`docker image save\` and \`docker image load\` now take \`--platform\` and understand multiple platforms.
- **\`docker image ls\` looks different.** What used to be \`--tree\` is the default view, and untagged images are no longer listed unless you pass \`--all\`.
- **Attestations and SBOMs are first-class**, which the supply-chain lessons in the Advanced course depend on.

An existing installation that upgraded keeps its old store — the change is for fresh installs. \`docker info\` tells you which you have, under the storage driver line. And one carve-out worth knowing: daemons using \`userns-remap\` do not get the containerd store, because of an unresolved interaction between the two.
::

## Check what you have

Everything in this course is written against specific versions, listed on the course page. Confirm yours before you start wondering why a flag does not exist:

::terminal-teaser
---
lines:
  - cmd: docker version
    out: |-
      Client: Docker Engine - Community
       Version:    29.7.2
      Server: Docker Engine - Community
       Engine Version: 29.7.2
       containerd Version: 2.2.2
       runc Version: 1.3.4
  - cmd: docker compose version
    out: Docker Compose version v5.5.0
  - cmd: docker buildx version
    out: github.com/docker/buildx v0.36.1
---
::

Note \`docker compose\`, two words. \`docker-compose\` with a hyphen was the original Python implementation; it reached end of life in July 2023 and is not what you want. If a tutorial you are reading uses the hyphen, it predates a great deal of what this course covers — which is a useful signal in its own right.

::fill-blank
---
prompt: Show the currently running containers.
answer:
  - docker ps
  - docker container ls
  - docker container list
  - docker ps -a
hint: Two words. The short form is borrowed from a Unix command you already know.
placeholder: docker ...
---
::

Next up: running containers — the flags that make up 90% of what anyone types at a Docker prompt.
`;export{e as default};
