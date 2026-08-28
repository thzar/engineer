const e=`In the first lesson I said the shell lets you combine small programs in ways nobody anticipated. This is that lesson.

Everything so far has been individual commands. What makes the command line genuinely powerful — more powerful than any GUI, for a large class of problems — is that its programs are designed to be connected.

## Three streams

Every process starts with three channels already open:

- **stdin** (0) — where input comes from. Usually your keyboard.
- **stdout** (1) — where normal output goes. Usually your screen.
- **stderr** (2) — where error messages go. Also usually your screen.

The screen is just the *default*. Every one of these can be pointed somewhere else, and that's all redirection is.

The split between stdout and stderr is deliberate and useful: it means you can capture a program's results while still seeing its complaints, because they travel on separate channels even though they land in the same place by default.

## Redirecting to files

\`\`\`
ls > files.txt          # stdout into a file, replacing its contents
ls >> files.txt         # stdout appended to the end instead
\`\`\`

The difference between \`>\` and \`>>\` is worth burning in: **\`>\` truncates the file first.** Pointing \`>\` at something that already has contents destroys them, instantly, with no warning. It's the second-most common way people lose work at a terminal, after \`rm\`.

Errors need their own redirect, because they're on channel 2:

\`\`\`
./script.sh 2> errors.txt         # errors to a file, output still on screen
./script.sh > out.txt 2>&1        # both into one file
./script.sh &> everything.txt     # shorthand for the same thing (bash)
\`\`\`

That \`2>&1\` reads as "send channel 2 to wherever channel 1 is currently going". It looks cryptic and it's worth recognising, because it appears in nearly every cron job and CI script you'll ever read.

And input can come from a file instead of the keyboard:

\`\`\`
sort < names.txt
\`\`\`

::quiz
---
question: "You run \`echo hello > notes.txt\`, but notes.txt already contained a week of work. What happened to it?"
options:
  - It was truncated — the old contents are gone and the file now holds one line
  - The new line was added to the end
  - The command failed because the file already existed
answer: 0
explanation: "\`>\` truncates before writing. \`>>\` is the one that appends. This is why the habit of typing \`>>\` unless you specifically mean to replace is worth building."
---
::

## The pipe

\`>\` sends output to a file. The pipe, \`|\`, sends it to **another program's input**:

\`\`\`
ps aux | grep node
\`\`\`

\`ps aux\` writes a long list to stdout. Instead of your screen, that list becomes \`grep\`'s stdin. \`grep\` reads it, keeps only lines matching "node", and writes those to *its* stdout — which is your screen.

Neither program knows the other exists. \`ps\` doesn't know it's being filtered; \`grep\` doesn't know where the text came from. That independence is the whole design, and it's why pipes compose without limit:

\`\`\`
cat access.log | grep " 500 " | wc -l
\`\`\`

Read left to right: take the log, keep only lines containing a 500 status, count them. Three simple tools answering a question none of them was written for.

::terminal-teaser
---
lines:
  - cmd: "cat access.log | grep \\" 500 \\" | wc -l"
    out: "27"
  - cmd: "cat access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -3"
    out: "   412 10.0.0.7\\n   288 10.0.0.31\\n   106 10.0.0.4"
---
::

That second one finds the three IP addresses hitting your server hardest: take each line's first field, sort them, count each unique value, sort those counts numerically in reverse, show the top three. Six tools, one line, no script, no program written.

## The pieces worth knowing

A small vocabulary covers most real pipelines:

- \`grep pattern\` — keep matching lines (\`-v\` inverts it, \`-i\` ignores case, \`-c\` counts)
- \`wc -l\` — count lines
- \`sort\` — sort lines (\`-n\` numerically, \`-r\` reversed)
- \`uniq -c\` — collapse adjacent duplicates and count them (needs sorted input)
- \`head\` / \`tail\` — first or last N lines
- \`cut -d, -f2\` — pull out a field by delimiter
- \`awk '{print $1}'\` — pull out a column by position

<!-- slide -->

::fill-blank
---
prompt: Count how many lines in \`access.log\` contain the word "error".
answer:
  - grep error access.log | wc -l
  - grep -c error access.log
  - cat access.log | grep error | wc -l
  - grep "error" access.log | wc -l
hint: Filter the file with grep, then count the surviving lines.
placeholder: grep ...
explanation: "\`grep error access.log | wc -l\` is the classic pipeline. \`grep -c error access.log\` does it in one step — both are right, and knowing the pipeline version matters more because it generalises."
---
::

<!-- slide -->

::deep-dive{title="Why this design won"}
In 1978 Doug McIlroy wrote down the Unix philosophy as: write programs that do one thing well, and write programs to work together on text streams.

The bet was that a small set of sharp tools plus a way to connect them beats a large set of feature-rich ones. Nearly fifty years later that bet keeps paying: the pipeline above analysing a web server log was composed from programs written decades before web servers existed, by people who had no idea what they'd eventually be used for.

That's the real reason to learn this. Not because the commands are hard — they aren't — but because once you think in pipelines, a whole class of problems stops requiring you to write a program at all.
::

::quiz
---
question: "In \`ps aux | grep node\`, what is grep reading from?"
options:
  - The stdout of \`ps aux\`, connected to grep's stdin by the pipe
  - A temporary file that ps wrote first
  - The terminal, after ps finished printing to it
answer: 0
explanation: "The pipe connects one program's stdout directly to the next one's stdin — no temp file, and the data flows while both are running. Neither program knows anything about the other."
---
::

## Where this goes next

You now have the model the rest of Linux is built on — a filesystem tree, permissions, processes, and streams you can wire together.

The natural next step is to stop typing these one at a time and start saving them: shell scripts, variables, loops, and conditionals. After that, containers — because a Docker container is, at bottom, a process with its own view of the filesystem, and everything in this course applies directly.

That's what the next courses cover.
`;export{e as default};
