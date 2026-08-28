const n=`Once a script passes about fifty lines, the same five commands start appearing in three places. A **function** gives that block a name, and turns a wall of commands into something with structure.

## Defining and calling

\`\`\`
#!/bin/sh

log() {
  echo "[$(date +%H:%M:%S)] $1"
}

log "Starting"
log "Done"
\`\`\`

\`\`\`
[09:14:22] Starting
[09:14:22] Done
\`\`\`

Two things to notice, both of which are the shell being consistent rather than special.

**A function is called like a command**, with no parentheses and no commas — \`log "Starting"\`, not \`log("Starting")\`. As far as the rest of the script is concerned it *is* a command, and it shadows an external program of the same name.

**It must be defined before it is called.** The shell reads a script top to bottom; a function that appears after the line that calls it does not exist yet. Convention is to put them all near the top, after the shebang.

::quiz
---
question: A script defines a function named \`ls\` that prints "nope". What happens on the next line, which runs \`ls\`?
options:
  - It prints "nope" — a function takes precedence over an external program
  - The real \`/usr/bin/ls\` runs; functions cannot shadow commands
  - The shell reports an ambiguous command error
answer: 0
explanation: Lookup order is builtins and functions first, then \`PATH\`. Handy for stubbing something out in a test script, and a real hazard when a helper accidentally takes the name of a tool the script uses later. \`command ls\` bypasses the function and runs the external one.
---
::

## Arguments work exactly as they do for scripts

Inside a function, \`$1\`, \`$2\`, \`$#\`, and \`"$@"\` refer to the **function's** arguments, not the script's:

\`\`\`
greet() {
  echo "Hello, $1. You gave me $# argument(s)."
}

greet Ada
Hello, Ada. You gave me 1 argument(s).
\`\`\`

\`$0\` is the exception — it stays the script's name, since a function doesn't have one of its own.

If you need the script's arguments inside a function, pass them through explicitly:

\`\`\`
main() {
  echo "Script was called with: $@"
}
main "$@"
\`\`\`

That last line is a common idiom: define everything as functions, then hand the whole argument list to \`main\` at the bottom. It makes the script's entry point obvious and keeps the top-level free of stray logic.

::fill-blank
---
prompt: Call a function named \`deploy\`, passing it the value of the variable \`TARGET\` as its only argument.
answer:
  - deploy "$TARGET"
  - deploy $TARGET
hint: A function is called like any other command — and quote the expansion.
placeholder: deploy ...
---
::

## Returning: status, not values

This is where shell functions diverge from every other language you know.

\`return\` sets an **exit status** — a number from 0 to 255 — not a value:

\`\`\`
is_installed() {
  command -v "$1" >/dev/null 2>&1
}

if is_installed docker; then
  echo "docker is available"
fi
\`\`\`

No \`return\` needed there at all: a function's status is the status of its last command, and \`command -v\` already exits 0 or 1. The function reads as a predicate because it *is* one.

To return a **value**, you print it and the caller captures it:

\`\`\`
config_path() {
  if [ -f "./app.conf" ]; then
    echo "./app.conf"
  else
    echo "/etc/app.conf"
  fi
}

CONFIG=$(config_path)
\`\`\`

Which has an important consequence: anything a function prints becomes part of its "return value" when called this way. A stray progress message inside \`config_path\` would end up concatenated into \`$CONFIG\`.

::quiz
---
question: |-
  A function computes a total and ends with \`return $TOTAL\`. The caller does \`SUM=$(add_up)\`. Why is \`SUM\` empty?
options:
  - |-
    \`return\` sets an exit status, which command substitution doesn't capture — only printed output is captured
  - Command substitution only works on external programs
  - |-
    \`$TOTAL\` is out of scope by the time \`return\` runs
answer: 0
explanation: |-
  \`return\` and \`$(...)\` are two different channels. The status is in \`$?\`; the substitution captures standard output. Print the value with \`echo\` — and note that a total over 255 wouldn't survive \`return\` anyway, since exit statuses wrap at 256.
---
::

## Variables are global by default

Every variable a function sets is visible to the whole script, and every variable the script has set is visible inside it:

\`\`\`
COUNT=0

bump() {
  COUNT=$((COUNT + 1))     # modifies the outer COUNT
}

bump; bump
echo "$COUNT"              # 2
\`\`\`

Sometimes that is exactly what you want — it is how a function accumulates a result without printing it. More often it is an accident waiting to happen, because a helper using \`i\` as a loop counter will quietly destroy the caller's \`i\`.

::deep-dive{title="\`local\`, and what to do without it"}
Bash, ksh, dash, and BusyBox ash all support \`local\`:

\`\`\`
process() {
  local i
  local tmp
  for i in 1 2 3; do tmp="$i"; done
}
\`\`\`

It is not in POSIX. In practice every shell you will meet has it, and using it is the right call for anything shipping to Linux — but it means a script with \`#!/bin/sh\` and \`local\` in it is making an assumption, and should say so in a comment.

If you genuinely need strict POSIX, the alternatives are:

**Prefix your names.** A helper called \`retry\` uses \`_retry_count\`, \`_retry_max\`. Ugly, but it works everywhere and makes the ownership obvious in a stack trace.

**Use a subshell.** Wrap the body in \`( ... )\` instead of \`{ ... }\` and every variable is contained, because it runs in a child process:

\`\`\`
process() (
  i=1                       # cannot escape this subshell
  echo "$i"
)
\`\`\`

The cost is that the function now cannot set anything for the caller at all, and pays a fork on every call.

**Save and restore.** Verbose enough that nobody does it, but it is the fully portable answer.
::

## What functions are actually for

The version worth writing is not the clever one — it is the one that makes the script's shape visible:

\`\`\`
#!/bin/sh
set -eu

APP_DIR=/opt/app

log()  { echo "[$(date +%H:%M:%S)] $*"; }
die()  { echo "ERROR: $*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed"
}

build() {
  log "Building"
  cd "$APP_DIR" || die "no such directory: $APP_DIR"
  npm run build || die "build failed"
}

deploy() {
  log "Deploying to $1"
  rsync -a ./dist/ "$1:/var/www/site/" || die "rsync to $1 failed"
}

main() {
  [ "$#" -ge 1 ] || die "usage: $(basename "$0") HOST..."

  require npm
  require rsync

  build
  for HOST in "$@"; do
    deploy "$HOST"
  done
  log "All done"
}

main "$@"
\`\`\`

\`log\` and \`die\` are the two functions worth putting in every script you write. \`die\` in particular — printing to standard error and exiting in one word — removes the temptation to let a failure slide past because handling it properly would have taken three lines.

Next up: redirection and here-documents — controlling where a script's input and output actually go.
`;export{n as default};
