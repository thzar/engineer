const e=`When you open a terminal, you are not talking to Linux. You are talking to a program that talks to Linux on your behalf. That program is called a **shell**.

This distinction sounds pedantic, but it explains almost everything that confuses beginners — why \`cd\` behaves differently from \`ls\`, why a command works in one terminal and not another, and why the error message you get is sometimes from the shell and sometimes from the program you tried to run.

## The terminal and the shell are different things

The **terminal** is the window. It draws text on your screen and collects your keystrokes. Historically it was a physical device — a keyboard and a screen wired to a computer somewhere else. The window on your desktop is emulating that hardware, which is why it's properly called a *terminal emulator*.

The **shell** is the program running inside that window. It reads what you type, works out what you meant, runs it, and prints the result. On most Linux systems the default shell is \`bash\`; on modern macOS it's \`zsh\`. They're different programs that happen to speak an almost identical language.

::terminal-teaser
---
lines:
  - cmd: echo $SHELL
    out: /bin/bash
  - cmd: whoami
    out: you
  - cmd: date
    out: Wed Aug 19 09:14:22 UTC 2026
---
::

## The read-evaluate-print loop

Everything a shell does fits in one sentence: it prints a prompt, waits for a line, runs it, and repeats.

That prompt — usually ending in \`$\` — is the shell telling you it is ready. When a command is running, the prompt disappears; when it comes back, the command has finished. Learning to read that rhythm is most of what "being comfortable at the terminal" means.

When you type a line and press enter, the shell splits it into words. The first word is the **command**. Everything after it is an **argument**:

\`\`\`
ls -l /etc
│  │   │
│  │   └── argument: which directory to list
│  └────── option (also an argument, but it modifies behaviour)
└───────── command: the program to run
\`\`\`

The shell then looks for a program with that name, hands it the arguments, and gets out of the way. The output you see is usually printed by the *program*, not the shell.

::quiz
---
question: You type \`cat notes.txt\` and see "No such file or directory". Who printed that message?
options:
  - The \`cat\` program, because it was the thing that tried and failed to open the file
  - The shell, because it checks that files exist before running anything
  - The Linux kernel, printing directly to your screen
answer: 0
explanation: The shell only found and launched \`cat\`. It doesn't know or care what arguments mean. \`cat\` took "notes.txt", asked the kernel to open it, was told it doesn't exist, and printed the complaint itself.
---
::

## Where commands come from

Most commands are just files on disk. \`ls\` is a real program sitting at \`/usr/bin/ls\`. When you type \`ls\`, the shell searches a list of directories for something by that name, and runs the first match it finds.

That list lives in a variable called \`PATH\`. You can see it:

\`\`\`
echo $PATH
/usr/local/bin:/usr/bin:/bin:/usr/local/games
\`\`\`

The colons separate directories. The shell checks them left to right. This is why "command not found" almost never means the program is missing — it usually means it exists somewhere that isn't on your \`PATH\`.

::deep-dive{title="So why is \`cd\` different?"}
Because \`cd\` is not a file anywhere. It's built into the shell itself.

It has to be. Changing directory changes the state of the shell process. If \`cd\` were a separate program, it would change *its own* directory, then exit — leaving the shell exactly where it started. A handful of commands work this way for the same reason: \`cd\`, \`export\`, \`exit\`, and a few others are called **builtins**.

You can check which is which with \`type\`:

\`\`\`
type ls
ls is /usr/bin/ls

type cd
cd is a shell builtin
\`\`\`
::

## Why this is worth your time

You can use a computer for years without touching a shell. But every server you will ever ssh into, every Docker container you will ever debug, and every CI pipeline you will ever fix is a text interface with no GUI available. The command line isn't nostalgia — it's the only interface that exists in the places software actually runs.

It is also the fastest one. A GUI can only offer what someone designed a button for. A shell lets you combine small programs in ways nobody anticipated, which is what the last lesson of this course is about.

::quiz
---
question: What does \`PATH\` actually contain?
options:
  - A list of directories the shell searches for programs
  - A list of every command installed on the system
  - The directory you are currently in
answer: 0
explanation: It's a colon-separated list of directories, searched left to right. The first matching program wins — which is also how you can shadow a system command with your own version.
---
::

Next up: moving around the filesystem, which is where almost all your time at the prompt is spent.
`;export{e as default};
