const e=`Attestations say what an image contains and where it came from. Nothing so far establishes that **the attestation is genuine** — an attacker who can push to your registry can push an image with a lovely SBOM describing something entirely different.

Signatures close that gap, and Docker's own answer changed recently enough that most documentation is wrong about it.

## Docker Content Trust is gone

If you have read about image signing before, you have read about **Docker Content Trust** — \`DOCKER_CONTENT_TRUST=1\`, Notary, \`docker trust sign\`.

**Engine 29 removed it from the CLI.** It survives only as a separate plugin. Notary v1 had well-known operational problems — key management that people got wrong, a hard dependency on a Notary server, and a trust model that did not compose with anything else — and the ecosystem moved on.

So: \`DOCKER_CONTENT_TRUST=1\` is not the answer any more, and instructions telling you to set it are describing a version of Docker you are probably not running.

::quiz
---
question: A runbook says to set \`DOCKER_CONTENT_TRUST=1\` before pushing. On Engine 29, what happens?
options:
  - Docker Content Trust was removed from the CLI in 29, so the runbook needs replacing with a Sigstore-based flow
  - It silently signs the image with your account key
  - It fails the push with a clear error naming the replacement
answer: 0
explanation: The feature is gone from the CLI and available only as a separate plugin. The failure is not self-explanatory, which is exactly why an old runbook can look like it is still working when nothing is being signed.
---
::

## Sigstore and cosign

The current answer is **Sigstore**, used through \`cosign\`. Its important property is **keyless signing**: instead of a long-lived private key someone has to protect, the signer authenticates via OIDC — a CI workload identity, a GitHub Actions token — and gets a short-lived certificate. The signature and certificate are recorded in **Rekor**, a public append-only transparency log.

No key to leak, and a public record that a signature was made, by whom, at what time.

\`\`\`
cosign sign ghcr.io/acme/app@sha256:9f2a1c8b7e...
\`\`\`

::terminal-teaser
---
lines:
  - cmd: cosign sign ghcr.io/acme/app@sha256:9f2a1c8b7e
    out: |-
      Generating ephemeral keys...
      Retrieving signed certificate...
      tlog entry created with index: 84729103
  - cmd: cosign verify --certificate-identity-regexp 'https://github.com/acme/.+' --certificate-oidc-issuer https://token.actions.githubusercontent.com ghcr.io/acme/app@sha256:9f2a1c8b7e
    out: |-
      Verification for ghcr.io/acme/app@sha256:9f2a1c8b7e --
      The signatures were verified against the specified certificate identity
---
::

**Sign the digest, never the tag.** Signing a tag signs a pointer that can be moved; the signature would still verify against different bytes tomorrow. Every command above names \`@sha256:…\` deliberately.

The verification arguments are the substance. \`--certificate-identity-regexp\` and \`--certificate-oidc-issuer\` say **who is allowed to have signed this**. Without them you are verifying that *somebody* signed it, which is not a security property — anyone can sign anything.

::quiz
---
question: Why must \`cosign verify\` be given an expected identity and issuer?
options:
  - Otherwise it only proves that someone signed the image, not that a party you trust did
  - Because keyless signatures have no signer
  - To locate the signature in the registry
answer: 0
explanation: Anyone can sign any public image. The check that matters is that the certificate binds to an identity you expect — your CI workflow, in your repository, from your OIDC issuer. A bare \`cosign verify\` passing is close to meaningless.
---
::

## In a pipeline

\`\`\`yaml
permissions:
  contents: read
  packages: write
  id-token: write            # required for keyless signing

jobs:
  build:
    steps:
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        id: build
        with:
          push: true
          tags: ghcr.io/acme/app:\${{ github.sha }}
          sbom: true
          provenance: mode=max

      - uses: sigstore/cosign-installer@v3
      - run: cosign sign --yes ghcr.io/acme/app@\${{ steps.build.outputs.digest }}
\`\`\`

\`id-token: write\` is the permission that makes keyless signing possible, and its absence is the usual cause of a confusing OIDC failure. \`build-push-action\` outputs the digest, which is what gets signed.

## Enforcing it

A signature nobody checks is decoration. The check belongs at admission — the moment before something runs:

- **Kubernetes** — an admission controller such as Sigstore Policy Controller, Kyverno, or Connaisseur rejects unsigned or wrongly-signed images.
- **A plain Docker host** — verify in the deploy script before \`docker run\`, and pin by digest so the verified bytes are the ones that start.
- **Registry-side** — some registries can require signatures for a repository.

The order to adopt it in matters, because doing this in the wrong order takes production down: **sign everything first, observe for a while, then enforce.** Turning on enforcement before every image is signed means the next deploy fails, usually at the worst moment.

::fill-blank
---
prompt: Sign the image at digest \`sha256:9f2a1c\` in \`ghcr.io/acme/app\` with cosign, without an interactive prompt.
answer:
  - cosign sign --yes ghcr.io/acme/app@sha256:9f2a1c
  - cosign sign -y ghcr.io/acme/app@sha256:9f2a1c
hint: Sign the digest, not a tag, and skip the confirmation.
placeholder: cosign sign ...
---
::

::deep-dive{title="What signing does and does not prove"}
A verified signature proves one narrow thing: **these exact bytes were signed by that identity.**

It does **not** prove the image is safe, that the code was reviewed, that the build was not compromised, or that the signer meant to endorse it for production. A compromised CI pipeline signs malware perfectly.

So signing is one link. The chain that is actually load-bearing:

1. **Source integrity** — protected branches, required reviews, signed commits.
2. **Build integrity** — an ephemeral, isolated builder whose provenance records the source commit. This is what SLSA levels grade, and why \`provenance=mode=max\` matters.
3. **Artifact integrity** — the signature, over the digest.
4. **Deployment integrity** — admission control verifying identity, and deploying by digest.

Break any link and the rest is theatre. The most commonly broken one is the fourth: organisations that sign diligently and then deploy \`:latest\` with no verification, so the signature is generated and never consulted.

Two habits worth taking from this lesson regardless of how far you go. **Deploy by digest**, because it is free and it makes "what is running" answerable exactly. And **write down what your verification actually asserts** — which identity, which issuer, which repository — because a \`cosign verify\` with the wrong regex passes happily against an image signed by someone else entirely.
::

Next up: observability — logs, events, and metrics from containers at scale.
`;export{e as default};
