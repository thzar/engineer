const e=`You can now find your way around. This lesson is about changing things — making files and folders, copying them, moving them, and deleting them.

One of these operations is permanent. We'll get to that.

## Making things

\`touch\` creates an empty file (or, if it already exists, quietly updates its timestamp without touching the contents):

\`\`\`
touch notes.txt
\`\`\`

\`mkdir\` creates a directory:

\`\`\`
mkdir projects
\`\`\`

\`mkdir\` fails if the parent doesn't exist. \`mkdir -p\` creates the whole chain, and doesn't complain if some of it is already there:

\`\`\`
mkdir -p projects/website/src
\`\`\`

That \`-p\` is why you'll see \`mkdir -p\` in nearly every setup script ever written — it's safe to run twice, which is a property worth wanting in anything automated.

::terminal-teaser
---
lines:
  - cmd: mkdir -p site/css
  - cmd: touch site/index.html site/css/main.css
  - cmd: ls -R site
    out: "site:\\ncss  index.html\\n\\nsite/css:\\nmain.css"
---
::

Notice \`touch\` took two arguments and made two files. Most commands accept as many as you give them.

## Copying and moving

\`cp\` copies, \`mv\` moves. Both take the source first and the destination second:

\`\`\`
cp notes.txt notes-backup.txt
mv notes.txt archive/
\`\`\`

Two things trip people up:

**Copying a directory needs \`-r\`.** By default \`cp\` refuses to copy a folder, because copying a tree is a different and much larger operation than copying one file. \`-r\` (recursive) says "yes, the whole thing":

\`\`\`
cp -r site/ site-backup/
\`\`\`

**\`mv\` is also how you rename.** There is no \`rename\` command in the way you'd expect. Moving a file to a new name in the same directory *is* a rename:

\`\`\`
mv draft.txt final.txt
\`\`\`

That's not a hack — it's the same operation. A file's name is just an entry in a directory, so changing the name and changing the directory are the same kind of change.

::quiz
---
question: "You run \`mv report.txt reports/\`. The \`reports\` directory does not exist. What happens?"
options:
  - report.txt is renamed to a file called "reports"
  - The command fails and report.txt is untouched
  - A reports directory is created and the file moved into it
answer: 1
explanation: "The trailing slash is the safety net — it tells \`mv\` you mean a directory. Without the slash, \`mv report.txt reports\` would silently rename the file to \`reports\`, which is one of the classic ways to lose track of something. Get in the habit of the trailing slash."
---
::

## Deleting, and the thing nobody warns you about

\`rm\` removes files. \`rm -r\` removes directories and everything inside them.

\`\`\`
rm notes.txt
rm -r old-project/
\`\`\`

Here is the part that matters: **there is no trash can.** \`rm\` does not move things aside for later recovery. It unlinks them, and the space becomes available for reuse. On a normal filesystem with no backups, a deleted file is gone.

This is not a flaw. The command line assumes you meant what you said. But it means a typo in an \`rm\` command is in a different category of mistake than a typo anywhere else.

Two habits that will save you:

1. **Run \`ls\` with the same argument first.** If \`ls old-*\` lists what you expect, then \`rm -r old-*\` will delete what you expect. If it lists something surprising, you just avoided a bad afternoon.
2. **Use \`rm -i\` when deleting with wildcards.** It asks before each file. Tedious, and worth it when the pattern is doing the choosing rather than you.

<!-- slide -->

::deep-dive{title="About \`rm -rf /\` and why you'll see it in jokes"}
\`rm -rf /\` means "recursively, forcibly, delete everything starting from the root of the filesystem." It is the canonical example of a catastrophic command, and it shows up constantly in developer humour.

Modern \`rm\` implementations refuse this specific command unless you add \`--no-preserve-root\`, so the exact joke version is defanged. What is *not* defanged is the near-miss family — a stray space or an unset variable turning a targeted delete into a total one:

\`\`\`
rm -rf /home/you/projects /old      # the space before /old was a typo
rm -rf "$DIR"/                      # deletes / if DIR was never set
\`\`\`

That second one has taken down real production systems. It's the reason careful scripts check their variables before deleting anything.

The lesson isn't "be scared of \`rm\`". It's that \`rm\` does exactly what you typed, so what you typed had better be what you meant.
::

<!-- slide -->

::fill-blank
---
prompt: Copy the whole \`site\` directory to a new directory called \`site-backup\`.
answer:
  - cp -r site site-backup
  - cp -r site/ site-backup
  - cp -r site/ site-backup/
  - cp -r site site-backup/
hint: Copying a directory needs the recursive option.
placeholder: cp ...
explanation: Without \`-r\`, cp refuses and tells you it's omitting a directory.
---
::

::quiz
---
question: Which of these is the safest habit before running a delete with a wildcard?
options:
  - Run the same wildcard through \`ls\` first to see what it matches
  - Run it with sudo so it definitely works
  - Run it twice to be sure it took effect
answer: 0
explanation: "The wildcard is expanded by the shell before \`rm\` ever sees it, so \`ls\` with the same pattern shows you the exact list \`rm\` would receive. It's a free preview of a destructive command."
---
::

Next: actually reading what's inside these files.
`;export{e as default};
