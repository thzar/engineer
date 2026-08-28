const e=`You already know how to run commands one at a time. A **script** is nothing more than a file containing the commands you would have typed, run by the same shell that would have run them interactively.

That is the whole idea, and it is worth taking seriously — because it means there is no separate "scripting language" to learn. Everything you already type at the prompt is valid in a script, and almost everything in a script is valid at the prompt. What follows is mostly a tour of the parts you *wouldn't* type by hand.

## A script is a file the shell reads

Make one. Three lines is enough for a real script:

\`\`\`
#!/bin/sh
# Say hello and get out of the way.
echo "Hello from a script"
\`\`\`

Save it as \`hello.sh\`. Now make it executable and run it:

::terminal-teaser
---
lines:
  - cmd: chmod +x hello.sh
    out: ""
  - cmd: ./hello.sh
    out: Hello from a script
  - cmd: sh hello.sh
    out: Hello from a script
---
::

Two things there are worth pulling apart: why \`chmod +x\`, and why \`./\`.

## Why \`chmod +x\`, and why \`./\`

A file is only runnable if the **executable bit** is set on it. Creating a file with an editor doesn't set that bit — text files aren't programs by default, which is a good thing. \`chmod +x hello.sh\` sets it. For a script the readable bit matters too: the shell has to *read* the file to run it, unlike a compiled binary which the kernel loads directly.

The \`./\` is the other half. When you type a bare \`hello.sh\`, the shell searches \`PATH\` for it — and the current directory is not on \`PATH\` on any sane system, precisely so that a file called \`ls\` sitting in a directory you happened to \`cd\` into cannot hijack the real one. \`./hello.sh\` is you saying "this exact file, in this directory", which skips the search entirely.

::quiz
---
question: You run \`./deploy.sh\` and get "Permission denied". What is the most likely cause?
options:
  - The executable bit isn't set on the file
  - The script contains a command you're not allowed to run
  - The file is in a directory that isn't on your \`PATH\`
answer: 0
explanation: |-
  "Permission denied" here is about the file itself, not its contents — the shell never got as far as reading a single line. \`chmod +x deploy.sh\`. A \`PATH\` problem would say "command not found" instead, and a forbidden command inside the script would fail later, after the script had already started.
---
::

## The shebang line

That first line — \`#!/bin/sh\` — is called the **shebang**, and it is the one piece of syntax that isn't just a command you could have typed.

To the shell it looks like a comment, because \`#\` starts a comment. But it isn't read by the shell at all. It is read by the *kernel*, at the moment you execute the file. The kernel looks at the first two bytes; if they are \`#!\`, it treats the rest of the line as the path to an interpreter, and runs **that** program with your file as its argument.

So \`./hello.sh\` really becomes \`/bin/sh ./hello.sh\`. This is why the shebang must be the very first line, and why it must be an absolute path — the kernel does no searching.

::deep-dive{title="\`#!/bin/sh\` or \`#!/bin/bash\`?"}
This course writes \`#!/bin/sh\`, and that is a deliberate constraint rather than nostalgia.

\`/bin/sh\` promises a POSIX shell — the common subset every Unix has agreed on. On Debian and Ubuntu it is actually \`dash\`, a small fast shell. On Alpine it is \`busybox ash\`. On many systems it is \`bash\` pretending to be \`sh\`.

\`#!/bin/bash\` gets you a much richer language: arrays, \`[[ ]]\`, \`local\`, string manipulation. It also gets you a script that dies immediately in an Alpine container, a BusyBox initramfs, or a minimal CI image — all places where scripts actually run and where \`bash\` frequently isn't installed.

The rule worth internalising: **write \`sh\` for anything that has to be portable, and write \`bash\` deliberately, not by accident.** A script that declares \`#!/bin/sh\` and then uses a bash-only feature is the worst of both, because it only breaks on the machine you didn't test on.

Everything in this course runs under a plain POSIX \`sh\`.
::

## Comments and the shape of a real script

Anything from a \`#\` to the end of the line is ignored — except that shebang, and except inside quotes.

\`\`\`
# A full-line comment.
echo "Deploying"   # ...and a trailing one.
echo "The # here is inside quotes, so it prints"
\`\`\`

Real scripts tend to grow the same skeleton: shebang, a comment saying what the thing does, then the work.

\`\`\`
#!/bin/sh
#
# backup.sh — copy the site content to the backup volume.
# Run nightly from cron.

echo "Starting backup at $(date)"
cp -r /var/www/site /mnt/backup/
echo "Done"
\`\`\`

::fill-blank
---
prompt: Make the file \`deploy.sh\` executable.
answer:
  - chmod +x deploy.sh
  - chmod u+x deploy.sh
  - chmod 755 deploy.sh
  - chmod a+x deploy.sh
  - chmod ugo+x deploy.sh
hint: The command sets a permission bit, and the bit is the executable one.
placeholder: chmod ...
---
::

## Two ways to run it, and why the difference matters

You have now seen both:

\`\`\`
./hello.sh      # execute the file — kernel reads the shebang, starts a new shell
sh hello.sh     # hand the file to sh yourself — shebang ignored entirely
\`\`\`

There is a third, and it behaves differently enough to be worth knowing now:

\`\`\`
. ./hello.sh    # "source" it — run the lines in the CURRENT shell
\`\`\`

The first two start a **new shell process**. Variables it sets, directories it changes into, all of it vanishes when the script exits. That is why you cannot write a script that changes your shell's directory — the same reason \`cd\` has to be a builtin.

Sourcing runs the lines in the shell you're already sitting in, which is how \`.bashrc\` and \`.profile\` work, and how scripts that are meant to set up your environment are used.

::quiz
---
question: A script contains \`cd /var/log\`. You run it with \`./go.sh\`. Where is your shell afterwards?
options:
  - Exactly where it was — the \`cd\` happened in a different process
  - In \`/var/log\`
  - It depends on whether the script exits successfully
answer: 0
explanation: |-
  \`./go.sh\` starts a new shell. That child shell changes its own directory, then exits, taking the change with it. Run it as \`. ./go.sh\` and the \`cd\` happens in your shell instead.
---
::

Next up: variables — how to hold on to a value, and the two rules about spaces and quotes that cause more broken scripts than anything else in the shell.
`;export{e as default};
