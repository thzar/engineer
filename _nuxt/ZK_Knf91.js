const n=`Every running program on a Linux machine is a **process**, and every process has a number — its PID. Almost all operational work comes down to three questions: what's running, what is it doing, and how do I make it stop.

## Seeing what's running

\`ps\` lists processes. On its own it shows only yours, in the current terminal, which is rarely what you want. The incantation people actually use is:

\`\`\`
ps aux
\`\`\`

Which reads as: **a**ll users' processes, **u**ser-readable format, including processes with no controlling terminal (**x**) — that last one matters because it's how background services show up.

\`\`\`
USER   PID  %CPU  %MEM  COMMAND
root     1   0.0   0.1  /sbin/init
you   2481   0.3   2.1  /usr/bin/node server.js
you   3120  98.7   0.4  ./stuck-script.sh
\`\`\`

PID 1 is always the init system — the first process started at boot, and the ancestor of everything else.

\`top\` shows the same information but live, sorted by CPU use, refreshing every second or two. \`q\` quits it. If \`htop\` is installed, it's the nicer version — colour, scrolling, and you can kill processes from inside it.

::terminal-teaser
---
lines:
  - cmd: ps aux | grep node
    out: "you   2481  0.3  2.1  /usr/bin/node server.js"
  - cmd: kill 2481
  - cmd: ps aux | grep node
    out: ""
---
::

That first command is a preview of the next lesson — \`ps aux\` produced a long list, and \`grep node\` kept only the lines mentioning node. Combining two small tools like that is the whole point of the command line.

## Stopping things

\`kill\` sends a **signal** to a process. Despite the name, it's a general "send a message" command, and the default message is a polite one:

\`\`\`
kill 2481
\`\`\`

That sends \`SIGTERM\` — *please shut down*. A well-behaved program catches it, finishes what it's writing, closes its files, and exits cleanly. This is what you want almost always.

When a process ignores that — genuinely hung, or stuck in a loop that never checks for signals — you escalate:

\`\`\`
kill -9 2481
\`\`\`

\`-9\` is \`SIGKILL\`, and it's different in kind: the process never sees it. The kernel simply stops scheduling it and reclaims its memory. There's no cleanup, no flushing buffers, no closing files. A database killed this way can leave a corrupted file behind.

So the rule is: **\`kill\` first, \`kill -9\` only when it doesn't work.** Reaching for \`-9\` reflexively is the same mistake as reaching for \`sudo\` reflexively.

<!-- slide -->

::quiz
---
question: Why should \`kill -9\` be a last resort rather than a first move?
options:
  - The process is terminated immediately with no chance to save state or clean up
  - It requires root permissions that normal users don't have
  - It kills every process owned by the same user
answer: 0
explanation: "SIGKILL can't be caught or handled — the kernel just stops the process. Anything half-written stays half-written. Plain \`kill\` gives the program a chance to exit properly, which is why it's the default."
---
::

::fill-blank
---
prompt: Send the default termination signal to the process with PID 4102.
answer:
  - kill 4102
  - kill -15 4102
  - kill -TERM 4102
  - kill -SIGTERM 4102
hint: The plain form of the command is the polite one — no options needed.
placeholder: kill ...
explanation: "Plain \`kill\` sends signal 15 (SIGTERM), so \`kill 4102\` and \`kill -15 4102\` are identical."
---
::

## Foreground, background, and the two Ctrl keys

When you run something, it takes over your terminal — you don't get a prompt back until it finishes. That's the **foreground**.

Adding \`&\` starts it in the **background** instead, and hands you the prompt immediately:

\`\`\`
./long-running-job.sh &
\`\`\`

Two keyboard shortcuts control this, and confusing them is common:

- <kbd>Ctrl</kbd>+<kbd>C</kbd> — **stop** the foreground process. This sends SIGINT, asking it to quit.
- <kbd>Ctrl</kbd>+<kbd>Z</kbd> — **suspend** it. The process is paused, not stopped, and is still sitting there consuming memory.

After <kbd>Ctrl</kbd>+<kbd>Z</kbd>, three commands manage what you've suspended:

\`\`\`
jobs     # list suspended and background jobs in this shell
fg       # bring the most recent one back to the foreground
bg       # let it continue, but in the background
\`\`\`

This is worth knowing because it explains a common confusion: you press <kbd>Ctrl</kbd>+<kbd>Z</kbd> expecting to quit something, get your prompt back, assume it's gone — and it's still running, or rather still *paused*, until you close the terminal.

<!-- slide -->

::deep-dive{title="Finding a PID when you only know the name"}
You rarely know a PID off the top of your head. Two ways to find one:

\`\`\`
pgrep -f "server.js"        # print PIDs matching a pattern
ps aux | grep server.js     # the older, more manual version
\`\`\`

And you can skip the lookup entirely with \`pkill\`, which matches by name and signals everything that matches:

\`\`\`
pkill -f "server.js"
\`\`\`

Be careful with \`pkill\` and broad patterns — it will happily match more than you intended. As with \`rm\`, run the \`pgrep\` version first to see the list, *then* signal it.
::

::quiz
---
question: You press Ctrl+Z on a running command and get your prompt back. What happened to the process?
options:
  - It's suspended — still in memory, paused, and can be resumed with fg
  - It was terminated cleanly
  - It moved to the background and is still doing work
answer: 0
explanation: "Ctrl+Z suspends rather than stops. \`jobs\` will show it, \`fg\` resumes it in the foreground, and \`bg\` lets it carry on in the background. Ctrl+C is the one that actually asks it to quit."
---
::

Next: the last lesson, and the idea that makes everything so far worth learning.
`;export{n as default};
