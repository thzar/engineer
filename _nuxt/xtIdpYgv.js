const e=`A container needs a \`/\`. Not a copy of your machine's — its own, holding whatever userland the image ships: Alpine's BusyBox and musl, or Debian's coreutils and glibc, or nothing at all but a single static binary.

The mechanism is \`chroot\`, and it is the oldest piece of this whole story: it landed in Version 7 Unix in 1979, twenty-five years before anyone said "container".

## Get a userland

An image is, stripped of its metadata, a tarball of a filesystem. You can download one directly — no registry, no Docker:

\`\`\`
curl -O https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-minirootfs-3.19.1-x86_64.tar.gz

mkdir -p ./rootfs
sudo tar -xf alpine-minirootfs-3.19.1-x86_64.tar.gz -C ./rootfs
\`\`\`

::terminal-teaser
---
lines:
  - cmd: ls ./rootfs
    out: bin  dev  etc  home  lib  media  mnt  opt  proc  root  sbin  srv  sys  tmp  usr  var
  - cmd: du -sh ./rootfs
    out: 7.8M	./rootfs
---
::

Under eight megabytes, and that is a complete Linux userland: a shell, a package manager, an init, the lot. It is small because it has no kernel in it — it doesn't need one, because it will use yours.

## \`chroot\` moves \`/\`

\`\`\`
sudo chroot ./rootfs /bin/sh
\`\`\`

Inside:

\`\`\`
/ # ls /
bin    dev    etc    home   lib    media  mnt    opt    proc   root
/ # cat /etc/os-release
NAME="Alpine Linux"
/ # ls /home/you
ls: /home/you: No such file or directory
\`\`\`

The shell is now resolving every absolute path against \`./rootfs\`. \`/bin/sh\` means \`./rootfs/bin/sh\`. \`/etc/os-release\` reports Alpine on a machine running Ubuntu. Your home directory is not merely hidden — as far as this process can express it, there is no path that names it.

That last point is the important one. \`chroot\` doesn't hide files. It changes what the string \`/\` resolves to, which means paths above the new root become **unnameable** rather than forbidden.

::quiz
---
question: |-
  After \`chroot ./rootfs\`, why does \`cat /etc/os-release\` report Alpine on an Ubuntu host?
options:
  - Every absolute path is resolved against \`./rootfs\`, so it reads \`./rootfs/etc/os-release\`
  - chroot replaces the running kernel with Alpine's
  - The file was rewritten during the chroot
answer: 0
explanation: |-
  Only path resolution changed. The kernel, the CPU, the process table, and the network are all still the host's — which is why \`uname -r\` inside the chroot still reports the Ubuntu kernel version.
---
::

## \`/proc\` has to be mounted

Try this inside the chroot:

\`\`\`
/ # ps
PID   USER     TIME  COMMAND
\`\`\`

Empty — not even the shell you are typing into. \`ps\` reads \`/proc\`, and \`./rootfs/proc\` is an empty directory. The kernel's process information is exposed through a virtual filesystem, and nobody has mounted it here.

\`\`\`
/ # mount -t proc proc /proc
/ # ps
PID   USER     TIME  COMMAND
    1 root      0:00 /sbin/init
    2 root      0:00 [kthreadd]
  ...
\`\`\`

Now \`ps\` works — and shows **every process on the host**, because a plain \`chroot\` gives no PID namespace. This is the pairing from the last lesson seen from the other side: the namespace provides the isolation, the mount provides the view, and you need both.

::quiz
---
question: |-
  Inside a chroot with \`/proc\` mounted but no PID namespace, \`ps\` lists every host process. Can that shell kill them?
options:
  - Yes — it is running as real root on the host with no PID isolation
  - No — chroot prevents signals from crossing the boundary
  - Only processes whose binaries exist inside the chroot
answer: 0
explanation: |-
  chroot restricts path resolution and nothing else. Signals, the process table, the network, and every capability of root are untouched. A root shell in a chroot is a root shell on the host that is inconvenienced about filenames.
---
::

## \`chroot\` is not a security boundary

This has been true since the 1980s and is still worth stating plainly, because the intuition points the other way.

A process running as root inside a chroot can escape it. The classic method is a dozen lines of C: create a directory, \`chroot\` into it, then \`chdir("../../../..")\` past the new root and \`chroot(".")\`. The kernel does not clamp the relative path, so you walk out into the real filesystem. Root inside a chroot keeps every capability — it can \`mknod\` a device node for the host's disk and read it directly, load a kernel module, or \`ptrace\` a host process.

What actually contains a container is namespaces plus dropped capabilities plus seccomp, and the filesystem part uses \`pivot_root\` rather than \`chroot\`.

::deep-dive{title="\`pivot_root\`, which is what runtimes actually use"}
\`pivot_root\` moves the root mount rather than just changing where \`/\` points:

\`\`\`
pivot_root new_root put_old
\`\`\`

It makes \`new_root\` the process's root and relocates the *old* root to \`put_old\`, where it can then be unmounted:

\`\`\`
mount --bind ./rootfs ./rootfs        # new_root must be a mount point
mkdir -p ./rootfs/.old
pivot_root ./rootfs ./rootfs/.old
cd /
umount -l /.old
rmdir /.old
\`\`\`

After that \`umount\`, the host filesystem is not mounted anywhere in this mount namespace. There is no \`..\` to climb, because the thing you would climb into is genuinely no longer attached — a stronger claim than "unreachable by name".

\`pivot_root\` requires a mount namespace, which is the other reason runtimes always create one. runc uses this sequence; so does every other OCI runtime.

For this course we stay with \`chroot\`, because it is one word and demonstrates the idea. Just don't carry the impression that it is what production does.
::

## The pieces a real container mounts

A runtime sets up more than \`/proc\` before handing over control. The minimum set:

| Mount | Why |
|---|---|
| \`/proc\` | process table, \`/proc/self\`, kernel tunables — \`ps\`, \`top\`, most language runtimes |
| \`/sys\` | device and kernel object tree; usually read-only |
| \`/dev\` | a small \`tmpfs\` with \`null\`, \`zero\`, \`random\`, \`urandom\`, \`tty\` |
| \`/dev/pts\` | pseudo-terminals, needed for an interactive shell |
| \`/dev/shm\` | POSIX shared memory — the default 64 MB that Chrome and Postgres both complain about |

Miss \`/dev/urandom\` and half of userspace fails in ways that make no sense — TLS handshakes, UUID generation, anything seeding a random number generator.

::fill-blank
---
prompt: |-
  Mount the proc filesystem at \`/proc\`, from inside the chroot.
answer:
  - mount -t proc proc /proc
  - mount -t proc none /proc
  - mount -t proc proc /proc/
hint: The filesystem type is \`proc\`; the source argument is conventional and ignored.
placeholder: mount ...
---
::

Next up: copy-on-write — how a hundred containers share one base image without any of them being able to damage it.
`;export{e as default};
