const n=`Almost everything on a Linux system is configured with a text file and diagnosed with a text file. Reading them quickly is a genuine skill, and it starts with knowing which of four tools to reach for.

## Pick the right reader

**\`cat\`** dumps a whole file to the screen. Perfect for short files, terrible for long ones — a 5,000-line log will scroll past faster than you can read and leave you at the bottom.

\`\`\`
cat /etc/hostname
\`\`\`

<!-- slide -->

**\`less\`** opens a file in a pager you can scroll and search. This is the right default for anything you can't see in one screen.

\`\`\`
less /var/log/syslog
\`\`\`

Inside \`less\`: arrow keys or <kbd>Space</kbd> to scroll, \`/word\` to search forwards, \`n\` for the next match, \`G\` to jump to the end, \`g\` for the start, and **\`q\` to quit**. That last one matters — being stuck in a pager with no idea how to leave is a rite of passage nobody enjoys.

<!-- slide -->

**\`head\`** and **\`tail\`** show you the first or last ten lines:

\`\`\`
head -n 20 access.log     # first 20 lines
tail -n 50 access.log     # last 50 lines
\`\`\`

\`tail -f\` is the one you'll use most in real work. It shows the end of a file and then **keeps watching**, printing new lines as they're written:

\`\`\`
tail -f /var/log/nginx/error.log
\`\`\`

Leave that running in one window, reproduce your bug in another, and watch the error appear in real time. <kbd>Ctrl</kbd>+<kbd>C</kbd> stops it.

::terminal-teaser
---
lines:
  - cmd: head -n 3 /etc/passwd
    out: "root:x:0:0:root:/root:/bin/bash\\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\\nbin:x:2:2:bin:/bin:/usr/sbin/nologin"
  - cmd: tail -f /var/log/app.log
    out: "[09:14:22] server started\\n[09:14:31] GET /health 200\\n^C"
---
::

<!-- slide -->

::quiz
---
question: You need to watch a log file as new entries arrive while you reproduce a bug. Which command?
options:
  - tail -f logfile
  - cat logfile
  - head -f logfile
  - less logfile
answer: 0
explanation: "\`-f\` means follow. \`cat\` prints once and exits, \`less\` shows a snapshot you'd have to keep refreshing, and \`head -f\` isn't a thing."
---
::

## Editing without leaving the terminal

Sooner or later you'll need to change a config file on a machine that has no GUI. You have two realistic options.

### nano — the one to learn first

\`\`\`
nano config.txt
\`\`\`

\`nano\` behaves the way you expect a text editor to behave. Type to insert, arrow keys to move. The commands are listed along the bottom of the screen, where \`^\` means <kbd>Ctrl</kbd>:

- <kbd>Ctrl</kbd>+<kbd>O</kbd> — write out (save), then <kbd>Enter</kbd> to confirm the filename
- <kbd>Ctrl</kbd>+<kbd>X</kbd> — exit
- <kbd>Ctrl</kbd>+<kbd>K</kbd> — cut the current line

If nano is available, use it. There is no prize for suffering.

### vim — the one you'll eventually meet anyway

\`vim\` is on essentially every Unix machine ever built, including minimal containers and rescue images where nano isn't installed. You don't need to learn vim properly today. You need to not be trapped by it.

The one idea that makes vim make sense: it has **modes**. When it opens you are in *normal* mode, where keys are commands, not text. This is why typing "hello" into a fresh vim does something alarming instead of writing "hello".

The survival sequence:

1. Press <kbd>i</kbd> to enter **insert** mode. Now typing works normally.
2. Press <kbd>Esc</kbd> to return to **normal** mode.
3. Type \`:wq\` and <kbd>Enter</kbd> to write and quit.
4. Or type \`:q!\` and <kbd>Enter</kbd> to quit and throw away every change.

That's it. \`Esc\`, then \`:wq\` to save or \`:q!\` to bail. Those four keystrokes get you out of any vim session you didn't mean to start.

<!-- slide -->

::deep-dive{title="Why does \`:q!\` need the exclamation mark?"}
Because vim refuses to discard unsaved work quietly.

Plain \`:q\` means "quit". If the file has unsaved changes, vim declines and warns you. The \`!\` means "I know, do it anyway" — it's the same *force* idea as \`-f\` in \`rm -rf\` or \`cp -f\`.

The pattern shows up all over Unix: the safe version is the default, and you add something explicit to override the safety. Once you notice it, \`!\` and \`-f\` stop looking arbitrary.
::

::fill-blank
---
prompt: Show the last 100 lines of a file called \`access.log\`.
answer:
  - tail -n 100 access.log
  - tail -100 access.log
  - tail --lines=100 access.log
hint: The command is \`tail\`, and the option asks for a number of lines.
placeholder: tail ...
explanation: "\`tail -n 100\` is the portable spelling; the shorter \`tail -100\` works on most systems too."
---
::

::quiz
---
question: You've opened vim by accident and typed some junk. How do you leave without saving?
options:
  - Press Esc, then type :q! and Enter
  - Press Ctrl+C
  - Press Ctrl+X
  - Type quit and press Enter
answer: 0
explanation: "Esc gets you out of insert mode into normal mode, where \`:\` starts a command. \`q!\` quits and discards changes. Ctrl+C won't do it, and Ctrl+X is nano's key."
---
::

Next: permissions — the reason things say "Permission denied", and what \`rwx\` actually means.
`;export{n as default};
