const e=`Every process starts with three files already open: **standard input** (0), **standard output** (1), and **standard error** (2). Redirection is how a script rewires them — and getting it right is the difference between a cron job that tells you what went wrong and one that fails in silence.

## The three streams

- **stdin (0)** — where a program reads from. The keyboard, by default.
- **stdout (1)** — where its results go. Your terminal, by default.
- **stderr (2)** — where its complaints go. Also your terminal, by default.

That last one is the point of the design. Output and errors go to the same place interactively, so you see both — but they are separate channels, so a pipeline can process the results while the errors still reach a human.

::terminal-teaser
---
lines:
  - cmd: ls /etc /nope
    out: |-
      ls: cannot access '/nope': No such file or directory
      /etc:
      hostname  passwd  hosts
  - cmd: ls /etc /nope > out.txt
    out: |-
      ls: cannot access '/nope': No such file or directory
  - cmd: ls /etc /nope 2> err.txt
    out: |-
      /etc:
      hostname  passwd  hosts
---
::

The second command sent results to a file and left the error on screen. The third did the opposite. Nothing was lost either time — the streams simply went to different places.

## Writing output to a file

\`\`\`
echo "hello" > file.txt      # create or TRUNCATE, then write
echo "world" >> file.txt     # append
\`\`\`

\`>\` destroys the existing contents before writing a single byte. \`>>\` adds to the end. The number of build scripts that have clobbered a config file by writing \`>\` where they meant \`>>\` is not small.

Redirecting a specific stream means naming its number:

\`\`\`
command 1> out.txt      # same as > out.txt
command 2> err.txt      # errors only
command 2>> err.txt     # append errors
\`\`\`

## \`2>&1\`, and why the order matters

To send errors to the same place as output:

\`\`\`
command > log.txt 2>&1
\`\`\`

Read \`2>&1\` as "make file descriptor 2 point at whatever 1 currently points at". Which is why this is **not** the same:

\`\`\`
command 2>&1 > log.txt
\`\`\`

Redirections are processed left to right. In the broken version, \`2\` is pointed at the terminal (where \`1\` still points at that moment), and only *then* is \`1\` moved to the file. The result is output in the file and errors still on screen — the opposite of the intent.

The rule: **redirect stdout first, then duplicate onto it.**

::quiz
---
question: |-
  A cron job runs \`backup.sh 2>&1 > /var/log/backup.log\` and the log is empty of errors even when it fails. Why?
options:
  - |-
    \`2>&1\` copied the terminal destination before \`>\` moved stdout to the file
  - Cron discards stderr regardless of redirection
  - |-
    \`2>&1\` must come first to work at all
answer: 0
explanation: Redirections apply in order. At the moment \`2>&1\` runs, stdout still points at the original destination, so stderr is aimed there — and moving stdout afterwards does not drag stderr along. Write \`> /var/log/backup.log 2>&1\`.
---
::

## \`/dev/null\`

A special file that discards everything written to it and is instantly empty when read.

\`\`\`
command > /dev/null           # discard normal output, keep errors visible
command 2> /dev/null          # discard errors, keep output
command > /dev/null 2>&1      # silence entirely
\`\`\`

The first form is the one to reach for by default. Silencing a command completely, as in the third, is how a script ends up failing without telling anyone — worth doing deliberately, not out of habit.

::fill-blank
---
prompt: Run \`apt-get update\`, sending both its normal output and its errors to \`/var/log/update.log\`.
answer:
  - apt-get update > /var/log/update.log 2>&1
  - apt-get update >/var/log/update.log 2>&1
hint: Move stdout to the file first, then point stderr at the same place.
placeholder: apt-get update ...
---
::

## Reading input from a file

\`\`\`
while read -r LINE; do echo "$LINE"; done < hosts.txt
sort < unsorted.txt > sorted.txt
\`\`\`

\`<\` connects a file to standard input. It is why the loop from the loops lesson takes its data at \`done < hosts.txt\` — the redirect applies to the whole compound command.

## Here-documents

A **here-document** feeds a literal block of text to a command's standard input, and it is the cleanest way to emit multi-line output from a script:

\`\`\`
cat <<EOF
Usage: $(basename "$0") [options] HOST

  -v    verbose
  -h    this message
EOF
\`\`\`

Everything between the \`<<EOF\` line and a line consisting of exactly \`EOF\` becomes the input. The word is arbitrary — \`EOF\` is convention, not syntax.

By default a here-document expands variables and command substitutions, exactly like double quotes. **Quote the delimiter to turn that off**, which you want whenever the text is a script, a config file, or anything containing a literal \`$\`:

\`\`\`
cat <<'EOF' > /etc/cron.d/backup
0 3 * * * root /opt/bin/backup.sh >> $LOGFILE 2>&1
EOF
\`\`\`

With \`'EOF'\` quoted, \`$LOGFILE\` lands in the crontab as the four characters that cron will later expand. Without the quotes, the shell would have expanded it while writing the file — probably to nothing.

::quiz
---
question: |-
  What is the difference between \`cat <<EOF\` and \`cat <<'EOF'\`?
options:
  - The quoted form passes the text through literally; the unquoted form expands variables and \`$( )\` first
  - The quoted form allows blank lines in the body
  - There is none; the quotes are a style choice
answer: 0
explanation: Unquoted behaves like double quotes, quoted behaves like single quotes — the same distinction as everywhere else in the shell. When you're generating a file that contains its own \`$variables\`, you almost always want the quoted form.
---
::

::deep-dive{title="\`<<-\`, \`tee\`, and redirecting the whole script"}
**Indented here-documents.** A here-doc's terminator must be at the start of the line, which looks wrong inside an indented function. \`<<-\` strips *leading tabs* (tabs only, not spaces) from every line, terminator included:

\`\`\`
deploy() {
	cat <<-EOF
		Deploying to $HOST
		Started at $(date)
	EOF
}
\`\`\`

**\`tee\` — write and pass through.** When output needs to go to a file *and* onward:

\`\`\`
make 2>&1 | tee build.log        # watch it scroll and keep a copy
make 2>&1 | tee -a build.log     # append rather than truncate
\`\`\`

**Redirecting the entire script.** \`exec\` without a command changes the current shell's own descriptors, and everything after it is affected:

\`\`\`
#!/bin/sh
exec >> /var/log/myjob.log 2>&1

echo "Started at $(date)"     # goes to the log, not the terminal
\`\`\`

Three lines at the top of a cron script and every \`echo\` in it becomes a log entry, with no redirection on the crontab line and no way to forget one. It also captures output from programs the script calls, which a per-command redirect would miss.
::

## Why this matters most in cron

A command run from cron has no terminal. Anything it writes to stdout or stderr is mailed to the account — if local mail is configured, which on a modern server it usually is not. Which means the default behaviour of an unredirected cron job is: **output is generated, then silently thrown away.**

So a job that has been failing for six weeks looks identical to one that has been working. The fix is one line:

\`\`\`
0 3 * * * /opt/bin/backup.sh >> /var/log/backup.log 2>&1
\`\`\`

or the \`exec\` form inside the script itself, which is better because it cannot be forgotten by whoever edits the crontab next.

Next up: the last lesson — the handful of habits that separate a script that works on your machine from one you're willing to run unattended.
`;export{e as default};
