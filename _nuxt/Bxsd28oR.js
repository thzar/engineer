const e=`"Permission denied" is the error every beginner hits and most people learn to route around by typing \`sudo\` until it works. That habit will eventually cost you something. Permissions are a small, entirely learnable system — about fifteen minutes of theory that pays off forever.

## Reading the output of \`ls -l\`

Run \`ls -l\` and every line starts with something like \`-rw-r--r--\`. That string is the whole permission model:

\`\`\`
-rw-r--r--  1  nizar  staff  1024  Aug 19 09:14  notes.txt
│└┬┘└┬┘└┬┘     │      │
│ │  │  │      │      └── group that owns it
│ │  │  │      └───────── user that owns it
│ │  │  └── others: everyone else
│ │  └───── group members
│ └──────── owner
└────────── type: - is a file, d is a directory, l is a link
\`\`\`

After the type character, there are **three groups of three**. Each group is read-write-execute (\`rwx\`) for one class of user: the **owner**, the **group**, and **everyone else**. A dash means that permission is absent.

So \`-rw-r--r--\` reads as: it's a regular file; the owner can read and write it; the group can only read it; everyone else can only read it. Nobody can execute it.

::quiz
---
question: "A file shows \`-rwxr-x---\`. Who can execute it?"
options:
  - The owner and members of the group
  - Only the owner
  - Everyone
  - Nobody, because there is no execute bit set
answer: 0
explanation: "Owner has rwx, group has r-x (read and execute, no write), and others have --- (nothing at all). So owner and group can run it; everyone else can't even read it."
---
::

## What the bits mean for directories

This is where the model surprises people, because \`rwx\` means something different on a directory:

- **\`r\`** — you can list the contents (\`ls\` works)
- **\`w\`** — you can create and delete entries inside it
- **\`x\`** — you can *enter* it and access things through it (\`cd\` works)

The important consequence: \`w\` on a directory lets you delete files inside it **even if you can't write to those files**. Deleting a file is modifying its directory, not modifying the file. That's how a read-only file in a writable folder can still disappear.

And a directory without \`x\` is effectively sealed — you can't \`cd\` into it or reach anything inside, even if you know the exact path.

## The numbers

You'll see permissions written as three digits: \`644\`, \`755\`, \`600\`. Each digit is one class (owner, group, others), and each is a sum:

- read = **4**
- write = **2**
- execute = **1**

Add them for each class:

- \`7\` = 4+2+1 = \`rwx\`
- \`6\` = 4+2 = \`rw-\`
- \`5\` = 4+1 = \`r-x\`
- \`4\` = \`r--\`
- \`0\` = \`---\`

Which makes the two you'll see constantly decode cleanly:

- **\`644\`** = \`rw-r--r--\` — owner edits, everyone reads. The normal state of a document or config file.
- **\`755\`** = \`rwxr-xr-x\` — owner edits, everyone reads and runs. The normal state of a program or a directory.

::fill-blank
---
prompt: What three-digit number means "owner can read and write, nobody else can do anything"?
answer:
  - 600
  - "600"
hint: Read is 4 and write is 2, and the other two classes get nothing.
placeholder: e.g. 644
explanation: "600 is \`rw-------\`. It's what you want on private keys and files holding secrets — and ssh will actually refuse to use a key that's more permissive than this."
---
::

## Changing them

\`chmod\` changes permissions. It takes numbers:

\`\`\`
chmod 644 notes.txt
chmod 755 deploy.sh
\`\`\`

…or symbols, which are easier when you want to change one thing without recalculating the whole set:

\`\`\`
chmod +x deploy.sh      # add execute for everyone
chmod u+x deploy.sh     # add execute for the user (owner) only
chmod go-w notes.txt    # remove write from group and others
\`\`\`

\`u\` is user/owner, \`g\` is group, \`o\` is others, \`a\` is all. \`+\` adds, \`-\` removes, \`=\` sets exactly.

\`chown\` changes ownership, and generally needs \`sudo\` because giving your files away (or taking someone else's) is a privileged act:

\`\`\`
sudo chown nizar:staff notes.txt
\`\`\`

::deep-dive{title="Why a script you just wrote won't run"}
You write \`deploy.sh\`, type \`./deploy.sh\`, and get "Permission denied".

Nothing is broken. Files are created without the execute bit — a sensible default, since most files aren't programs and you don't want anything that lands on your disk to be runnable. Your script is currently \`644\`, and running it requires \`x\`.

\`\`\`
chmod +x deploy.sh
./deploy.sh
\`\`\`

This is also why downloaded binaries and installers so often come with a \`chmod +x\` step in their instructions.

Note the \`./\` as well. Remember \`PATH\` from the first lesson — the shell only searches those directories, and your current directory isn't one of them. \`./deploy.sh\` is you giving an explicit path instead of asking for a search.
::

## On \`sudo\`

\`sudo\` runs a single command as the superuser, which bypasses permission checks entirely. It exists for the cases that genuinely need it — installing packages, editing \`/etc\`, managing services.

Reaching for it whenever something is denied is a bad trade. It hides the actual problem (often a file owned by the wrong user, which stays wrong), and it turns small mistakes into system-wide ones — \`rm -rf\` as your own user can only destroy your own files, and the same command under \`sudo\` has no such limit.

When you hit "Permission denied", the useful first move is \`ls -l\` on the thing in question. Nine times out of ten the answer is visible immediately.

::quiz
---
question: Why can you sometimes delete a file you have no write permission on?
options:
  - Because deleting is controlled by write permission on the containing directory, not the file
  - Because the owner always keeps delete rights
  - Because read permission implies delete
answer: 0
explanation: "Deleting removes the file's entry from its directory — that's a modification of the directory. If you can write to the directory, you can remove entries from it regardless of the files' own permissions."
---
::

Next: processes — finding, watching, and stopping the things that are running.
`;export{e as default};
