const n=`Almost every useful script is a loop. Do this to every file. Retry until it works. Read the list and act on each line. The shell gives you three loop forms, and two of them cover nearly everything.

## \`for\` walks a list of words

\`\`\`
for FILE in *.log
do
  echo "Compressing $FILE"
  gzip "$FILE"
done
\`\`\`

\`for\` takes a list of **words** — not a range, not a collection, just words separated by whitespace — and runs the body once per word with the variable set to it.

That list can come from anywhere the shell can produce words: a glob, a literal list, a variable, the output of a command.

::terminal-teaser
---
lines:
  - cmd: for X in one two three; do echo "got $X"; done
    out: |-
      got one
      got two
      got three
  - cmd: for N in 1 2 3; do echo "$((N * N))"; done
    out: |-
      1
      4
      9
---
::

The semicolon form is the same loop written on one line — \`do\` needs a separator before it exactly as \`then\` did.

## The empty-glob trap

This is the one thing to know about \`for\` before you write a real one:

\`\`\`
for FILE in *.log
do
  rm "$FILE"
done
\`\`\`

In a directory with no \`.log\` files, a POSIX shell leaves the unmatched pattern alone. The loop runs **once**, with \`FILE\` set to the literal string \`*.log\`, and \`rm\` fails complaining about a file named \`*.log\`.

With \`rm\` that's merely noisy. With something that creates or moves files, you get a real file called \`*.log\` on disk, and a \`*\` in a filename is a genuinely unpleasant thing to clean up.

The fix is to check:

\`\`\`
for FILE in *.log
do
  [ -e "$FILE" ] || continue
  rm "$FILE"
done
\`\`\`

::quiz
---
question: A directory contains no \`.tmp\` files. How many times does \`for F in *.tmp; do echo "$F"; done\` print something?
options:
  - Once — it prints the literal text \`*.tmp\`
  - Zero times — an unmatched glob produces an empty list
  - It's an error; the loop doesn't run
answer: 0
explanation: An unmatched pattern is passed through unchanged, so the list is one word long. Guard the body with \`[ -e "$F" ] || continue\` whenever the loop does anything more consequential than echo.
---
::

## \`while\` repeats until a command fails

Where \`for\` walks a known list, \`while\` repeats as long as a command keeps succeeding:

\`\`\`
COUNT=1
while [ "$COUNT" -le 5 ]
do
  echo "Attempt $COUNT"
  COUNT=$((COUNT + 1))
done
\`\`\`

\`$(( ... ))\` is arithmetic expansion — the shell's built-in integer maths. It is the portable way to count; the older \`expr\` runs an external program for every single increment.

The condition is a command, same as with \`if\`. Which makes retry loops read almost like English:

\`\`\`
until curl -sf http://localhost:8080/health
do
  echo "Waiting for the service..."
  sleep 2
done
echo "Up."
\`\`\`

\`until\` is \`while\` with the sense inverted: it loops while the command *fails*. Both exist because sometimes one of them reads better than negating the other.

::quiz
---
question: What does \`until [ -f /tmp/ready ]; do sleep 1; done\` do?
options:
  - Blocks until the file \`/tmp/ready\` appears, checking once a second
  - Deletes \`/tmp/ready\` after one second
  - Loops forever, since \`until\` has no exit condition
answer: 0
explanation: |-
  \`until\` repeats while its condition is false. \`[ -f ... ]\` is false until the file exists, so the loop spins — one second at a time — and falls through the moment it appears. It's the shell's version of waiting on a flag.
---
::

## Reading a file line by line

This is the pattern worth committing to memory, because the obvious alternative is wrong:

\`\`\`
while read -r LINE
do
  echo "Line: $LINE"
done < servers.txt
\`\`\`

The redirect goes on \`done\`, feeding the whole loop from the file. \`read\` consumes one line per iteration and returns non-zero at end of file, which is what stops the loop.

\`-r\` stops \`read\` from interpreting backslashes in the data. There is essentially never a reason to omit it.

::deep-dive{title="Why not \`for LINE in $(cat file)\`?"}
Because \`for\` splits on **whitespace**, not on newlines. A file like:

\`\`\`
web-01 production
web-02 staging
\`\`\`

gives you four iterations, not two — and any line containing a \`*\` gets glob-expanded against the current directory on the way through.

\`while read\` splits on newlines, which is what a line-oriented file actually means. It also streams: the file is read a line at a time rather than loaded whole into a command substitution, so it works on a log you couldn't fit in memory.

One consequence to know about. The loop body runs in the shell, but if you pipe *into* the loop — \`cat file | while read -r LINE; do ...; done\` — the loop runs in a subshell, and variables it sets are lost when the pipe ends:

\`\`\`
COUNT=0
cat servers.txt | while read -r L; do COUNT=$((COUNT + 1)); done
echo "$COUNT"      # 0, on most shells
\`\`\`

Redirect with \`< file\` on \`done\` instead of piping, and the count survives.
::

## \`break\` and \`continue\`

\`break\` leaves the loop; \`continue\` skips to the next iteration. Both are what turn a loop into something with a shape:

\`\`\`
for HOST in web-01 web-02 web-03
do
  ping -c1 -W1 "$HOST" >/dev/null 2>&1 || continue
  echo "$HOST is up"
done
\`\`\`

::fill-blank
---
prompt: Loop over every \`.conf\` file in the current directory, storing each name in \`F\`. Write just the opening line of the loop.
answer:
  - for F in *.conf
  - for F in *.conf; do
  - for F in ./*.conf
hint: The list is a glob; no quotes around it, or it wouldn't expand.
placeholder: for F ...
---
::

## A loop that does something real

Putting the lesson together — compress yesterday's logs, skipping anything already compressed:

\`\`\`
#!/bin/sh
LOGDIR=/var/log/myapp

for FILE in "$LOGDIR"/*.log
do
  [ -e "$FILE" ] || continue          # empty-glob guard
  [ -s "$FILE" ] || continue          # skip empty files

  echo "Compressing $FILE"
  if gzip "$FILE"; then
    echo "  ok"
  else
    echo "  FAILED: $FILE" >&2
  fi
done
\`\`\`

Note \`>&2\` on the failure line — that sends it to standard error, so a human watching sees the problem while a pipeline collecting the normal output stays clean.

Next up: \`case\` — the readable way to branch on a value, and how scripts dispatch on their first argument.
`;export{n as default};
