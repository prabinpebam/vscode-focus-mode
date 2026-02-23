# Focus Mode for VS Code

A distraction-free writing and coding mode for Visual Studio Code. Hides all UI chrome, spotlights the current line, and maintains separate zoom levels for focused and normal editing.

![VS Code](https://img.shields.io/badge/VS%20Code-%3E%3D1.85.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- **Line spotlight** — the current line renders at full brightness; all other lines are dimmed (configurable opacity)
- **Full chrome hiding** — sidebar, panel, activity bar, status bar, tabs, breadcrumbs, minimap, menu bar, layout controls, and editor actions are all hidden
- **Full screen + centered layout** — immersive, centered editing with no distractions
- **Separate zoom levels** — focus mode remembers its own zoom level independently from your normal editing zoom
- **Escape to exit** — press `Esc` to leave focus mode instantly (context-aware: won't interfere with autocomplete, find, rename, etc.)
- **Crash recovery** — if VS Code closes unexpectedly while in focus mode, all UI settings are restored on next launch
- **Deterministic restore** — every setting is snapshotted before modification and precisely restored on exit

## Usage

| Action | Shortcut | Command Palette |
|---|---|---|
| Toggle focus mode | `Ctrl+K Ctrl+F` (`Cmd+K Cmd+F` on Mac) | `Focus Mode: Toggle Focus Mode` |
| Exit focus mode | `Escape` | `Focus Mode: Exit Focus Mode` |

You can also click the eye icon ($(eye)) in the editor title bar to toggle focus mode.

## Settings

All settings are under `focusMode.*` in your VS Code settings:

| Setting | Type | Default | Description |
|---|---|---|---|
| `focusMode.opacity` | number | `0.5` | Opacity for non-focused lines (0.1 = nearly invisible, 0.9 = barely dimmed) |
| `focusMode.lineNumbers` | string | `"off"` | Line numbers in focus mode: `off`, `on`, `relative`, or `inherit` |
| `focusMode.fullScreen` | boolean | `true` | Enter full screen when activating focus mode |
| `focusMode.centerLayout` | boolean | `true` | Center the editor layout in focus mode |
| `focusMode.hideMinimap` | boolean | `true` | Hide the minimap in focus mode |
| `focusMode.singleEditorOnly` | boolean | `true` | Collapse to a single editor group when entering focus mode |

## How It Works

### Two-Tier UI Restoration

1. **Deterministic tier** (settings-backed) — minimap, tabs, editor actions, breadcrumbs, menu bar, layout controls, line numbers, and zoom level are snapshotted before modification and restored to their exact prior values on exit.
2. **Best-effort tier** (command toggles) — sidebar, panel, activity bar, status bar, full screen, and centered layout are toggled via VS Code commands. A change ledger tracks what was modified so only those are reversed.

### Zoom Level Isolation

Focus mode maintains a completely separate zoom level from your normal editing session:

- **On enter**: your normal zoom is snapshotted, and the saved focus-mode zoom is applied
- **During focus mode**: `Ctrl+=`/`Ctrl+-` adjustments are captured in the setting (by temporarily disabling `window.zoomPerWindow`)
- **On exit**: the focus-mode zoom is persisted for next time, and your normal zoom is restored
- Zoom levels are stored in VS Code's `globalState` and survive across sessions and restarts

### Crash Recovery

A marker is written to `globalState` when entering focus mode. If VS Code closes unexpectedly, the extension detects the stale marker on next activation and restores all settings from the snapshot.

## Architecture

```
src/
├── extension.ts          # Activation/deactivation entry point
├── focusMode.ts          # Core state machine (enter/exit/transition guard)
├── uiManager.ts          # Chrome hide/restore with change ledger
├── decorationManager.ts  # Line spotlight decorations
└── config.ts             # Typed configuration reader
```

## Development

### Prerequisites

- Node.js 18+
- VS Code 1.85+

### Build

```bash
npm install
npx tsc --noEmit    # type-check
node esbuild.mjs    # bundle
```

### Run

Press `F5` in VS Code to launch the Extension Development Host.

### Test

```bash
npm test
```

## License

MIT
