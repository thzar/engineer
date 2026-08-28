const e=`An SBOM tells you what is in an image. A vulnerability database tells you which of those things has a known problem. **Docker Scout** joins the two and — the part that makes it useful rather than merely alarming — tells you what to change.

## Start with the quickview

\`\`\`
docker scout quickview ghcr.io/acme/app:1.0
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker scout quickview ghcr.io/acme/app:1.0
    out: |-
      Target             ghcr.io/acme/app:1.0     0C  2H  9M  14L
      Base image         node:22-alpine           0C  1H  4M  11L
      Refreshed base     node:22-alpine           0C  0H  1M   3L
---
::

Three rows, and the third is the one that pays for the tool. **Most of your vulnerabilities are in the base image, and most of those are already fixed** — the base was rebuilt after you pulled it. Repulling and rebuilding fixes them with no code change at all.

The counts are Critical, High, Medium, Low. Read them relative to each other, not as a score.

## The commands

\`\`\`
docker scout quickview IMAGE          # the summary above
docker scout cves IMAGE               # every finding, with package and fix version
docker scout recommendations IMAGE    # what to change about the base
docker scout compare --to IMAGE-A IMAGE-B    # what a change did
docker scout policy IMAGE             # evaluate against configured policy
docker scout sbom IMAGE               # the inventory itself
\`\`\`

\`cves\` is the detailed list, and its filters are what make it usable in a pipeline:

\`\`\`
docker scout cves --only-severity critical,high ghcr.io/acme/app:1.0
docker scout cves --only-fixed ghcr.io/acme/app:1.0
docker scout cves --format only-packages --only-severity critical ghcr.io/acme/app:1.0
\`\`\`

\`--only-fixed\` is the filter to reach for first. A finding with no available fix is something to track; a finding with a fix is work you can do this afternoon, and separating the two turns a wall of red into a task list.

::quiz
---
question: Scout reports 40 vulnerabilities, of which 31 are in the base image and already fixed upstream. What is the highest-value action?
options:
  - Repull the base and rebuild — most of the findings disappear with no application change
  - Add each CVE to an ignore list
  - Switch language runtime
answer: 0
explanation: A stale base is the most common cause of a long CVE list and the cheapest to fix. That is exactly what the "Refreshed base image" row in \`quickview\` is telling you — and it is why a scheduled rebuild is worth more than most triage.
---
::

## Comparing, which is what you actually want in CI

Absolute counts are noisy. What matters at review time is whether *this change* made things worse:

\`\`\`
docker scout compare --to ghcr.io/acme/app:main ghcr.io/acme/app:pr-482
\`\`\`

::terminal-teaser
---
lines:
  - cmd: docker scout compare --to ghcr.io/acme/app:main ghcr.io/acme/app:pr-482
    out: |-
      Packages and Vulnerabilities
        +2 packages   +1H +3M
        ~  openssl  3.3.2 -> 3.3.1   (downgraded)
        +  libxml2  2.13.4           1H 2M
---
::

A reviewer can act on that. "Your branch adds one High by pulling in libxml2, and downgrades openssl" is a specific, arguable claim. "There are 40 vulnerabilities" is not.

## Recommendations

\`\`\`
docker scout recommendations ghcr.io/acme/app:1.0
\`\`\`

This one is about the base image specifically, and it will suggest things like moving \`node:22\` to \`node:22-alpine\`, or to a newer patch tag, with the CVE and size deltas each change would produce. It is opinionated in a useful way — the suggestions are ranked by what they remove.

::quiz
---
question: Why is \`docker scout compare\` more useful in a pull request than \`docker scout cves\`?
options:
  - It shows what this change added or removed, instead of restating pre-existing findings
  - It runs faster
  - It checks the base image and \`cves\` does not
answer: 0
explanation: Absolute counts on an existing codebase are mostly inherited, so they get ignored after the first week. A delta attributes new findings to the change that introduced them, which is the only form a reviewer can act on.
---
::

## As a gate

Policies turn findings into pass or fail:

\`\`\`
docker scout policy ghcr.io/acme/app:1.0 --org acme
\`\`\`

Built-in policies cover things like no fixable criticals, no outdated base images, an SBOM being present, no default non-root violation. In GitHub Actions:

\`\`\`yaml
      - uses: docker/scout-action@v1
        with:
          command: compare
          image: ghcr.io/acme/app:\${{ github.sha }}
          to: ghcr.io/acme/app:main
          only-severities: critical,high
          exit-code: true
\`\`\`

\`exit-code: true\` fails the job. Which is a decision to make deliberately: a gate that fires on findings nobody can fix teaches people to bypass it. Start by gating on **fixable criticals introduced by this change** and widen once the baseline is clean.

::fill-blank
---
prompt: List only the fixable critical and high vulnerabilities in \`ghcr.io/acme/app:1.0\`.
answer:
  - docker scout cves --only-severity critical,high --only-fixed ghcr.io/acme/app:1.0
  - docker scout cves --only-fixed --only-severity critical,high ghcr.io/acme/app:1.0
  - docker scout cves --only-severity critical,high --only-fixed -- ghcr.io/acme/app:1.0
hint: The cves subcommand, a severity filter, and the filter that hides findings with no fix.
placeholder: docker scout cves ...
---
::

::deep-dive{title="Scanning honestly"}
A scanner is easy to install and easy to make useless. Four habits separate the two.

**Scan the image you ship.** Multi-stage builds exist so the compiler is not in production — scanning the build stage reports on software nobody runs and buries the findings that matter.

**Fix the base first, and on a schedule.** Rebuilding weekly against a refreshed base clears most findings with no code change. This single practice beats any amount of triage, and it is the one people skip because it produces no visible work.

**Gate on the delta, not the total.** A gate on absolute counts fails on inherited findings and gets bypassed within a fortnight. A gate on *newly introduced fixable* criticals stays credible, because every failure is something the author can act on.

**Record decisions where they are auditable.** Findings you accept need a reason attached to the artifact — a VEX statement — not a rule in a scanner's config that nobody revisits.

And use more than one scanner if it matters to you. Scout, Trivy, Grype and Snyk disagree, because they use different databases and different matching rules, and a CVE that one misses is not thereby absent. Scout's advantage is that it is already in the CLI and reads the attestations from the previous lesson directly; that is convenience, not omniscience.

The failure mode to avoid is the one where a scan runs on every build, nobody reads the output, and everyone believes the images are checked. An unread gate is worse than no gate, because it is load-bearing in exactly one place: the conversation after the incident.
::

Next up: hardened and minimal base images — removing the packages instead of triaging them.
`;export{e as default};
