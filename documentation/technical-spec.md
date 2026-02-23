# Focus Mode Extension — Technical Specification

> **Approach:** Decoration API + Built-in Commands (Approach A from research)
> **Version:** 1.0.0
> **VS Code Engine:** ^1.85.0

---

## 1. Overview

**Focus Mode** is a VS Code extension that provides a distraction-free writing/coding experience. When activated, it hides all UI chrome and dims every line except the one where the cursor sits, creating a spotlight effect that keeps the user focused on the current line.

---

## 2. Functional Requirements

### FR-1: Enter Focus Mode
- **Trigger:** Command Palette → "Focus Mode: Toggle" or keyboard shortcut
- **Behavior:**
  1. Hide all non-editor UI elements (sidebar, panel, activity bar, status bar, tabs, minimap, breadcrumbs)
  2. Enter full-screen mode
  3. Apply dimming decorations to all lines except the current cursor line
  4. Set custom context `focusMode.active = true`

### FR-2: Spotlight Effect (Line Dimming)
- The line where the cursor is positioned renders at **full brightness** (100% opacity)
- **All other lines** render at **50% opacity** (configurable)
- As the cursor moves (keyboard, mouse click, or scroll), the spotlight follows immediately
- Multi-cursor: all cursor lines should be at full brightness

### FR-3: Exit Focus Mode
- **Trigger:** Press `Escape` key, or Command Palette → "Focus Mode: Toggle"
- **Behavior:**
  1. Remove all dimming decorations
  2. Restore all hidden UI elements to their pre-focus state
  3. Exit full-screen mode (if it was entered by focus mode)
  4. Set custom context `focusMode.active = false`

### FR-4: Line Numbers (Optional)
- Configurable setting: `focusMode.showLineNumbers`
  - `"off"` (default): Hide line numbers
  - `"on"`: Show line numbers
  - `"relative"`: Show relative line numbers
  - `"inherit"`: Keep user's current setting

### FR-5: Editor Functionality Preserved
- All editor features must continue to work: typing, IntelliSense, search/replace, multi-cursor, undo/redo, copy/paste, folding, etc.

### FR-6: Scroll Support
- Native scroll must work identically to normal editor mode
- Both mouse wheel and keyboard-based scrolling (PageUp/PageDown, Ctrl+Up/Down)

### FR-7: Single-File Enforcement
- Focus Mode must present a single active editor group by default (`focusMode.singleEditorOnly = true`)
- If multiple editor groups are open on enter, extension collapses to one group before applying decorations
- If collapse fails, Focus Mode activation is aborted with a user-visible error

---

## 3. Non-Functional Requirements

### NFR-1: Performance
- Decoration updates must complete within one frame (~16ms) to avoid visible lag
- Extension activation must add < 50ms to VS Code startup
- Memory overhead must be < 5MB in active focus mode

### NFR-2: Stability
- Extension crash must not leave VS Code in an inconsistent UI state
- If VS Code is restarted while in focus mode, normal UI must be restored

### NFR-3: Theme Compatibility
- Dimming must work correctly with any color theme (light, dark, high contrast)
- The `opacity` property preserves the theme's syntax colors — only brightness changes

### NFR-4: Conflict Avoidance
- Escape keybinding must only fire when `focusMode.active && editorTextFocus`
- Must not interfere with: IntelliSense dismiss, snippet exit, find widget close, etc.
- Escape priority: IntelliSense/snippets/widgets > Focus Mode exit

### NFR-5: Deterministic Restore
- Enter/exit transitions must be idempotent
- Extension restores only UI elements changed by the current Focus Mode session
- Mid-session user layout changes are respected and not overwritten unless changed by focus mode

---

## 4. Extension Configuration (Settings)

