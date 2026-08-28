const e=`A base image is eight megabytes. Run fifty containers from it and you do not want fifty copies — and you certainly do not want one container's \`rm -rf /\` to damage the image the other forty-nine are using.

The answer is **copy-on-write**: every container gets what looks like its own private copy, but blocks are only duplicated at the moment something writes to them. Creating one is instant and costs nothing until it is used.

## Set up a btrfs filesystem

btrfs has snapshots built in. You don't need a spare disk — a file will do:

\`\`\`
sudo apt install -y btrfs-progs

# A sparse 5G file, formatted as a btrfs filesystem
truncate -s 5G ./btrfs-disk.img
mkfs.btrfs -f ./btrfs-disk.img

mkdir -p ./btrfs-mount
sudo mount -o loop ./btrfs-disk.img ./btrfs-mount
\`\`\`

\`truncate -s 5G\` creates a **sparse** file: it reports as 5 GB but occupies almost no disk until written to. \`mount -o loop\` presents that file to the kernel as a block device, which is what lets a filesystem live inside a regular file.

::terminal-teaser
---
lines:
  - cmd: ls -lh btrfs-disk.img
    out: |-
      -rw-r--r-- 1 you you 5.0G Aug 28 09:14 btrfs-disk.img
  - cmd: du -h btrfs-disk.img
    out: 3.8M	btrfs-disk.img
  - cmd: df -h ./btrfs-mount
    out: |-
      Filesystem      Size  Used Avail Use% Mounted on
      /dev/loop0      5.0G  3.8M  4.3G   1% /home/you/btrfs-mount
---
::

Five gigabytes according to \`ls\`, under four megabytes on disk according to \`du\`. That gap is the sparse file.

## A subvolume for the base image

A btrfs **subvolume** is an independently snapshottable tree inside the filesystem. Make one and unpack Alpine into it:

\`\`\`
sudo btrfs subvolume create ./btrfs-mount/base-image

curl -o alpine.tar.gz \\
  https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-minirootfs-3.19.1-x86_64.tar.gz

sudo tar -xf alpine.tar.gz -C ./btrfs-mount/base-image
\`\`\`

This is the immutable thing. Nothing will ever write to it again.

## Snapshot it per container

\`\`\`
CONTAINER_ID="my-container"

sudo btrfs subvolume snapshot \\
  ./btrfs-mount/base-image \\
  ./btrfs-mount/$CONTAINER_ID
\`\`\`

That completes instantly and consumes essentially no space. The new subvolume references exactly the same blocks as the base image; only when the container modifies a file does btrfs allocate a fresh block for the changed data and repoint that one file. The base image is never touched.

::terminal-teaser
---
lines:
  - cmd: sudo btrfs subvolume snapshot ./btrfs-mount/base-image ./btrfs-mount/c1
    out: |-
      Create a snapshot of './btrfs-mount/base-image' in './btrfs-mount/c1'
  - cmd: sudo btrfs subvolume list ./btrfs-mount
    out: |-
      ID 256 gen 9 top level 5 path base-image
      ID 257 gen 9 top level 5 path c1
  - cmd: |-
      sudo sh -c "echo hello > ./btrfs-mount/c1/etc/marker"
    out: ""
  - cmd: ls ./btrfs-mount/base-image/etc/marker
    out: |-
      ls: cannot access ... No such file or directory
---
::

Written in the snapshot, absent from the base. That is the whole guarantee, and it is what makes it safe to hand fifty containers the "same" filesystem.

::quiz
---
question: |-
  You snapshot a 2 GB base image ten times. How much disk does that consume before any container writes anything?
options:
  - Essentially nothing — the snapshots share every block with the base
  - 20 GB, one full copy per snapshot
  - 2 GB, since only the first snapshot needs storing
answer: 0
explanation: |-
  A snapshot records references, not data. Space is consumed only as blocks diverge, which is why starting a container is instant regardless of image size. It is also why "disk full" on a container host is usually about accumulated *writes*, not images.
---
::

## This is what an image layer is

Docker's layered images are the same idea, generalised. Each instruction in a Dockerfile produces a layer holding only what changed; a running container adds one final writable layer on top and every write lands there. \`docker commit\` freezes that writable layer into a new read-only one.

Which explains several behaviours that otherwise look arbitrary:

- **Deleting a file doesn't shrink the image.** The upper layer records a deletion marker; the original bytes are still in the layer below. \`RUN apt-get install ... && rm -rf /var/lib/apt/lists/*\` in *one* instruction works precisely because the removal happens before the layer is sealed.
- **Reordering a Dockerfile changes build time enormously.** A layer is cached until something above it changes, so \`COPY package.json\` before \`COPY . .\` keeps the \`npm install\` layer valid across source edits.
- **Container writes vanish on removal.** The writable layer is deleted with the container. Volumes exist to sit outside this stack entirely.

::quiz
---
question: |-
  A Dockerfile installs a 200 MB toolchain in one \`RUN\`, then deletes it in a later \`RUN\`. What happens to image size?
options:
  - It grows by roughly 200 MB — the files remain in the earlier layer
  - It shrinks back, since the files are gone from the final filesystem
  - It stays the same; deletions are applied retroactively
answer: 0
explanation: |-
  Layers are immutable once written. The later layer records that the files are absent, but the bytes are still shipped and still pulled. Doing both in a single \`RUN\` is the fix, and multi-stage builds are the general answer.
---
::

::deep-dive{title="overlayfs, which is what Docker actually uses"}
btrfs is one of several storage drivers Docker supports, and it is used here because snapshots are a single obvious command. The default on nearly every modern installation is **overlayfs**, which reaches the same result differently.

overlayfs stacks directories. Given a read-only \`lower\` and a writable \`upper\`, it presents a merged view:

\`\`\`
mount -t overlay overlay \\
  -o lowerdir=./base,upperdir=./upper,workdir=./work \\
  ./merged
\`\`\`

Reads come from \`upper\` if the file is there and \`lower\` otherwise. Writes always go to \`upper\` — and writing to a file that exists only in \`lower\` triggers a **copy-up**: the whole file is copied into \`upper\` first, then modified.

Two consequences that show up in production. The first write to a large file in a lower layer is slow, because it copies the entire file regardless of how many bytes you changed — which is why database data directories belong on volumes, not in the container filesystem. And deleting a lower-layer file creates a *whiteout*, a character device with major/minor 0/0 in \`upper\`, which is the mechanism behind deletions not reclaiming space.

\`lowerdir\` accepts a colon-separated list, and that list is the image's layers.
::

## Tearing it down

Snapshots are subvolumes, so they are removed with a btrfs command rather than \`rm\`:

\`\`\`
sudo btrfs subvolume delete ./btrfs-mount/$CONTAINER_ID
\`\`\`

::fill-blank
---
prompt: |-
  Take a copy-on-write snapshot of \`./btrfs-mount/base-image\` into \`./btrfs-mount/c2\`.
answer:
  - sudo btrfs subvolume snapshot ./btrfs-mount/base-image ./btrfs-mount/c2
  - btrfs subvolume snapshot ./btrfs-mount/base-image ./btrfs-mount/c2
hint: Three words of btrfs subcommand, then source and destination.
placeholder: sudo btrfs ...
---
::

Next up: networking — giving the container its own interface, its own IP, and a wire back to the host.
`;export{e as default};
