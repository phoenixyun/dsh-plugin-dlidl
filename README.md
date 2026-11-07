# DliDli

Bilibili-style danmaku mode for [DSH](https://github.com/deepseek-ai): the model's
streaming reply flies across the top fifth of the window as bullet comments, while
the composer keeps its place and the transcript is hidden.

## What it does

- Reads the **live text stream** from the session event window (`text-delta`
  chunks), splits it into short lines and emits each line as a bullet comment.
- Top **20%** band (adjustable 10–40%), right-to-left, multi-lane with collision
  avoidance.
- **Settings** (gear under the band, `Alt+D` toggles the mode):
  speed, font size, opacity, lane count, band height, coloured comments.
- With the mode on, chat nodes are hidden so the page is "all danmaku"; the
  composer stays exactly where it was.
- `Alt+M` emits a demo line; the settings panel has a demo button too.

## Safety

Polling only (140 ms), no `MutationObserver` on the document, and DOM writes happen
only when new text arrives — the previous attempt at a similar feature froze the UI
by writing into an observed subtree.

## Current behaviour

- The transcript is followed one `assistant-step` node at a time, in DOM order, so
  reasoning blocks and answer blocks arrive in the order the model produced them.
- A node that appears during the first eight seconds after a reload is treated as
  history catching up: it only sets a baseline and is never replayed as danmaku.
- Every piece is cleaned before it is queued: code fences, inline code, URLs and
  markdown punctuation are stripped, and purely Latin fragments are skipped when
  the "filter English/code fragments" switch is on.
- Lanes are released once a line's tail has cleared the spawn edge (plus a gap),
  and a piece whose lane is still busy stays in the queue instead of stacking.


## Install

```bash
dsh plugin --profile <profile> add github:phoenixyun/dsh-plugin-danmaku
```

## License

MIT