```jsonc
{
  "focusMode.opacity": {
    "type": "number",
    "default": 0.5,
    "minimum": 0.1,
    "maximum": 0.9,
    "description": "Opacity level for non-focused lines (0.1 = nearly invisible, 0.9 = barely dimmed)"
  },
  "focusMode.lineNumbers": {
    "type": "string",
    "enum": ["off", "on", "relative", "inherit"],
    "default": "off",
    "description": "Line number visibility in focus mode"
  },
  "focusMode.fullScreen": {
    "type": "boolean",
    "default": true,
    "description": "Enter full-screen mode when activating focus mode"
  },
  "focusMode.centerLayout": {
    "type": "boolean",
    "default": true,
    "description": "Center the editor layout in focus mode"
  },
  "focusMode.hideMinimap": {
    "type": "boolean",
    "default": true,
    "description": "Hide the minimap in focus mode"
  },
  "focusMode.singleEditorOnly": {
    "type": "boolean",
    "default": true,
    "description": "Collapse to a single editor group when entering focus mode"
  },
  "focusMode.highlightRange": {
    "type": "string",
    "enum": ["line", "paragraph"],
    "default": "line",
    "description": "What to highlight at full brightness — current line or current paragraph"
  }
}
```

---

## 5. Commands

| Command ID | Title | Shortcut | When Clause |
|---|---|---|---|
| `focusMode.toggle` | Focus Mode: Toggle | `Ctrl+K Ctrl+F` | — |
| `focusMode.exit` | Focus Mode: Exit | `Escape` | `focusMode.active && editorTextFocus && !suggestWidgetVisible && !findWidgetVisible && !renameInputVisible && !inSnippetMode && !parameterHintsVisible` |

---

## 6. Context Keys

| Key | Type | Description |
|---|---|---|
| `focusMode.active` | boolean | `true` when focus mode is active, `false` otherwise |

---

## 7. Architecture

### 7.1 Module Structure

```
src/
├── extension.ts          # Entry point: activate/deactivate
├── focusMode.ts          # Core FocusMode class: state machine, orchestration
├── decorationManager.ts  # Manages decoration types and applies line dimming
├── uiManager.ts          # Saves/restores/toggles UI elements
└── config.ts             # Reads extension configuration
```

### 7.2 Class Design

#### `FocusMode` (Core State Machine)

```typescript
class FocusMode {
  private isActive: boolean = false;
  private decorationManager: DecorationManager;
  private uiManager: UIManager;
  private disposables: vscode.Disposable[] = [];

  async enter(): Promise<void>;   // Transition: inactive → active
  async exit(): Promise<void>;    // Transition: active → inactive
  async toggle(): Promise<void>;  // Calls enter() or exit()
  dispose(): void;                // Cleanup all resources
}
```

#### `DecorationManager`

```typescript
class DecorationManager {
  private dimDecoration: vscode.TextEditorDecorationType;

  constructor(opacity: number);

  updateDecorations(editor: vscode.TextEditor): void;
  // Calculates ranges: lines 0..cursorLine-1 and cursorLine+1..lastLine get dimmed
  // cursorLine gets NO decoration (full brightness)

  clearDecorations(editor: vscode.TextEditor): void;
  dispose(): void;
}
```

#### `UIManager`

```typescript
class UIManager {
  private savedState: UIState;
  private changedByFocusMode: ChangedByFocusMode;

  async hideChrome(): Promise<void>;     // Saves current state and hides UI
  async restoreChrome(): Promise<void>;  // Restores UI to saved state
}

interface UIState {
  sideBarVisible: boolean;
  panelVisible: boolean;
  // ... captured via available context keys/heuristics
}

interface ChangedByFocusMode {
  sideBar: boolean;
  panel: boolean;
  statusBar: boolean;
  activityBar: boolean;
  fullScreen: boolean;
  centeredLayout: boolean;
  minimap: boolean;
  lineNumbers: boolean;
}
```

### 7.3 Event Flow

