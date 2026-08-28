const e=`A variable is a name holding a piece of text. The shell has no types worth speaking of — everything is a string, and the programs you hand those strings to decide whether they look like numbers.

Assignment looks like every other language. It is the two rules *around* the assignment that trip people up, and they trip up everyone exactly once.

## Assigning and reading

\`\`\`
NAME="Ada"
echo $NAME
\`\`\`

Set with a bare name, read with a \`$\` in front. That asymmetry is the shell telling you the difference between "the box" and "what's in the box".

::terminal-teaser
---
lines:
  - cmd: NAME="Ada"
    out: ""
  - cmd: echo $NAME
    out: Ada
  - cmd: echo "Hello, $NAME"
    out: Hello, Ada
  - cmd: |-
      echo 'Hello, $NAME'
    out: Hello, $NAME
---
::

## Rule one: no spaces around the \`=\`

This works:

\`\`\`
NAME="Ada"
\`\`\`

This does not:

\`\`\`
NAME = "Ada"
sh: NAME: command not found
\`\`\`

The error tells you exactly what happened. The shell splits a line into words and assumes the first word is a command. \`NAME=Ada\` has no spaces, so it is one word containing an \`=\`, which the shell recognises as an assignment. \`NAME = "Ada"\` is three words, so the shell tried to run a program called \`NAME\` with the arguments \`=\` and \`Ada\`.

Once you see it that way it stops being an arbitrary rule. There is no way the shell *could* allow the spaces without losing the ability to pass \`=\` as an argument.

## Rule two: quote the value

\`\`\`
MSG=Hello World
\`\`\`

fails too, and for the same reason: the shell sees \`MSG=Hello\` (an assignment) followed by \`World\` (a command to run with that variable set). A variable holds one value, so anything containing a space has to be quoted.

\`\`\`
MSG="Hello World"
\`\`\`

::quiz
---
question: Why does \`COUNT = 5\` produce "command not found"?
options:
  - The shell reads it as running the command \`COUNT\` with arguments \`=\` and \`5\`
  - Numbers must be assigned with \`-eq\` rather than \`=\`
  - The value needs quoting, as \`COUNT = "5"\`
answer: 0
explanation: Spaces separate words, and the first word of a line is a command. Without spaces, \`COUNT=5\` is a single word the shell recognises as an assignment. Adding quotes doesn't help — \`COUNT = "5"\` still has spaces, so it still tries to run \`COUNT\`.
---
::

## Quoting when you read, too

Reading a variable is where quoting really earns its keep. Compare:

\`\`\`
FILE="my report.txt"
rm $FILE       # runs: rm my report.txt   — two files, both wrong
rm "$FILE"     # runs: rm "my report.txt" — one file, correct
\`\`\`

After substituting the value, the shell splits the result into words again. Without quotes, a value containing a space becomes two arguments. This is the single most common bug in shell scripts, and it is invisible until someone's filename has a space in it — which, on any machine touched by a human, is eventually.

The habit worth building now: **write \`"$VAR"\`, always, unless you have a specific reason not to.**

::fill-blank
---
prompt: Delete the file whose name is held in the variable \`TARGET\`, safely, even if that name contains spaces.
answer:
  - rm "$TARGET"
  - rm -- "$TARGET"
hint: The variable expansion needs to survive word splitting.
placeholder: rm ...
---
::

## Curly braces disambiguate

The shell reads a variable name greedily — as far as the characters allow.

\`\`\`
FOO=sun
echo $fooshine     # empty: there is no variable "fooshine"
echo \${FOO}shine   # sunshine
\`\`\`

The braces say where the name stops. You will mostly see them used exactly like this, gluing a variable to text that follows it. In the next lessons they pick up some genuinely powerful extra behaviour.

## Reading input

\`read\` takes a line from standard input and puts it in a variable:

\`\`\`
#!/bin/sh
printf "What is your name? "
read NAME
echo "Hello, $NAME"
\`\`\`

Note \`printf\` rather than \`echo -n\`. Suppressing the trailing newline is the one thing \`echo\` does differently on every shell: \`echo -n\` works on bash, \`echo "...\\c"\` works on dash and the original Bourne shell, and each prints the other's syntax literally. \`printf\` behaves the same everywhere, which is why portable scripts use it whenever the output is anything more than a plain line of text.

::deep-dive{title="Shell variables and environment variables"}
Setting a variable makes it visible to *this shell*. It does not make it visible to programs the shell runs:

\`\`\`
GREETING="hi"
sh -c 'echo "child sees: $GREETING"'
child sees:
\`\`\`

\`export\` is what promotes a shell variable into the **environment** — the set of strings the kernel hands to every program the shell starts:

\`\`\`
export GREETING="hi"
sh -c 'echo "child sees: $GREETING"'
child sees: hi
\`\`\`

This is the whole mechanism behind \`PATH\`, \`HOME\`, \`LANG\`, and every \`DATABASE_URL\` you have ever put in a \`.env\` file. Run \`env\` to see the exported set; \`set\` shows everything, exported or not.

The direction only goes one way. A child process cannot change its parent's environment — which is, once again, why a script cannot \`cd\` your shell for you.
::

::quiz
---
question: A script sets \`TOKEN=abc123\` then runs a Python program that reads \`os.environ["TOKEN"]\`. The program raises KeyError. Why?
options:
  - |-
    \`TOKEN\` was never exported, so it isn't in the child process's environment
  - Shell variables are lowercase-only when exported
  - Python cannot read variables set after the interpreter starts
answer: 0
explanation: Assignment creates a shell variable, which is private to that shell. Only \`export TOKEN=abc123\` (or \`TOKEN=abc123 python prog.py\`, which exports it for that one command) puts it in the environment the child inherits.
---
::

Next up: quoting and wildcards — the rest of what happens to a line between you pressing enter and a program actually running.
`;export{e as default};
