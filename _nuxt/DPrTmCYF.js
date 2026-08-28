const e=`Everything so far was about making a script work. This lesson is about making one you would be willing to run at 3am, on a machine you are not watching, against data you cannot replace.

Very little of it is clever. It is a short list of habits, and the reason to learn them as a list is that each one exists because of a specific way scripts fail.

## \`set -e\` — stop at the first failure

By default a script carries on after a command fails. The \`cd\` fails, and the \`rm -rf ./*\` on the next line runs anyway, somewhere else.

\`\`\`
#!/bin/sh
set -e
\`\`\`

Now any command that exits non-zero ends the script immediately.

There are exceptions, and they are deliberate rather than bugs. A command in an \`if\` condition, on the left of \`&&\` or \`||\`, or negated with \`!\` is allowed to fail — otherwise you could never test anything. So when a failure is expected, say so:

\`\`\`
grep -q ERROR app.log || echo "clean"     # not fatal: the || handles it
\`\`\`

\`set -e\` is not a substitute for handling errors — it is the safety net for the ones you didn't think of.

## \`set -u\` — stop on an undefined variable

\`\`\`
set -u
\`\`\`

Without it, a typo'd or unset variable expands to nothing, silently:

\`\`\`
rm -rf "$BUILD_DIR/"      # BUILD_DIR unset  ->  rm -rf "/"
\`\`\`

That is not a hypothetical; it is one of the most famous classes of shell disaster there is. With \`set -u\`, the script stops and names the variable instead.

The two together, on line two of every script:

\`\`\`
#!/bin/sh
set -eu
\`\`\`

::quiz
---
question: A deploy script without \`set -u\` contains \`rsync -a ./dist/ \\"$HOST:/var/www/\\"\`. \`HOST\` is misspelled at the point it was set. What happens?
options:
  - rsync is asked to copy to a local path \`:/var/www/\`, and the deploy silently goes nowhere
  - The script stops with an undefined-variable error
  - rsync refuses to run without a host
answer: 0
explanation: The expansion becomes empty, so the destination is a plausible-looking local path. rsync succeeds, the script reports success, and nothing reaches the server. \`set -u\` turns this into an immediate, named error.
---
::

## Quote everything

The recurring theme of this course, stated once as a rule: **every variable expansion goes in double quotes unless you have a specific reason otherwise.**

\`\`\`
cp "$SRC" "$DST"
[ -f "$CONFIG" ]
for f in "$DIR"/*; do ...
rm -rf "\${BUILD_DIR:?BUILD_DIR is not set}"
\`\`\`

That last form is worth knowing on its own. \`\${VAR:?message}\` expands to the value, or exits with your message if it is unset or empty — a per-variable \`set -u\` for the lines where the consequences are worst.

Related, from the variables lesson: \`\${VAR:-default}\` supplies a fallback without assigning, \`\${VAR:=default}\` supplies it *and* sets the variable.

\`\`\`
LOG_LEVEL="\${LOG_LEVEL:-info}"       # respect the environment, have an opinion
\`\`\`

## \`trap\` — clean up whatever happens

A script that creates a temporary file will, sooner or later, be killed before it removes it. \`trap\` runs a command when the shell receives a signal or exits:

\`\`\`
#!/bin/sh
set -eu

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# ... use "$TMPDIR" freely ...
\`\`\`

\`EXIT\` fires on *every* exit path — success, failure, \`set -e\` bailing out, a Ctrl-C. One line, and the temporary directory cannot leak.

Two habits go with it. Use \`mktemp\` rather than a fixed path like \`/tmp/build\`: a predictable name in a world-writable directory is both a collision and a security problem, since another user can create it first as a symlink to something you will then overwrite. And use single quotes in the trap so \`$TMPDIR\` is expanded when the trap *fires*, not when it is installed.

::quiz
---
question: |-
  Why \`trap 'rm -rf "$TMPDIR"' EXIT\` with single quotes rather than double?
options:
  - Single quotes defer the expansion to when the trap runs, so it uses the value at that moment
  - Double quotes are not valid in a trap argument
  - It makes no difference here
answer: 0
explanation: With double quotes the value is baked in at the moment \`trap\` is called. Usually identical — but if the script reassigns \`TMPDIR\` later, the double-quoted version deletes the old directory and leaks the new one. Deferring is the safer default.
---
::

## Make it re-runnable

A script that only works on a clean machine will be run twice eventually — after a failure halfway through, which is exactly when you least want a second failure mode.

\`\`\`
mkdir -p "$DEST"                          # not an error if it exists
ln -sfn "$RELEASE" /var/www/current       # replaces an existing link
grep -q "^export PATH" ~/.profile || echo "export PATH=..." >> ~/.profile
\`\`\`

The last one is the general pattern: **check, then act**. It is the difference between a script you run and one you can run.

## Say what went wrong, on the right stream

\`\`\`
die() {
  echo "ERROR: $*" >&2
  exit 1
}

[ -f "$CONFIG" ] || die "config not found: $CONFIG"
\`\`\`

Errors go to stderr, so they stay visible when output is piped or captured. Messages name the actual value — \`config not found: /etc/app.conf\` is diagnosable; \`something went wrong\` is not.

## The skeleton

Putting the whole course together, this is what a script worth trusting looks like:

\`\`\`
#!/bin/sh
#
# release.sh — build the site and publish it to a host.
# Usage: release.sh [-v] HOST

set -eu

VERBOSE=0

log() { echo "[$(date +%H:%M:%S)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [-v] HOST

  -v    verbose output
  -h    show this message
EOF
}

main() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -v) VERBOSE=1; shift ;;
      -h) usage; exit 0 ;;
      -*) die "unknown option: $1" ;;
      *)  break ;;
    esac
  done

  [ "$#" -eq 1 ] || { usage >&2; exit 1; }
  HOST="$1"

  command -v rsync >/dev/null 2>&1 || die "rsync is not installed"

  WORK=$(mktemp -d)
  trap 'rm -rf "$WORK"' EXIT

  log "Building into $WORK"
  npm run build --silent -- --out "$WORK" || die "build failed"

  [ -n "$(ls -A "$WORK")" ] || die "build produced nothing"

  log "Publishing to $HOST"
  rsync -a --delete "$WORK/" "$HOST:/var/www/site/" || die "rsync to $HOST failed"

  log "Done"
}

main "$@"
\`\`\`

Nothing in it is advanced. It is \`set -eu\`, quoted expansions, a \`trap\`, a \`case\` loop over the arguments, two helper functions, and one check that the build actually produced something before it was allowed to \`--delete\` on a live server.

::deep-dive{title="ShellCheck"}
Install \`shellcheck\` and run it on everything you write. It is a static analyser for shell, and it is unusually good — most of this lesson is in its rule set:

\`\`\`
$ shellcheck release.sh

In release.sh line 41:
  rsync -a --delete $WORK/ "$HOST:/var/www/site/"
                    ^-----^ SC2086: Double quote to prevent globbing
                            and word splitting.
\`\`\`

Every warning has a code, and every code has a wiki page explaining the failure mode with an example. Reading a dozen of them will teach you more about the shell's edge cases than any tutorial, this one included.

It is also the cheapest possible CI step. One line in a pipeline catches the unquoted expansion before it reaches a production host, which is not a thing you can say about many linters.
::

::fill-blank
---
prompt: Create a temporary directory, storing its path in \`WORK\`.
answer:
  - WORK=$(mktemp -d)
  - WORK="$(mktemp -d)"
  - WORK=\`mktemp -d\`
hint: One command makes the directory and prints its path; capture that.
placeholder: WORK=...
---
::

## Where to go from here

You now have the whole language: variables, quoting, exit status, \`test\`, loops, \`case\`, positional parameters, command substitution, functions, and redirection. That is genuinely all of it — POSIX shell is a small language, which is why it has outlived almost everything built to replace it.

What is left is judgement, and most of that is one question: **is this still a shell script?** The shell is superb at running programs and moving data between them. It is poor at data structures, arithmetic beyond integers, string manipulation, error handling with any nuance, and anything you would want to unit test. When a script starts wanting those things, it is telling you it should be a program in another language.

Somewhere around two hundred lines, or the first time you reach for an associative array, is the usual moment. Until then, the shell is the shortest path from a problem to a running solution, and now you can write one that holds up.

Two things worth doing next: read Steve Parker's *Shell Scripting Tutorial* at [shellscript.sh](https://www.shellscript.sh) for a second pass over the same ground in a different voice, and run \`shellcheck\` over the scripts already on your machine. The second one is more educational than it sounds.
`;export{e as default};