```
User triggers "Focus Mode: Toggle"
  │
  ├─► FocusMode.enter()
  │     ├─► enforceSingleEditorGroup() [if focusMode.singleEditorOnly]
  │     │     └─► join/close groups until one remains (or abort)
  │     │
  │     ├─► UIManager.hideChrome()
  │     │     ├─► snapshot current state
  │     │     ├─► apply hide commands
  │     │     ├─► record changedByFocusMode flags
  │     │     └─► ... hide other elements
  │     │
  │     ├─► DecorationManager.updateDecorations(activeEditor)
  │     │     └─► Sets dimmed ranges for all lines except cursor line
  │     │
  │     ├─► setContext('focusMode.active', true)
  │     │
  │     └─► Register event listener: onDidChangeTextEditorSelection
  │           └─► Calls DecorationManager.updateDecorations() on every cursor move
  │
  │     └─► Register event listener: onDidChangeActiveTextEditor
  │           ├─► Reapply line-number policy for new active editor
  │           └─► Recompute decorations for new active editor
  │
  └─► User presses Escape (when focusMode.active)
        │
        └─► FocusMode.exit()
              ├─► DecorationManager.clearDecorations()
              ├─► UIManager.restoreChrome()
              ├─► setContext('focusMode.active', false)
              └─► Dispose event listeners
```

### 7.4 Decoration Strategy

For a file with N lines and cursor on line C:

```
Line 0    → dimmed (opacity: 0.5)
Line 1    → dimmed
...
Line C-1  → dimmed
Line C    → NO DECORATION (full theme brightness)
Line C+1  → dimmed
...
Line N-1  → dimmed
```

Implementation: Create two `Range[]` arrays:
- `topRange`: line 0 to line C-1 (if C > 0)
- `bottomRange`: line C+1 to line N-1 (if C < N-1)

Apply `dimDecoration` to both ranges. This is extremely efficient because VS Code's decoration engine handles large ranges natively.

**Multi-cursor support:** Exclude ALL cursor lines from the dimmed range.

### 7.5 UI Element Management Strategy

**Recommended: Single granular orchestration path with change ledger**
```typescript
// Enter: collect state, then hide
const sideBarVisible = /* check context or heuristic */;
await commands.executeCommand('workbench.action.closeSidebar');
await commands.executeCommand('workbench.action.closePanel');
await commands.executeCommand('workbench.action.toggleFullScreen'); // if not already
// Set editor options
editor.options = { lineNumbers: TextEditorLineNumbersStyle.Off };

// Exit: restore
if (sideBarVisible) await commands.executeCommand('workbench.action.toggleSidebarVisibility');
// ...
```

Rules:
- Use one orchestration path only (no hybrid switching at runtime).
- Store `savedState` and `changedByFocusMode` for the active session.
- On exit, restore only fields marked in `changedByFocusMode`.
- If user changes layout while active, do not undo user changes unless they were originally changed by focus mode.

---

## 8. Escape Key Binding — Detailed Priority Chain

The Escape key is heavily overloaded in VS Code. Our binding must:
1. Not capture Escape when IntelliSense is showing
2. Not capture Escape when find/replace widget is open
3. Not capture Escape when a rename input is visible
4. Not capture Escape when in a snippet
5. Only fire when the user genuinely wants to exit focus mode

**When clause:**
```json
"focusMode.active && editorTextFocus && !suggestWidgetVisible && !findWidgetVisible && !renameInputVisible && !inSnippetMode && !parameterHintsVisible && !codeActionMenuVisible"
```

This ensures Focus Mode's Escape is the **lowest priority** among all Escape consumers.

---

## 9. Edge Cases

| Scenario | Handling |
|---|---|
| User opens a new file while in focus mode | Apply dimming to the new editor via `onDidChangeActiveTextEditor` |
| User splits the editor while in focus mode | If `focusMode.singleEditorOnly` is true, collapse back to one group; otherwise apply dimming to active editor only |
| User closes the last editor while in focus mode | Exit focus mode automatically |
| Extension crashes | Decorations clear automatically (in-memory); startup cleanup routine restores any pending session state markers |
| VS Code restarts while focus mode was active | Detect `focusMode.wasActive` marker and run one-time recovery/restore on activation |
| User has minimap already hidden | Track pre-focus state; don't toggle minimap on exit if it was already hidden |
| Very large files (100K+ lines) | Decoration ranges are O(1) regardless of file size (VS Code handles range rendering internally) |

