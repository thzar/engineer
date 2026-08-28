const e=`The cheapest vulnerability to fix is one for a package you never installed. Every previous lesson made a container harder to attack; this one removes the things there was no reason to ship.

## The ladder, and what each step costs

| Base | Packages | Shell | Trade-off |
|---|---|---|---|
| \`ubuntu:24.04\` | ~100 | yes | everything works, largest surface |
| \`debian:13-slim\` | ~90 | yes | docs and extras stripped |
| \`alpine:3.22\` | ~15 | yes | musl libc, not glibc |
| distroless | ~5 | **no** | runtime only; hard to debug |
| hardened (DHI) | minimal | varies | non-root, signed, SBOM + VEX included |
| \`scratch\` | 0 | no | static binaries only |

Each step down removes packages, and packages are what scanners find. Going from a distro base to distroless typically moves a CVE report from a hundred-odd findings to single digits — not because anything was patched, but because the software is not there.

::terminal-teaser
---
lines:
  - cmd: docker scout quickview node:22
    out: |-
      node:22            1C  4H  38M  91L
  - cmd: docker scout quickview node:22-alpine
    out: |-
      node:22-alpine     0C  1H   4M  11L
  - cmd: docker scout quickview gcr.io/distroless/nodejs22-debian12
    out: |-
      distroless/nodejs22 0C  0H   1M   2L
---
::

::quiz
---
question: Why does a distroless image report far fewer CVEs than a Debian-based one running the same application?
options:
  - It ships far fewer packages, so there is less installed software for a scanner to find problems in
  - Its packages are patched more aggressively
  - Scanners cannot analyse distroless images
answer: 0
explanation: |-
  Nothing was fixed — the shell, package manager, and dozens of utilities simply are not present. Which is also the security argument: an attacker with code execution has no \`curl\`, no \`apt\`, and no shell to pivot with.
---
::

## Distroless in practice

\`\`\`dockerfile
# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs22-debian12
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER nonroot
CMD ["dist/server.js"]
\`\`\`

Three things differ from a normal image and each catches people once.

**There is no shell**, so \`CMD\` cannot use shell form and there is no \`sh -c\`. The entrypoint is the runtime itself, which is why \`CMD\` is a script path rather than a command.

**\`docker exec\` gets you nothing**, because there is nothing to exec. Debugging is \`docker debug\` (Docker Desktop attaches a toolbox without altering the image), or \`nsenter\` from the host into the container's namespaces with binaries from the host — the technique from *Containers From Scratch*.

**Healthchecks cannot use \`CMD-SHELL\` or \`curl\`.** Either ship a small static healthcheck binary, or move the check outside the container entirely.

## Docker Hardened Images

Docker's own line of minimal images, aimed at the compliance side of the problem rather than only the size side. What they commit to:

- **Minimal surface** — distroless variants strip the majority of what a normal base carries.
- **Non-root by default**, so the \`USER\` decision is made for you.
- **Continuously patched**, targeting near-zero known CVEs.
- **Signed, with verifiable SBOMs and SLSA Build L3 provenance** on every image.
- **VEX statements included**, so the findings that remain arrive with justifications attached.
- **Full, unsuppressed CVE visibility** — the findings are published rather than filtered, which is the part that makes the near-zero claim checkable.

They are used like any other base:

\`\`\`dockerfile
FROM <your-org>/dhi-node:22-alpine3.22 AS build
...
FROM <your-org>/dhi-node:22-alpine3.22-runtime
\`\`\`

The pattern to notice is the pairing: a **build** variant with a toolchain and a **runtime** variant without one. Mixing them up produces either a build that cannot compile or a runtime carrying a compiler, and the second is the one nobody notices.

\`docker dhi\` is the CLI plugin for browsing and managing them. Docker Hardened Images are a paid product; the techniques in this lesson are not, and distroless plus the previous lesson's practices gets most of the way for free.

::quiz
---
question: What does a VEX statement add that a low CVE count does not?
options:
  - A justification for why a remaining finding is not exploitable, which is auditable
  - A guarantee the image has no vulnerabilities
  - Automatic patching of the affected package
answer: 0
explanation: A low count can be achieved by suppression. VEX publishes the finding *and* the reasoning — "vulnerable code not in execute path" — which is a claim a reviewer can check and disagree with. Suppression is a claim nobody can see.
---
::

## Choosing, honestly

Match the base to how the service is actually operated:

- **A service you deploy weekly and debug rarely** — distroless or hardened. The debugging cost is paid seldom and the surface reduction is permanent.
- **A service under active development** — Alpine or \`-slim\`. Being able to \`exec\` in matters more right now, and you can tighten later.
- **A single static binary** — \`scratch\`, with the CA bundle copied in.
- **Something needing glibc, a distro package, or ancient dependencies** — \`debian:13-slim\`. Fighting musl to save 40 MB is not a good trade.

The mistake worth avoiding is adopting distroless for a service the team debugs interactively every week. The image is more secure and the on-call experience is worse, and what happens next is somebody adds a shell back "temporarily".

::fill-blank
---
prompt: Get a one-line vulnerability summary for the image \`node:22-alpine\`.
answer:
  - docker scout quickview node:22-alpine
  - docker scout quickview node:22-alpine --org acme
hint: The Scout subcommand that gives the three-row summary.
placeholder: docker scout ...
---
::

::deep-dive{title="Where the CA certificates went"}
The \`scratch\` image is genuinely empty, and the failures that produces do not look like emptiness.

**No CA bundle**, so every outbound HTTPS call fails with a certificate verification error. The application looks broken; the network looks fine.

\`\`\`dockerfile
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
\`\`\`

**No \`/etc/passwd\`**, so a numeric \`USER\` works and a named one does not, and any library calling \`getpwuid()\` fails. Synthesise one:

\`\`\`dockerfile
RUN echo 'app:x:10001:10001::/nonexistent:/sbin/nologin' > /etc/passwd.min
# then, in the final stage:
COPY --from=build /etc/passwd.min /etc/passwd
\`\`\`

**No \`/tmp\`**, and no timezone database, so anything formatting a local time gets UTC or an error. \`tzdata\` copies in the same way.

**No DNS resolver configuration behaviour you expect** — Go binaries built with \`CGO_ENABLED=0\` use the pure-Go resolver and are fine; a cgo-linked binary wants \`/etc/nsswitch.conf\` and glibc's NSS modules, which are not there.

The common thread: \`scratch\` removes the parts of a userland that everything quietly assumes. It is excellent for a static Go or Rust binary that makes no outbound TLS calls, and a series of small archaeological discoveries for anything else. Distroless exists precisely to be the version of this that has already made those discoveries for you.
::

Next up: signing and trust — proving an image is the one you built.
`;export{e as default};
