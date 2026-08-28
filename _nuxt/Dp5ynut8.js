const n=`Most of what anyone types at a Docker prompt is one command with a handful of flags. This lesson is that command, and the reason each flag exists.

## The anatomy of \`docker run\`

\`\`\`
docker run [OPTIONS] IMAGE [COMMAND] [ARGS...]
\`\`\`

Everything before the image name is for Docker. Everything after it is for the process inside the container, replacing the image's default command.

\`\`\`
docker run nginx                    # run nginx's default command
docker run nginx nginx -v           # run something else instead
docker run alpine echo hello        # alpine's default is a shell; override it
\`\`\`

## Foreground, background, and interactive

\`\`\`
docker run nginx                    # attached: your terminal follows its output
docker run -d nginx                 # detached: prints an ID and returns
docker run -it alpine sh            # interactive shell
\`\`\`

\`-d\` detaches. \`-it\` is two flags people always type together: \`-i\` keeps stdin open, \`-t\` allocates a pseudo-terminal. You need both for a usable shell — \`-i\` alone gives you no prompt and no line editing, \`-t\` alone gives you a prompt that ignores your typing.

::terminal-teaser
---
lines:
  - cmd: docker run -d --name web -p 8080:80 nginx
    out: 3f9a1c4e77b2
  - cmd: docker ps
    out: |-
      CONTAINER ID   IMAGE   STATUS         PORTS                  NAMES
      3f9a1c4e77b2   nginx   Up 4 seconds   0.0.0.0:8080->80/tcp   web
  - cmd: curl -s localhost:8080 | head -4
    out: |-
      <!DOCTYPE html>
      <html>
      <head>
      <title>Welcome to nginx!</title>
---
::

## \`-p\` publishes a port

\`-p 8080:80\` means **host port 8080 forwards to container port 80**. Host first, container second — get it backwards and you will publish port 80 on your machine into a container that has nothing listening on 8080.

A container's ports are private to its network namespace by default. Publishing is what pokes a hole from the host into it, and it is the reason two containers can both listen on 80 while only one of them can claim host port 8080.

\`\`\`
-p 8080:80              # host 8080 -> container 80, all interfaces
-p 127.0.0.1:8080:80    # ...bound to loopback only
-p 80                   # container 80 -> a random free host port
-P                      # publish every EXPOSEd port to random host ports
\`\`\`

The loopback form is worth a habit. \`-p 8080:80\` binds \`0.0.0.0\`, which on a machine with a public IP means the internet, and Docker's rules sit ahead of a naive host firewall — a detail the Intermediate course returns to.

::quiz
---
question: A container serves on port 3000. You run it with \`-p 3000:8080\` and get connection refused on the host. Why?
options:
  - The mapping is host-then-container, so Docker is forwarding host 3000 to container 8080, where nothing is listening
  - Port 3000 is reserved and cannot be published
  - The container needs \`EXPOSE 3000\` before it can be published
answer: 0
explanation: The order is \`-p HOST:CONTAINER\`. You wanted \`-p 3000:3000\`. Nothing errors, because Docker has no way to know the container is not listening on 8080 — it happily forwards into silence.
---
::

## Naming and cleanup

\`\`\`
docker run --name web nginx         # a name you can use instead of the ID
docker run --rm alpine echo hi      # delete the container when it exits
\`\`\`

Without \`--name\` you get a generated one like \`nostalgic_hopper\`. Names must be unique, which is why re-running a \`--name web\` command after a crash fails until you \`docker rm web\`.

\`--rm\` matters more than it looks. Every container you run and forget stays on disk, writable layer and all. A month of experimenting without \`--rm\` is measured in gigabytes. Use it for anything one-shot; leave it off for anything you might want to inspect after it dies.

## Environment and the working directory

\`\`\`
docker run -e LOG_LEVEL=debug myapp
docker run --env-file .env myapp
docker run -w /app -v "$PWD:/app" node:22 npm test
\`\`\`

\`-e\` sets one variable, \`--env-file\` reads a file of them. Both are the normal way to configure a container, because the whole point of an image is that it is the same everywhere and the configuration is not.

**Do not pass secrets this way if you can avoid it.** \`docker inspect\` shows every environment variable in plain text to anyone who can reach the daemon, and so does the API. The Intermediate and Advanced courses cover the alternatives.

::fill-blank
---
prompt: Run the \`redis\` image in the background, named \`cache\`, with container port 6379 published on host port 6379.
answer:
  - docker run -d --name cache -p 6379:6379 redis
  - docker run -d -p 6379:6379 --name cache redis
  - docker run --name cache -d -p 6379:6379 redis
  - docker run -d --name=cache -p 6379:6379 redis
hint: Three flags — detach, name, publish — then the image.
placeholder: docker run ...
---
::

## Looking at what is running

\`\`\`
docker ps                  # running
docker ps -a               # every container, including exited
docker logs -f web         # follow the output
docker exec -it web sh     # a second process inside a running container
docker stop web            # SIGTERM, then SIGKILL after the grace period
docker rm web              # delete a stopped container
\`\`\`

\`docker exec\` is the one people reach for constantly and the one worth understanding properly: it starts a **new process** inside an existing container's namespaces. It is not a way back into the original process, and anything it changes lives in the container's writable layer like any other write.

::quiz
---
question: A container exits immediately with no output. Which command actually helps?
options:
  - |-
    \`docker logs <name>\` — a stopped container keeps its logs until it is removed
  - |-
    \`docker ps\` — it lists containers that have exited
  - |-
    \`docker exec\` into it and look around
answer: 0
explanation: |-
  \`docker ps\` only shows running containers (you would need \`-a\`), and \`docker exec\` needs a running container to exec into. Logs outlive the process and are the first thing to read. \`docker inspect --format '{{.State.ExitCode}}'\` gives you the exit code alongside.
---
::

::deep-dive{title="Why your container exits straight away"}
The most common beginner surprise, and it is not a bug.

**A container lives exactly as long as its main process.** When PID 1 exits, the container stops. There is no daemon, no supervisor, nothing keeping it alive.

So \`docker run ubuntu\` starts, runs \`bash\`, finds no terminal attached, \`bash\` reads end-of-file immediately and exits, and the container is gone. \`docker run -it ubuntu\` gives \`bash\` a terminal to read from, and it stays.

The same rule explains other cases:

- **A backgrounded process in your \`CMD\`.** \`CMD ["sh", "-c", "myapp &"]\` starts the app, the shell has nothing left to do, PID 1 exits, everything dies.
- **A web server in daemon mode.** Every official image runs its server in the foreground on purpose — \`nginx -g 'daemon off;'\`, \`httpd-foreground\`. Configuring one to daemonise kills the container.
- **A crash you cannot see.** The process really did fail. \`docker logs\` and the exit code will say so.

The rule to carry: the thing you want to keep running must be PID 1, and it must not fork into the background.
::

Next up: images and registries — where the things you have been running come from.
`;export{n as default};
