const n=`Two things that belong together: \`case\`, the shell's way of branching on a value, and the **positional parameters** — how a script gets hold of what it was called with. Put them side by side and you have the shape of nearly every command-line tool ever written in shell.

## \`case\` beats a stack of \`elif\`

\`\`\`
case "$1" in
  start)
    echo "Starting"
    ;;
  stop)
    echo "Stopping"
    ;;
  restart)
    echo "Restarting"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart}" >&2
    exit 1
    ;;
esac
\`\`\`

The parts: \`case VALUE in\`, then one or more \`PATTERN)\` branches, each ending in \`;;\`, closed by \`esac\`. Matching is top to bottom, first match wins, and \`*\` at the end is the catch-all.

The \`;;\` is not optional and not a typo. A single \`;\` would just be a command separator inside the branch — the doubled form is what says "this branch is over".

## The patterns are globs, not regular expressions

This is the part that makes \`case\` more useful than it first looks. The patterns are the same wildcards as filenames:

\`\`\`
case "$FILE" in
  *.tar.gz|*.tgz)  tar -xzf "$FILE" ;;
  *.tar.bz2)       tar -xjf "$FILE" ;;
  *.zip)           unzip "$FILE" ;;
  *.gz)            gunzip "$FILE" ;;
  *)               echo "Don't know how to extract $FILE" >&2; exit 1 ;;
esac
\`\`\`

\`|\` separates alternatives within one branch. \`?\`, \`[a-z]\`, and \`[!...]\` all work as they do in globbing.

::terminal-teaser
---
lines:
  - cmd: ./extract.sh site.tar.gz
    out: |-
      Extracting as gzipped tar
  - cmd: ./extract.sh photos.zip
    out: |-
      Extracting as zip
  - cmd: ./extract.sh notes.txt
    out: |-
      Don't know how to extract notes.txt
---
::

::quiz
---
question: In \`case "$X" in [Yy]*) echo yes ;; esac\`, which values of \`X\` print "yes"?
options:
  - Anything starting with an upper- or lower-case Y — "y", "Yes", "yeah"
  - Only the exact strings "Y" and "y"
  - Only "Y*" and "y*" literally
answer: 0
explanation: |-
  \`[Yy]\` matches one character from the set, and \`*\` matches whatever follows, including nothing. It's the standard way to accept a yes/no answer without caring how the user capitalised it.
---
::

## \`$1\` through \`$9\`, and \`$#\`

A script's arguments arrive as numbered variables:

\`\`\`
#!/bin/sh
echo "Called as:      $0"
echo "First argument: $1"
echo "Second:         $2"
echo "How many:       $#"
echo "All of them:    $@"
\`\`\`

\`\`\`
$ ./args.sh hello world
Called as:      ./args.sh
First argument: hello
Second:         world
How many:       2
All of them:    hello world
\`\`\`

\`$0\` is the script's own name as it was invoked — a path, if you ran it as one. \`basename "$0"\` trims it down for usage messages. Note that \`$0\` is *not* counted by \`$#\`.

## \`"$@"\` and \`"$*"\` are not the same

Both expand to all the arguments. Only one of them is safe.

Given a script called with \`./s.sh "my file.txt" other.txt\`:

| Form | Becomes |
|---|---|
| \`"$@"\` | \`"my file.txt"\` \`"other.txt"\` — two arguments, boundaries kept |
| \`"$*"\` | \`"my file.txt other.txt"\` — one argument, joined by a space |
| \`$@\` unquoted | \`"my"\` \`"file.txt"\` \`"other.txt"\` — three, split apart |

**Use \`"$@"\`, with the quotes, always.** It is the only form that passes your arguments through to another command unchanged. \`"$*"\` has one legitimate use — joining the arguments into a single string for a log message — and unquoted \`$@\` has none.

\`\`\`
exec docker run "$@"        # correct: arguments forwarded intact
exec docker run $@          # broken by the first filename with a space
\`\`\`

::quiz
---
question: |-
  A wrapper script ends with \`ssh "$HOST" $@\`. A user runs it with an argument \`ls -l /my dir\`. What does the remote host receive?
options:
  - Four separate arguments — the path is split at the space
  - The command exactly as typed
  - An error, because unquoted \`$@\` is invalid syntax
answer: 0
explanation: Unquoted \`$@\` is subject to word splitting like any other expansion, so \`/my dir\` arrives as two arguments. \`"$@"\` preserves the boundaries the caller intended. This is the standard bug in hand-written wrapper scripts.
---
::

## \`shift\`

\`$1\` through \`$9\` run out, and the tenth argument is not \`$10\` in a POSIX shell — that parses as \`$1\` followed by a literal \`0\`. \`shift\` is the answer: it discards \`$1\` and slides everything down one.

\`\`\`
#!/bin/sh
while [ "$#" -gt 0 ]
do
  echo "Handling: $1"
  shift
done
\`\`\`

This handles any number of arguments, and it is also the basis of option parsing:

\`\`\`
#!/bin/sh
VERBOSE=0
OUTPUT=""

while [ "$#" -gt 0 ]
do
  case "$1" in
    -v|--verbose)
      VERBOSE=1
      shift
      ;;
    -o|--output)
      OUTPUT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $(basename "$0") [-v] [-o FILE] INPUT..."
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      break          # first non-option argument: stop parsing
      ;;
  esac
done

echo "verbose=$VERBOSE output=$OUTPUT remaining: $@"
\`\`\`

That is \`case\` and \`shift\` doing the whole job, and it is roughly what every hand-rolled CLI in shell looks like. \`shift 2\` drops an option and its value together; \`break\` on the first non-option leaves the file arguments sitting in \`"$@"\` for the rest of the script.

::deep-dive{title="\`getopts\`, and when to reach for it"}
The shell has a builtin for this, and for short options it is tidier:

\`\`\`
while getopts "vo:h" OPT
do
  case "$OPT" in
    v) VERBOSE=1 ;;
    o) OUTPUT="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage; exit 1 ;;
  esac
done
shift $((OPTIND - 1))
\`\`\`

The string \`"vo:h"\` declares the valid letters; a trailing \`:\` means that option takes a value, which lands in \`$OPTARG\`. \`$OPTIND\` tracks how far it got, so the \`shift\` afterwards leaves the non-option arguments in \`"$@"\`.

It also handles bundling — \`-vh\` is understood as \`-v -h\` — which the hand-written loop above does not.

What it does **not** do is long options. POSIX \`getopts\` knows nothing about \`--verbose\`. GNU \`getopt\` (no \`s\`) does, but it is a separate program with incompatible BSD and GNU versions, which is exactly the portability problem you were avoiding.

So: \`getopts\` when short options are enough, the \`case\`/\`shift\` loop when you want \`--long-form\` names and are willing to write ten more lines.
::

::fill-blank
---
prompt: Inside a script, print the number of arguments it was called with.
answer:
  - echo $#
  - echo "$#"
hint: One special parameter holds the count.
placeholder: echo ...
---
::

Next up: command substitution — capturing the output of one command as the input to another, and the pitfalls hiding in the whitespace.
`;export{n as default};
