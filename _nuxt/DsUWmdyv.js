const e=`"What is in this image, and where did it come from?" is a question production eventually asks, usually urgently, usually about a CVE announced that morning. Answering it by rebuilding and guessing does not scale past a handful of images.

**Attestations** are signed statements attached to an image that answer it in advance.

## The two that matter

**SBOM** — Software Bill of Materials. Every package in the image, with version and license. Answers *what is in it*.

**Provenance** — how the image was built: which Dockerfile, which source commit, which builder, which base image, when. Answers *where it came from*. It follows the SLSA framework, whose levels describe how hard the record is to forge.

BuildKit generates both:

\`\`\`
docker buildx build \\
  --sbom=true \\
  --provenance=mode=max \\
  -t ghcr.io/acme/app:1.0 --push .
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker buildx imagetools inspect ghcr.io/acme/app:1.0
    out: |-
      Manifests:
        Platform: linux/amd64
        Platform: unknown/unknown
          Annotations:
            vnd.docker.reference.type: attestation-manifest
  - cmd: docker buildx imagetools inspect ghcr.io/acme/app:1.0 --format '{{json .Provenance}}' | head -5
    out: |-
      {
        "SLSA": {
          "buildType": "https://mobyproject.org/buildkit@v1",
          "materials": [ ... ]
---
::

That \`unknown/unknown\` platform is not a bug. Attestations ride in the image index as extra manifests with a platform nothing matches, so they are stored and distributed alongside the image but never pulled as one.

\`mode=max\` on provenance records the full build — every instruction, every source and material. \`mode=min\` records only the essentials. Max is what an audit wants.

::quiz
---
question: What question does a provenance attestation answer that an SBOM does not?
options:
  - Where the image came from — which source, which builder, which base, and when
  - Which packages are installed and at what versions
  - Whether any of the packages have known CVEs
answer: 0
explanation: |-
  SBOM is the inventory, provenance is the chain of custody. You need both: the inventory tells you a vulnerable package is present, and the provenance tells you which repository and commit to fix so the next build does not reintroduce it.
---
::

## Tags lie; digests do not

A tag is a mutable pointer. \`acme/app:1.0\` can be moved to different bytes at any time by anyone with push access, and nothing about the name changes.

\`\`\`
ghcr.io/acme/app:1.0                       # whatever this points at today
ghcr.io/acme/app@sha256:9f2a1c8b7e...      # exactly these bytes, forever
\`\`\`

**Deploy by digest.** It is the only way to know that what you tested is what you shipped, it removes an entire class of supply-chain attack, and it makes rollback exact rather than approximate.

\`\`\`
docker buildx imagetools inspect ghcr.io/acme/app:1.0 --format '{{.Manifest.Digest}}'
\`\`\`

The usual workflow: CI builds and pushes a tag, resolves it to a digest, and puts the **digest** in the deployment manifest. The tag stays for humans; the digest is what runs.

Base images too:

\`\`\`dockerfile
FROM node:22-alpine@sha256:1a3f9c...
\`\`\`

The objection to this is real — a pinned base does not receive security patches, so you need automation (Renovate, Dependabot) that raises a pull request when the upstream digest moves. The pull request is the point: the update becomes a reviewed change instead of something that happens silently on the next build.

::quiz
---
question: Why deploy by digest rather than by tag, even for a tag you control?
options:
  - A tag can be moved to different bytes at any time, so it does not identify what you tested
  - Digests pull faster
  - Tags are not supported by all registries
answer: 0
explanation: Immutability. A digest is the content hash — it cannot point at anything else. It also means a compromised registry account cannot swap your image out from under a deployment that names the digest.
---
::

## Verifying what you were given

\`\`\`
docker buildx imagetools inspect ghcr.io/acme/app:1.0 --format '{{json .SBOM}}'
docker buildx imagetools inspect ghcr.io/acme/app:1.0 --format '{{json .Provenance}}'
\`\`\`

Engine 29 also added a dedicated API endpoint, \`GET /images/{name}/attestations\`, so tooling can read them without shelling out to buildx.

Reading them is the easy half. **Verifying** — establishing that the attestation was produced by a builder you trust and has not been altered — needs signatures, which is the next lesson.

::fill-blank
---
prompt: Build and push \`ghcr.io/acme/app:1.0\` with an SBOM and full provenance attached.
answer:
  - docker buildx build --sbom=true --provenance=mode=max -t ghcr.io/acme/app:1.0 --push .
  - docker buildx build --provenance=mode=max --sbom=true -t ghcr.io/acme/app:1.0 --push .
hint: Two attestation flags, a tag, and an output flag.
placeholder: docker buildx build ...
---
::

::deep-dive{title="VEX, and the difference between present and exploitable"}
Scan any real image and you get a list of CVEs. Most of them are not exploitable in your context: the vulnerable function is never called, the affected component is a build-time dependency, the attack needs a configuration you do not use.

The naive response is to chase the number to zero, which means either rebuilding constantly against unrelated patches or suppressing findings in a spreadsheet nobody trusts.

**VEX** — Vulnerability Exploitability eXchange — is the machine-readable answer. A VEX document is a signed statement about a specific CVE in a specific artifact, with a status:

- \`not_affected\`, with a **justification** — \`vulnerable_code_not_present\`, \`vulnerable_code_not_in_execute_path\`, and so on
- \`affected\`, with an action statement
- \`fixed\`
- \`under_investigation\`

The justification is what makes it different from suppression. "We looked, and here is why it does not apply" is auditable; a filter rule is not.

VEX is one of the things a hardened base image supplies, and it is why "near-zero CVEs" claims are worth reading carefully — the honest version publishes **full, unsuppressed CVE visibility** alongside VEX statements explaining the ones that remain, rather than filtering them out of the report.

Three practical consequences:

1. **Scan the image you ship, not the base.** A multi-stage build's final image has a fraction of the surface, and scanning the wrong one produces alarm about a compiler you did not ship.
2. **Attach attestations at build time.** Generating an SBOM months later means guessing.
3. **Consume VEX where your scanner supports it.** It turns a list of 200 findings into a list of 3 that matter, with reasons attached to the other 197.
::

Next up: Docker Scout — the CLI that reads all of this and tells you what to do about it.
`;export{e as default};