---

## 10. Package.json Contribution Points

```jsonc
{
  "name": "vscode-focus-mode",
  "displayName": "Focus Mode",
  "description": "Distraction-free writing mode with line spotlight effect",
  "version": "1.0.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "focusMode.toggle",
        "title": "Toggle Focus Mode",
        "category": "Focus Mode",
        "icon": "$(eye)"
      },
      {
        "command": "focusMode.exit",
        "title": "Exit Focus Mode",
        "category": "Focus Mode"
      }
    ],
    "keybindings": [
      {
        "command": "focusMode.toggle",
        "key": "ctrl+k ctrl+f",
        "mac": "cmd+k cmd+f"
      },
      {
        "command": "focusMode.exit",
        "key": "escape",
        "when": "focusMode.active && editorTextFocus && !suggestWidgetVisible && !findWidgetVisible && !renameInputVisible && !inSnippetMode && !parameterHintsVisible && !codeActionMenuVisible"
      }
    ],
    "configuration": {
      "title": "Focus Mode",
      "properties": {
        "focusMode.opacity": {
          "type": "number",
          "default": 0.5,
          "minimum": 0.1,
          "maximum": 0.9,
          "description": "Opacity level for non-focused lines (0.1 = nearly invisible, 0.9 = barely dimmed)"
        },
        "focusMode.lineNumbers": {
          "type": "string",
          "enum": ["off", "on", "relative", "inherit"],
          "default": "off",
          "description": "Line number visibility in focus mode"
        },
        "focusMode.fullScreen": {
          "type": "boolean",
          "default": true,
          "description": "Enter full-screen mode when activating focus mode"
        },
        "focusMode.centerLayout": {
          "type": "boolean",
          "default": true,
          "description": "Center the editor layout in focus mode"
        },
        "focusMode.hideMinimap": {
          "type": "boolean",
          "default": true,
          "description": "Hide the minimap in focus mode"
        },
        "focusMode.singleEditorOnly": {
          "type": "boolean",
          "default": true,
          "description": "Collapse to a single editor group when entering focus mode"
        }
      }
    },
    "menus": {
      "commandPalette": [
        {
          "command": "focusMode.exit",
          "when": "focusMode.active"
        }
      ],
      "editor/title": [
        {
          "command": "focusMode.toggle",
          "group": "navigation",
          "when": "!focusMode.active"
        }
      ]
    }
  }
}
```

---

## 11. Testing Strategy

### Unit Tests
- `DecorationManager`: verify correct ranges computed for given cursor position
- `Config`: verify settings are read and defaults applied correctly

### Integration Tests
- Toggle focus mode on/off: verify no UI leaks
- Move cursor: verify decorations update
- Multi-cursor: verify all cursor lines stay bright
- Edge: empty file, single-line file, very large file

### Manual Tests
- Visual inspection of dimming with light, dark, and high-contrast themes
- Escape key priority (open IntelliSense → press Escape → IntelliSense closes, focus mode stays)
- Keyboard shortcut doesn't conflict with common bindings

---

## 12. Future Enhancements (Out of Scope for v1.0)

| Feature | Description |
|---|---|
| Paragraph mode | Highlight the entire paragraph around the cursor, not just the line |
| Smooth transitions | Animate opacity changes for a gentler visual transition |
| Typewriter mode | Keep the cursor line always centered vertically in the editor |
| Custom colors | Allow users to set a custom background color for focus mode |
| Status bar indicator | Minimal status bar item showing focus mode is active |
| Session timing | Show how long user has been in focus mode |
| Multiple spotlight lines | Configure N lines above/below cursor to be at full brightness |
