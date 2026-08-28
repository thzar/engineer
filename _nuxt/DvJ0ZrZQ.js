const e=`Running a model is not like running a web service. The artifact is gigabytes of weights rather than megabytes of code, the process wants a GPU it must be granted explicitly, and the thing your application talks to is an inference server with its own lifecycle.

Docker's answer to all three arrived recently enough that most of it postdates the tutorials you will find, so this lesson is deliberately specific about what exists today.

## Docker Model Runner

**Model Runner** runs models locally and serves them over an OpenAI-compatible API. Models are pulled from Docker Hub or Hugging Face as **OCI artifacts** — the same distribution mechanism as images, so the same registries, the same auth, the same caching.

\`\`\`
docker model status
docker model pull ai/qwen2.5-coder
docker model list
docker model run ai/qwen2.5-coder "explain this stack trace"
docker model ps
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker model pull ai/smollm2
    out: |-
      Downloaded 1.79 GB
      Model pulled successfully
  - cmd: docker model list
    out: |-
      MODEL           PARAMETERS  QUANTIZATION  SIZE
      ai/smollm2      361.82 M    IQ2_XXS       1.79 GB
  - cmd: docker model ps
    out: |-
      MODEL           BACKEND     MODE
      ai/smollm2      llama.cpp   completion
---
::

The rest of the surface is what you would expect of something meant for production rather than demos: \`docker model configure\` sets context size and runtime flags, \`docker model package\` turns local GGUF or Safetensors files into an OCI artifact you can \`push\`, \`docker model bench\` measures performance at different concurrency levels, and \`docker model logs\`, \`df\`, \`unload\` and \`purge\` handle the operational side. On Docker Engine without Desktop, \`docker model install-runner\` sets it up.

Note that the runner is **disabled by default** in current Docker Desktop and has to be enabled explicitly.

::quiz
---
question: Why does distributing models as OCI artifacts matter operationally?
options:
  - Models reuse the registry, authentication, caching and mirroring you already run for images
  - It makes the models smaller
  - It lets the model run without a runtime
answer: 0
explanation: No new infrastructure. A private registry, a pull-through cache, credentials, retention policy and air-gapped mirroring all work unchanged — which is the difference between a model being deployable and being a special case someone maintains by hand.
---
::

## Models in Compose

Compose can declare models as first-class dependencies, alongside services:

\`\`\`yaml
services:
  chat:
    build: .
    models:
      llm:
        endpoint_var: AI_MODEL_URL
        model_var: AI_MODEL_NAME
    ports:
      - "127.0.0.1:8080:8080"

models:
  llm:
    model: ai/smollm2
    context_size: 4096
    runtime_flags:
      - "--temp=0.7"
\`\`\`

The top-level \`models\` block declares what the application needs. The service-level \`models\` key binds one in and **injects environment variables** pointing at it.

Two forms. The **short** form is a plain list of names, and Compose derives the variable names — \`llm\` becomes \`LLM_URL\` and \`LLM_MODEL\`. The **long** form above names them explicitly with \`endpoint_var\` and \`model_var\`, which is what you want when the application already expects \`OPENAI_BASE_URL\` or similar.

Your application then talks to an OpenAI-compatible endpoint at whatever \`AI_MODEL_URL\` says, with no knowledge that a model runner exists. Swap the model in \`compose.yaml\`, and nothing in the code changes.

::quiz
---
question: |-
  With \`models: [llm]\` in short form, what does Compose inject into the service?
options:
  - |-
    \`LLM_URL\` and \`LLM_MODEL\` — the endpoint to call and the model name to send
  - The model weights, mounted as a volume
  - Nothing; the service must discover the runner itself
answer: 0
explanation: Compose provisions the model through the runner and passes the connection details as environment variables derived from the key name, uppercased. The long form lets you choose the variable names to match what the application already reads.
---
::

## GPUs

A container gets no GPU unless you give it one. On Linux this needs the NVIDIA Container Toolkit installed on the host.

\`\`\`
docker run --gpus all nvidia/cuda:12.6.0-base-ubuntu24.04 nvidia-smi
docker run --gpus '"device=0,1"' myapp
docker run --gpus 1 myapp
\`\`\`

In Compose, the modern \`gpus\` key rather than the older \`deploy.resources.reservations.devices\` block:

\`\`\`yaml
services:
  inference:
    image: myorg/inference:1.0
    gpus: all
\`\`\`

Two things that consistently go wrong. **The CUDA version in the image must be compatible with the host driver** — the driver is not in the container, and a mismatch fails at runtime with an unhelpful message. And **GPU memory is not managed by cgroups**: \`--memory\` does not cap VRAM, two containers on one GPU will happily exhaust it, and the failure is an out-of-memory error from CUDA rather than an OOM kill you can find in \`docker events\`.

## The MCP Toolkit

Docker's **MCP Toolkit** packages Model Context Protocol servers — the tools an AI agent can call — as containers, with a catalog, an OAuth flow for the ones needing credentials, and **profiles** for grouping servers into named collections.

The reason it is in a production course rather than a novelty section: an MCP server is arbitrary code that an agent invokes with your credentials attached. Everything in this course applies to it with more force than usual — non-root, \`--cap-drop ALL\`, \`--read-only\`, a \`--pids-limit\`, a memory cap, and no Docker socket. An MCP server with \`/var/run/docker.sock\` mounted has root on the host, and it is being driven by a model.

::fill-blank
---
prompt: Pull the model \`ai/smollm2\` with Docker Model Runner.
answer:
  - docker model pull ai/smollm2
  - docker model pull ai/smollm2:latest
hint: Same verb as images, different noun.
placeholder: docker model ...
---
::

::deep-dive{title="What is different about operating a model"}
Every earlier lesson still applies, but four assumptions change enough to be worth naming.

**Image size stops being the lever.** A 15 MB application image serving a 4 GB model has a 4 GB deploy. Keep the weights out of the image and pull them as artifacts, cached on the node — otherwise every application patch redistributes the model.

**Startup is slow and the healthcheck must know it.** Loading weights into memory or VRAM takes tens of seconds. \`start_period\` needs to reflect that or the container is marked unhealthy while it is legitimately loading — the lesson from the healthcheck section, with a much bigger constant.

**Memory limits interact badly with inference.** A model's resident set is largely the weights, so it is close to constant and close to the limit, all the time. There is no comfortable headroom, and a limit set at observed peak will be hit. Size against the model's known requirement, not against a measurement.

**Concurrency is not free.** A web service handles a hundred concurrent requests on one core. An inference server serialises, and queueing shows up as latency rather than errors — which is why \`docker model bench\` measures at different concurrency levels, and why the metric to alert on is queue depth rather than CPU.

The general point is the one this course keeps returning to: the primitives do not change. It is still a process in namespaces with a cgroup, still an artifact in a registry, still an image you should sign and scan. What changes is which numbers are large.
::

That is *Docker in Production*: the engine underneath, security, limits, supply chain, Scout, hardened bases, signing, observability, and AI workloads. Together with *Docker Fundamentals* and *Docker in Practice*, that is the whole of Docker as it stands at the versions on this course's page — and when those numbers move, the notes on this site should move with them.
`;export{e as default};
