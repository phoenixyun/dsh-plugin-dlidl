# DliDli

Danmaku and live-chat overlays for [DSH](https://github.com/deepseek-ai). The model's
streaming reasoning and answer can be shown in two ways, switchable at runtime:

- **Live mode** — a chat-style timeline in the right-hand column. New sentences appear
  at the bottom, older ones move up, and each row fades out after its own lifetime
  (adjustable), so a finished answer does not stay on screen forever.
- **Danmaku mode** — Bilibili-style bullets flying right to left across the full window
  width, with configurable speed, lane count and collision-free scheduling.

## Features

- Reads the transcript one `assistant-step` node at a time, in DOM order, so reasoning
  and answer keep the order the model produced them.
- History never replays: the first tick only baselines existing nodes (new nodes that
  appear during the first eight seconds after a reload are treated as history too).
- Content cleanup: code fences, URLs and markdown punctuation are stripped; purely
  Latin fragments are skipped when the "filter English/code fragments" switch is on.
- Semantic edit announcements: while an `edit`/`write` call streams, the band reports
  `修改 <file>` / `新增类 <name>` as those declarations arrive — no line/character
  counters.
- Two settings surfaces that adapt to the mode:
  - live: max rows, row lifetime;
  - danmaku: speed, lane count;
  - both: font size, opacity, band height, show-thinking, filters, colours, demo.
- The transcript is hidden while the overlay is on; the composer keeps its place.
- One merged settings panel (tabs `弹幕` / `外观`); the floating gear sits below the
  title bar, and the title-bar menu can open the same panel.
- Sidebar collapses on start (optional).

## Shortcuts

- `Ctrl+Shift+D` — toggle the overlay
- `Ctrl+Shift+M` — emit a demo line

## Install

```bash
dsh plugin --profile <profile> add "https://github.com/phoenixyun/dsh-plugin-dlidl/releases/download/v0.2.0/dsh-plugin-dlidl-0.2.0.tgz"
```

## Safety

Polling only (140 ms), no `MutationObserver` on the document, and DOM writes happen only
when new text arrives — an earlier attempt at a similar feature froze the UI by writing
into an observed subtree.

## License

MIT
