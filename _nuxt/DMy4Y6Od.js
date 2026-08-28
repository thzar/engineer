const e=`Linux has no drive letters. There is no \`C:\`. Everything — every disk, every USB stick, every device, every file — hangs off a single tree that starts at \`/\`, called the **root**.

Getting comfortable at the command line is mostly getting comfortable moving around this tree without looking at it.

## Three commands do almost everything

\`pwd\` tells you where you are. \`ls\` shows you what's here. \`cd\` moves you somewhere else. That's the loop, and you'll run it thousands of times.

::terminal-teaser
---
lines:
  - cmd: pwd
    out: /home/you
  - cmd: ls
    out: "Desktop  Documents  Downloads  notes.txt  projects"
  - cmd: cd projects
  - cmd: pwd
    out: /home/you/projects
---
::

Notice the third command printed nothing. That's not a failure — it's the Unix convention that **silence means success**. Commands that worked usually say nothing at all. If you wanted reassurance, you'd have to ask for it with \`pwd\`.

## Absolute and relative paths

A path starting with \`/\` is **absolute** — it's measured from the root of the tree, so it means the same thing no matter where you are:

\`\`\`
cd /var/log
\`\`\`

A path not starting with \`/\` is **relative** — it's measured from wherever you currently are:

\`\`\`
cd projects/website
\`\`\`

Relative paths are shorter to type and are what you'll use most. Absolute paths are unambiguous and are what you'll use in scripts, where "wherever you currently are" isn't something you can rely on.

There are four shorthands worth memorising today:

- \`.\` — the current directory
- \`..\` — the parent directory (one level up)
- \`~\` — your home directory, e.g. \`/home/you\`
- \`-\` — the directory you were in *before* the last \`cd\`, which makes \`cd -\` a toggle between two places

::quiz
---
question: "You are in /home/you/projects/website. Where does \`cd ../..\` put you?"
options:
  - /home/you
  - /home/you/projects
  - /home
  - The root directory, /
answer: 0
explanation: "Each \`..\` climbs one level. From /home/you/projects/website, the first takes you to projects, the second to /home/you."
---
::

## Reading \`ls\` properly

Bare \`ls\` gives you names. The options are where it gets useful:

\`\`\`
ls -l     # long format: permissions, owner, size, modified date
ls -a     # include hidden files (anything starting with a dot)
ls -lh    # long format, human-readable sizes (4.0K instead of 4096)
ls -lt    # sort by modification time, newest first
\`\`\`

Options can be combined, so \`ls -lah\` is the same as \`ls -l -a -h\` and is worth building into muscle memory.

"Hidden" files aren't secure or special — the rule is literally just *"the name starts with a dot"*. It's a convention to keep config files (\`.bashrc\`, \`.gitignore\`, \`.env\`) out of your way. \`ls -a\` reveals them.

::fill-blank
---
prompt: List everything in the current directory, including hidden files, in long format with readable sizes.
answer:
  - ls -lah
  - ls -alh
  - ls -lha
  - ls -hla
  - ls -ahl
  - ls -hal
hint: You need three options — long, all, human-readable. Their order doesn't matter.
placeholder: ls ...
explanation: Any order works. \`ls -lah\` is the one most people's fingers learn.
---
::

## Let the shell type for you

Press **Tab** while typing a path and the shell will complete it. Press it twice and it shows you every possibility.

This is not a nicety. Tab completion is the difference between the command line feeling slow and feeling fast, and it doubles as a correctness check — if Tab won't complete what you're typing, the thing you're referring to probably doesn't exist. Experienced people almost never type a full path.

<!-- slide -->

::deep-dive{title="Directories worth recognising"}
You don't need to memorise the filesystem, but recognising these saves a lot of confusion:

- \`/home/you\` — your stuff. Also written \`~\`.
- \`/etc\` — system-wide configuration files. Text, all of it.
- \`/var/log\` — logs. The first place to look when something is broken.
- \`/usr/bin\` — most of the programs you run.
- \`/tmp\` — scratch space, wiped on reboot.
- \`/opt\` — optional or third-party software.

The pattern to notice is that configuration is text in \`/etc\`, and diagnostics are text in \`/var/log\`. This is why the command line remains the fastest way to debug a Linux machine — the answers are all in files you can read.
::

::quiz
---
question: What makes a file "hidden" in Linux?
options:
  - Its name begins with a dot
  - A hidden attribute is set on it
  - It lives in a system directory
  - Its permissions exclude your user
answer: 0
explanation: "That's the entire rule. \`ls\` skips dot-prefixed names unless you pass \`-a\`. It is a convention, not a security feature."
---
::

Next: creating, moving, and deleting things — including the one command that has no undo.
`;export{e as default};
