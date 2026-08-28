const e=`Between pressing enter and a program actually starting, the shell rewrites your line. It expands wildcards into filenames, substitutes variables, splits the result into words, and only then runs something.

Quoting is how you switch parts of that machinery off. Understanding *which* parts each kind of quote disables is the difference between guessing and knowing.

## Wildcards are expanded by the shell, not by the command

Type \`ls *.txt\` and \`ls\` never sees a \`*\`. The shell looks in the directory first, finds the matching names, and hands \`ls\` the finished list.

::terminal-teaser
---
lines:
  - cmd: ls
    out: notes.txt  report.txt  data.csv
  - cmd: ls *.txt
    out: notes.txt  report.txt
  - cmd: echo *.txt
    out: notes.txt report.txt
  - cmd: echo *.zip
    out: |-
      *.zip
---
::

That third line is the proof: \`echo\` has no idea about files, yet it printed filenames. The expansion — properly called **globbing** — happened before \`echo\` was started.

The fourth line shows the rule when nothing matches: a POSIX shell leaves the pattern alone and passes the literal \`*.zip\` through. This surprises people, and it is the reason a loop over \`*.zip\` in an empty directory runs exactly once, with the filename \`*.zip\`.

The patterns themselves are small:

| Pattern | Matches |
|---|---|
| \`*\` | any run of characters, including none |
| \`?\` | exactly one character |
| \`[abc]\` | one character from the set |
| \`[a-z]\` | one character from the range |
| \`[!abc]\` | one character *not* in the set |

None of them match a leading \`.\` — hidden files are hidden from globbing too, which is why \`rm *\` does not delete your dotfiles.

::quiz
---
question: What does \`ls report?.txt\` match?
options:
  - |-
    \`report1.txt\` and \`reportA.txt\`, but not \`report.txt\` or \`report10.txt\`
  - Any file starting with \`report\` and ending in \`.txt\`
  - Only files whose name is literally \`report?.txt\`
answer: 0
explanation: |-
  \`?\` means exactly one character — no more, no fewer. \`report.txt\` has zero characters there and \`report10.txt\` has two, so neither matches.
---
::

## Double quotes: keep it together, keep substitution

Double quotes stop word splitting and stop globbing. They leave \`$\` and backticks working.

\`\`\`
FILES="*.txt"
echo $FILES      # notes.txt report.txt   — glob happened after substitution
echo "$FILES"    # *.txt                  — glob suppressed
\`\`\`

This is the pair of quotes you want almost all of the time. It preserves the value exactly while still letting you interpolate.

## Single quotes: literally everything

Single quotes disable everything. No variables, no globs, no backticks, no escapes. The only character single quotes cannot contain is another single quote.

\`\`\`
echo "Cost: $5"     # Cost:      — $5 looks like a variable, and it's empty
echo 'Cost: $5'     # Cost: $5
\`\`\`

Use them when you mean the characters and nothing else: awk programs, sed expressions, regular expressions full of \`$\` and \`\\\`, passwords, JSON.

::quiz
---
question: |-
  You want to run \`grep 'error.*$' app.log\`. Why single quotes rather than double?
options:
  - |-
    In double quotes the shell would try to expand \`$'\` before grep ever saw the pattern
  - Double quotes cannot contain a \`.\` character
  - grep only accepts single-quoted patterns
answer: 0
explanation: The pattern is for grep to interpret, not the shell. Single quotes hand it through untouched. It's the same reason awk one-liners are always in single quotes — they're full of \`$1\`, \`$2\`, and the shell would happily eat all of them.
---
::

## Backslash: escape one character

A backslash quotes exactly the character after it.

\`\`\`
echo I owe you \\$5      # I owe you $5
echo one\\ word          # one word — the space is escaped, not a separator
touch my\\ file.txt      # creates one file called "my file.txt"
\`\`\`

At the end of a line, a backslash escapes the newline itself — which is how a long command is split across several lines:

\`\`\`
tar -czf backup.tar.gz \\
    --exclude=node_modules \\
    --exclude=.git \\
    ./site
\`\`\`

Nothing may follow that backslash, not even a space. A trailing space after \`\\\` escapes the *space*, the newline then ends the command, and you get a baffling error about a missing argument.

::fill-blank
---
prompt: |-
  Print the literal text \`Total: $100 (*)\` — every character exactly as written.
answer:
  - |-
    echo 'Total: $100 (*)'
  - |-
    printf 'Total: $100 (*)\\n'
hint: One kind of quote turns off every form of expansion at once.
placeholder: echo ...
---
::

::deep-dive{title="The order things happen in"}
The shell processes a line in a fixed sequence, and most confusing behaviour is really a surprise about the ordering:

1. **Quote removal is last**, not first — quotes are noted, then acted on at the end.
2. **Variable and command substitution** — \`$VAR\`, \`$(cmd)\`, and backticks are replaced by their values.
3. **Word splitting** — the *result* of step 2 is split on whitespace. This is why \`rm $FILE\` breaks and \`rm "$FILE"\` doesn't: the quotes were already noted in step 1, so step 3 skips that word.
4. **Globbing** — \`*\`, \`?\`, \`[...]\` are expanded against the filesystem. Again, on the result of substitution, which is why \`FILES="*.txt"; echo $FILES\` lists files.
5. The finished word list becomes the command and its arguments.

Two consequences worth remembering. A variable's value is never globbed *before* substitution, only after — so a \`*\` stored in a variable is live unless you quote the expansion. And the shell never re-runs this process on the result: a variable containing \`$OTHER\` expands to the literal characters \`$OTHER\`, not to the value of \`OTHER\`. The shell expands once, then stops.
::

Next up: exit status and \`test\` — how a script finds out whether the last thing it did actually worked.
`;export{e as default};
