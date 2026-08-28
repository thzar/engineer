const e=`The shell's real power is not its own syntax — it is that it can run any program on the system and use the result as a value. **Command substitution** is the mechanism, and it's one character of syntax for an enormous amount of leverage.

## \`$( ... )\` captures output

\`\`\`
TODAY=$(date +%Y-%m-%d)
echo "Backup for $TODAY"
\`\`\`

Everything between \`$(\` and \`)\` is run in a subshell, and the whole expression is replaced by whatever that command printed to standard output. Trailing newlines are stripped, which is almost always what you want.

::terminal-teaser
---
lines:
  - cmd: echo "There are $(ls | wc -l) files here"
    out: There are 12 files here
  - cmd: USER_COUNT=$(who | wc -l)
    out: ""
  - cmd: echo "$USER_COUNT logged in"
    out: 3 logged in
---
::

You will also see the older backtick form, \`\` \`date\` \`\`. It does the same thing and is still valid, but \`$( ... )\` nests without escaping madness and is far easier to read:

\`\`\`
OWNER=$(stat -c %U "$(dirname "$FILE")")     # fine
OWNER=\`stat -c %U \\\`dirname $FILE\\\`\`          # the same thing, backticks
\`\`\`

Prefer \`$( )\`. The only reason to know backticks is that older scripts are full of them.

## It runs in a subshell

The command inside runs in a **child** of your shell. That has one consequence people get bitten by:

\`\`\`
DIR=$(cd /tmp && pwd)
echo "$DIR"     # /tmp
pwd             # still wherever you were
\`\`\`

The \`cd\` happened in the subshell and died with it. Same for any variable set inside — this is the same one-way rule as running a script.

::quiz
---
question: |-
  Why does \`COUNT=$(grep -c error app.log)\` work, but \`grep -c error app.log > COUNT\` not do the same thing?
options:
  - The first captures the output into a variable; the second writes it into a file named COUNT
  - They're equivalent — the second is just older syntax
  - The second fails because COUNT isn't declared
answer: 0
explanation: |-
  \`>\` is redirection: it creates a file. Command substitution is the only way to get a program's output into a shell variable. The second form silently leaves a file called COUNT in your directory.
---
::

## Quote the substitution

The result is expanded exactly like a variable — which means it gets word-split and globbed unless quoted:

\`\`\`
FILES=$(ls *.txt)
echo $FILES        # newlines became spaces
echo "$FILES"      # one filename per line, preserved
\`\`\`

Assigning to a variable is safe. Using it is where the quotes matter:

\`\`\`
rm "$(cat to-delete.txt)"       # correct if the file holds one name
\`\`\`

::deep-dive{title="\`IFS\`, and where the newlines go"}
When the shell splits a substitution into words, it splits on the characters in \`IFS\` — the **Internal Field Separator**. By default that is space, tab, and newline.

That is why this happens:

\`\`\`
NAMES=$(grep -i steve /etc/passwd | cut -d: -f1)
echo "Found: $NAMES"
Found: steve fred
\`\`\`

The command printed two lines. The unquoted expansion split them on newline and rejoined them with a space. Quote it and the newlines survive:

\`\`\`
echo "$NAMES"
steve
fred
\`\`\`

You can also change \`IFS\` deliberately, which is the standard way to parse delimited data:

\`\`\`
OLD_IFS=$IFS
IFS=:
while read -r NAME PASS UID GID REST
do
  echo "$NAME has uid $UID"
done < /etc/passwd
IFS=$OLD_IFS
\`\`\`

Setting \`IFS=:\` makes \`read\` split each line on colons instead of whitespace, and the extra fields all pile into the last variable named. Save and restore it — leaving \`IFS\` modified will produce baffling behaviour further down the script.
::

## Arithmetic, while we're here

\`$(( ... ))\` looks similar and does something different: integer arithmetic, entirely inside the shell.

\`\`\`
COUNT=$((COUNT + 1))
TOTAL=$((PRICE * QTY))
PERCENT=$((DONE * 100 / TOTAL))
\`\`\`

Variables inside don't need a \`$\`. Division is integer division — \`$((7 / 2))\` is 3 — and there are no floating point numbers at all. If you need decimals you have to shell out to \`awk\` or \`bc\`:

\`\`\`
AVG=$(echo "scale=2; $TOTAL / $COUNT" | bc)
\`\`\`

::fill-blank
---
prompt: Store the current hostname in a variable called \`HOST\`, using command substitution.
answer:
  - HOST=$(hostname)
  - HOST="$(hostname)"
  - HOST=\`hostname\`
hint: Assignment on the left, a captured command on the right.
placeholder: HOST=...
---
::

## The programs you will actually reach for

Command substitution is only as good as the commands available, and a handful of text utilities do most of the work in real scripts:

| Tool | What it's for |
|---|---|
| \`grep\` | keep the lines that match |
| \`cut\` | pull out fields by delimiter or column |
| \`tr\` | translate or delete characters |
| \`sed\` | substitute and edit, line by line |
| \`awk\` | field-aware processing with real logic |
| \`sort\` / \`uniq\` | order and deduplicate |
| \`wc\` | count lines, words, bytes |
| \`head\` / \`tail\` | take from either end |

A single line combining four of them is entirely normal, and reads left to right:

\`\`\`
# The ten IPs with the most requests in a log
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10
\`\`\`

Note the single quotes around the awk program: it is full of \`$1\`, and double quotes would have let the shell eat it before awk saw it — exactly the case from the quoting lesson.

::quiz
---
question: Why is \`sort\` needed before \`uniq -c\` in that pipeline?
options:
  - |-
    \`uniq\` only collapses *adjacent* duplicate lines, so equal lines must be brought together first
  - |-
    \`uniq\` requires sorted input to avoid an error
  - It isn't needed; it's there for readability
answer: 0
explanation: |-
  \`uniq\` is a streaming tool — it compares each line to the previous one and nothing else, which is what lets it work on input of any size. Sorting is what puts identical lines next to each other. The second \`sort -rn\` then ranks by the counts \`uniq -c\` added.
---
::

## Don't reach for a program you don't need

The flip side: every external command is a process, and in a loop that adds up.

\`\`\`
# 10,000 processes
for i in $(seq 1 10000); do TOTAL=$(expr $TOTAL + $i); done

# zero processes
for i in $(seq 1 10000); do TOTAL=$((TOTAL + $i)); done
\`\`\`

The same applies to the famous "useless use of \`cat\`":

\`\`\`
cat file.txt | grep error      # two processes
grep error file.txt            # one
\`\`\`

It is not worth being precious about — but knowing that \`$(( ))\`, \`case\`, and \`test\` are all builtins, while \`expr\`, \`basename\`, and \`seq\` are not, will make a slow script obvious when you meet one.

Next up: functions — naming a block of a script so the rest of it can stop repeating itself.
`;export{e as default};
