const e=`By the end of the last lesson a single build command had six flags. A real project has several images, each with its own context, arguments, tags, platforms, and cache settings — and that turns into a shell script nobody wants to maintain.

**Bake** is that configuration as a file. And since Compose v5 it is no longer optional knowledge: Compose removed its internal builder and delegates every build to Bake.

## A bake file

\`docker-bake.hcl\` in the project root:

\`\`\`hcl
group "default" {
  targets = ["api", "web"]
}

target "api" {
  context    = "./api"
  dockerfile = "Dockerfile"
  tags       = ["ghcr.io/acme/api:dev"]
  platforms  = ["linux/amd64", "linux/arm64"]
}

target "web" {
  context = "./web"
  tags    = ["ghcr.io/acme/web:dev"]
  args    = { NODE_VERSION = "22" }
}
\`\`\`

\`\`\`
docker buildx bake                # builds the default group, in parallel
docker buildx bake api            # just one target
docker buildx bake --push         # override output for every target
docker buildx bake --print        # render the resolved JSON without building
\`\`\`

\`--print\` is the one to reach for first when something is not doing what you expect. It shows exactly what each target resolved to after inheritance and variables.

::terminal-teaser
---
lines:
  - cmd: docker buildx bake --print api
    out: |-
      {
        "target": {
          "api": {
            "context": "./api",
            "dockerfile": "Dockerfile",
            "tags": ["ghcr.io/acme/api:dev"],
            "platforms": ["linux/amd64", "linux/arm64"]
          }
        }
      }
  - cmd: docker buildx bake
    out: |-
      [+] Building 31.7s (24/24) FINISHED
       => [api] exporting to image
       => [web] exporting to image
---
::

Targets in a group build **concurrently**, sharing one BuildKit instance and one cache. That is most of the speed win on a repo with several images.

::quiz
---
question: What does \`docker buildx bake --print\` do?
options:
  - Renders the fully resolved build configuration as JSON without building anything
  - Prints the build log of the last run
  - Prints the Dockerfile each target would use
answer: 0
explanation: It resolves inheritance, variables and functions and shows you the result. When a target is picking up the wrong tag or platform, this answers why in one command instead of by bisecting the file.
---
::

## Inheritance and variables

Targets inherit, so the shared parts are written once:

\`\`\`hcl
variable "TAG" { default = "dev" }
variable "REGISTRY" { default = "ghcr.io/acme" }

target "_common" {
  platforms = ["linux/amd64", "linux/arm64"]
  args = { BUILDKIT_INLINE_CACHE = "1" }
}

target "api" {
  inherits = ["_common"]
  context  = "./api"
  tags     = ["\${REGISTRY}/api:\${TAG}"]
}

target "web" {
  inherits = ["_common"]
  context  = "./web"
  tags     = ["\${REGISTRY}/web:\${TAG}"]
}
\`\`\`

Variables come from the environment, so CI sets them without editing the file:

\`\`\`
TAG=$(git rev-parse --short HEAD) docker buildx bake --push
\`\`\`

A leading underscore is a convention, not syntax — \`_common\` is still a real target, it is simply not in any group, so nothing builds it directly.

## Matrix builds

One target definition, several combinations:

\`\`\`hcl
target "api" {
  name = "api-\${tgt}"
  matrix = {
    tgt = ["debug", "release"]
  }
  target = tgt
  tags   = ["ghcr.io/acme/api:\${tgt}"]
}
\`\`\`

That expands to \`api-debug\` and \`api-release\`, each stopping at a different Dockerfile stage. The \`name\` field is required when a matrix is present, because the targets need distinct names.

::fill-blank
---
prompt: Build every target in the default group and push the results.
answer:
  - docker buildx bake --push
  - docker buildx bake --push default
  - docker buildx bake default --push
hint: Three words plus an output flag; the default group needs no naming.
placeholder: docker buildx bake ...
---
::

## Bake reads your Compose file

You do not have to write HCL. Bake accepts a \`compose.yaml\` and treats each service with a \`build:\` section as a target:

\`\`\`
docker buildx bake -f compose.yaml
docker buildx bake -f compose.yaml -f docker-bake.hcl api
\`\`\`

Multiple files merge, so a common pattern is to keep the service definitions in Compose and add the things Compose has no key for — platforms, cache backends, output types — in a small HCL file alongside.

::deep-dive{title="Why Compose v5 removed its own builder"}
Compose v5.0.0 ("Mont Blanc", December 2025) **dropped its internal BuildKit builder** and delegates builds to Bake, the same path \`docker build\` takes.

Before that, three code paths could build a container image — \`docker build\`, \`docker buildx build\`, and \`docker compose build\` — and they differed in small, undocumented ways: which cache they used, whether a multi-platform build worked, which flags were honoured. A build that worked one way and not another was a genuinely confusing thing to debug.

Now there is one. What follows in practice:

- **\`docker compose build\` and \`docker buildx bake\` produce the same result**, because they are the same code.
- **Bake features reach Compose projects**, including cache backends and output types that \`compose.yaml\` has no key for — which is exactly what the two-file pattern above is for.
- **\`docker compose build\` needs a buildx-capable setup.** On a stripped-down engine without the buildx plugin, this is a real change rather than a cosmetic one.

The wider point, which is worth carrying beyond Docker: when a tool's release notes say a subsystem was *removed and delegated*, the behaviour you had memorised for it is the thing most likely to have moved. Compose v5's other headline changes are all reconciliation — how it decides what to recreate on \`up\` — rewritten in v5.2, extended to volumes and networks in v5.4, and tightened in v5.5 to stop recreating containers over image-digest churn.
::

Next up: Compose for real applications — profiles, overrides, includes, and the lifecycle hooks that replace entrypoint shell scripts.
`;export{e as default};
