# Focus Mode Extension — Research & Approach Analysis

## 1. Problem Statement

Build a VS Code extension that provides a distraction-free "Focus Mode" where:
- Only the current file is shown in full-screen editor mode
- All UI chrome is hidden (sidebar, panel, activity bar, status bar, tabs, minimap)
- Scroll continues to work normally
- Line numbers are optional (configurable)
- Only the cursor's current line is shown at full brightness; all other lines are dimmed to 50% opacity
- Pressing `Escape` exits the mode and restores the normal UI

---

## 2. Relevant VS Code APIs (Research Summary)

### 2.1 UI Visibility — Built-in Commands

VS Code exposes built-in commands to toggle every chrome element:

| Command ID | Effect |
|---|---|
| `workbench.action.toggleZenMode` | Hides sidebar, panel, activity bar, status bar; optionally goes full-screen and centers layout |
| `workbench.action.toggleFullScreen` | Toggles OS-level full-screen |
| `workbench.action.toggleSidebarVisibility` | Shows/hides the sidebar |
| `workbench.action.togglePanel` | Shows/hides the bottom panel |
| `workbench.action.toggleActivityBarVisibility` | Shows/hides the activity bar |
| `workbench.action.toggleStatusbarVisibility` | Shows/hides the status bar |
| `workbench.action.toggleMenuBar` | Shows/hides the menu bar (Windows/Linux) |
| `workbench.action.toggleMinimap` | Shows/hides the minimap |
| `workbench.action.closeSidebar` | Closes the sidebar |
| `workbench.action.closePanel` | Closes the panel |

**Zen Mode** is particularly relevant — it already hides most UI elements and has configurable settings (`zenMode.hideActivityBar`, `zenMode.hideStatusBar`, `zenMode.hideLineNumbers`, `zenMode.showTabs`, `zenMode.fullScreen`, `zenMode.centerLayout`, `zenMode.silentNotifications`).

### 2.2 Text Decoration API

The `DecorationRenderOptions` interface provides:

```typescript
interface DecorationRenderOptions {
    opacity?: string;           // e.g., "0.5" — THIS IS THE KEY PROPERTY
    color?: string | ThemeColor;
    backgroundColor?: string | ThemeColor;
    isWholeLine?: boolean;
    // ... many more styling properties
}
```

- `window.createTextEditorDecorationType(options)` — creates a reusable decoration type
- `editor.setDecorations(decorationType, ranges)` — applies decorations to specific line ranges
- Decorations are **performant** and designed for real-time use (they power bracket matching, git gutter, error highlights, etc.)

### 2.3 Cursor Tracking Events

| Event | Purpose |
|---|---|
| `window.onDidChangeTextEditorSelection` | Fires when cursor position changes — used to update which line is "active" |
| `window.onDidChangeActiveTextEditor` | Fires when the user switches to a different editor |
| `window.onDidChangeVisibleTextEditors` | Fires when visible editors change |
| `window.onDidChangeTextEditorVisibleRanges` | Fires when scroll position changes |

### 2.4 Editor Options API

```typescript
interface TextEditorOptions {
    lineNumbers?: TextEditorLineNumbersStyle; // Off=0, On=1, Relative=2, Interval=3
    cursorStyle?: TextEditorCursorStyle;
    // ...
}
```

### 2.5 Configuration API

```typescript
workspace.getConfiguration('editor').get('lineNumbers');
workspace.getConfiguration('editor').update('lineNumbers', 'off', ConfigurationTarget.Global);
```

### 2.6 Custom When Clause Contexts

```typescript
vscode.commands.executeCommand('setContext', 'focusMode.active', true);
```
- Enables binding `Escape` key only when focus mode is active
- Prevents conflict with other Escape bindings

### 2.7 Contribution Points (package.json)

- `contributes.commands` — register "Enter Focus Mode" / "Exit Focus Mode"
- `contributes.keybindings` — bind Escape with `when: "focusMode.active"`
- `contributes.configuration` — expose settings (opacity level, line numbers, etc.)
- `contributes.menus` — add to editor title bar, command palette

---

## 3. Approach Analysis

### Approach A: Decoration API + Built-in Commands (Native/Lightweight) ⭐ RECOMMENDED

**How it works:**
1. Register a command `focusMode.toggle` to enter/exit focus mode
2. On enter: Execute built-in commands to hide all UI chrome (or leverage Zen Mode as a base)
3. Create a `TextEditorDecorationType` with `opacity: "0.5"` for dimmed lines
4. Listen to `onDidChangeTextEditorSelection` to continuously update decorations: current line = no decoration (full brightness), all other lines = dimmed decoration
5. Set custom context `focusMode.active = true` for keybinding Escape
6. On exit (Escape): Remove decorations, restore UI, set context to false

**Pros:**
- ✅ Uses only official, stable VS Code APIs
- ✅ Preserves ALL editor features (editing, IntelliSense, search, auto-complete, etc.)
- ✅ Excellent performance — decorations are GPU-accelerated, designed for real-time updates
- ✅ Respects and works within user's existing color theme
- ✅ Low code complexity (~200-400 lines)
- ✅ Easy to maintain across VS Code updates
- ✅ Scroll works natively (it's the real editor)
- ✅ Line numbers controllable via `TextEditorOptions`

**Cons:**
- ⚠ Limited to what the decoration API offers visually (no custom overlays, animations)
- ⚠ Opacity is per-range, may need throttling on very rapid cursor movement
- ⚠ Zen mode overlap: if user already has customized zen mode settings, entering/exiting may alter those

**Risk Mitigation:**
- Debounce decoration updates (16ms frame rate is sufficient)
- Save/restore user's zen mode settings before/after focus mode
- Or: avoid Zen mode entirely, toggle each UI element individually for full control

---

### Approach B: WebView Panel Overlay

**How it works:**
1. Register a command that opens a `WebviewPanel` covering the full editor area
2. Read the current document content and pass it to the WebView
3. Render the content in custom HTML with syntax highlighting (e.g., Shiki or Prism.js)
4. Implement the dimming effect via CSS: `.line.active { opacity: 1 }` / `.line { opacity: 0.5 }`
5. Handle scroll, cursor tracking, and keyboard events in the WebView JavaScript
6. Escape closes the WebView

**Pros:**
- ✅ Complete visual control (can create any design — animations, gradients, custom fonts)
- ✅ Can create a truly immersive, cinema-like experience
- ✅ No limitations from the decoration API

**Cons:**
- ❌ **Editing is not possible** in the WebView — user can only READ, not edit
- ❌ Must re-implement syntax highlighting from scratch
- ❌ File changes are not reflected live (must manually sync)
- ❌ Loss of ALL editor features: IntelliSense, search, auto-complete, multi-cursor, etc.
- ❌ High complexity (~1000+ lines)
- ❌ Performance concerns for large files (DOM rendering vs VS Code's virtual rendering)
- ❌ Accessibility issues (screen readers, keyboard navigation)
- ❌ Scroll behavior may feel different from native editor

**Verdict: NOT RECOMMENDED** — The fundamental flaw is loss of editing capability. A focus mode should let you *focus on writing*, not just reading.

---

### Approach C: Custom Editor Provider

**How it works:**
1. Register a `CustomTextEditorProvider` for a `.focus` virtual view
2. Use a WebView to render the document with focus-mode styling
3. Implement two-way synchronization between the WebView and the `TextDocument`

**Pros:**
- ✅ Deeper VS Code integration than standalone WebView
- ✅ Has document model support (`TextDocument` sync)
- ✅ Could theoretically support editing

**Cons:**
- ❌ Even more complex than Approach B
- ❌ Still requires re-implementing editor features in the WebView
- ❌ Custom editors are designed for non-text formats (images, binary files) — using them for text files is fighting the framework
- ❌ Massive over-engineering for what is essentially a UI toggle + decoration
- ❌ File association mechanics are awkward for a "mode" that should work on any file

**Verdict: NOT RECOMMENDED** — Massive over-engineering; custom editors are the wrong abstraction for this feature.

---

### Approach D: Settings Manipulation + Decorations

**How it works:**
1. On enter: Save all current relevant settings to extension storage
2. Programmatically update VS Code settings:
   ```json
   {
     "workbench.sideBar.visible": false,
     "workbench.statusBar.visible": false,
     "workbench.activityBar.visible": false,
     "editor.lineNumbers": "off",
     "editor.minimap.enabled": false,
     "editor.renderWhitespace": "none",
     "window.menuBarVisibility": "hidden"
   }
   ```
3. Apply decorations for dimming (same as Approach A)
4. On exit: Restore all saved settings

**Pros:**
- ✅ Granular control over each UI element
- ✅ Settings are persistent (survives VS Code restart if focus mode state is persisted)
- ✅ Editor features fully preserved

**Cons:**
- ❌ **Modifying user's global settings is dangerous** — if the extension crashes or VS Code closes unexpectedly, settings remain altered
- ❌ Settings changes trigger UI re-renders which can cause visible flicker
- ❌ Race conditions with other extensions modifying settings simultaneously
- ❌ `workspace.getConfiguration().update()` is asynchronous and can fail
- ❌ Some settings (like sidebar visibility) aren't directly controllable via the settings API — they require commands anyway
- ❌ More fragile than Approach A with no real benefit

**Verdict: NOT RECOMMENDED** — The risk of corrupting user settings outweighs the marginal benefit over Approach A.

---

### Approach E: CSS Injection (Custom CSS Loader Pattern)

**How it works:**
1. Inject custom CSS into VS Code's renderer process (modifying `workbench.html` or using Electron APIs)
2. CSS hides UI elements and applies opacity effects
3. Toggle CSS classes to enter/exit focus mode

**Pros:**
- ✅ Total visual control, including elements the API doesn't expose

**Cons:**
- ❌ **Not officially supported** — VS Code shows "[Unsupported]" warning
- ❌ Requires modifying VS Code's internal files
- ❌ Breaks on every VS Code update
- ❌ Security risk — requires elevated file system permissions
- ❌ Cannot be published to the VS Code Marketplace (violates policies)
- ❌ Fragile, hard to debug

**Verdict: ABSOLUTELY NOT RECOMMENDED** — This is a hack, not an extension.

---

## 4. Comparison Matrix

| Criteria | A: Decorations + Commands | B: WebView | C: Custom Editor | D: Settings | E: CSS Injection |
|---|:---:|:---:|:---:|:---:|:---:|
| **Complexity** | 🟢 Low | 🔴 High | 🔴 Very High | 🟡 Medium | 🟡 Medium |
| **Performance** | 🟢 Excellent | 🟡 Good | 🟡 Good | 🟢 Excellent | 🟢 Excellent |
| **Editing Works** | 🟢 Yes | 🔴 No | 🟡 Partial | 🟢 Yes | 🟢 Yes |
| **IntelliSense** | 🟢 Yes | 🔴 No | 🔴 No | 🟢 Yes | 🟢 Yes |
| **Visual Control** | 🟡 Good | 🟢 Complete | 🟢 Complete | 🟡 Good | 🟢 Complete |
| **Theme Compat** | 🟢 Native | 🔴 Manual | 🔴 Manual | 🟢 Native | 🟡 Partial |
| **Stability** | 🟢 High | 🟡 Medium | 🟡 Medium | 🟡 Medium | 🔴 Low |
| **Maintainability** | 🟢 Easy | 🔴 Hard | 🔴 Hard | 🟡 Medium | 🔴 Hard |
| **Official API** | 🟢 Yes | 🟢 Yes | 🟢 Yes | 🟢 Yes | 🔴 No |
| **Marketplace OK** | 🟢 Yes | 🟢 Yes | 🟢 Yes | 🟢 Yes | 🔴 No |
| **Crash Safety** | 🟢 Safe | 🟢 Safe | 🟢 Safe | 🔴 Risk | 🔴 Risk |

---

## 5. Recommendation

### **Approach A (Decoration API + Built-in Commands) is the clear winner.**

**Rationale:**
1. **It solves 100% of the requirements** using stable, official APIs
2. **The decoration API's `opacity` property** directly and perfectly maps to the "50% opacity" requirement
3. **Built-in commands** for hiding UI elements are the same mechanism VS Code itself uses for Zen Mode
4. **All editor functionality is preserved** — users can still edit, use IntelliSense, search, etc. while in focus mode
5. **Performance is excellent** — decorations are the same lightweight mechanism used by Git gutter, bracket matching, error highlights
6. **Minimal code** — estimated ~300 lines for the core implementation
7. **Zero risk** — no settings corruption, no file modifications, everything is in-memory and command-based

### Important Caveats (Must Address in Implementation)

1. **UI restoration must be deterministic.** Many workbench commands are toggles; naïve enter/exit logic can drift if the user or another extension changes layout while focus mode is active.
2. **Do not mix orchestration strategies.** Pick one path (recommended: command-based granular orchestration with a change ledger) to keep behavior idempotent.
3. **Single-file intent must be explicit.** If multiple editor groups are visible, focus mode should either collapse to one editor group or fail-safe with a clear message.
4. **Escape conflicts are real.** Keep focus-mode Escape lower priority than IntelliSense, rename, snippets, code actions, and find widget.
5. **Line-number policy must follow active editor changes.** Reapply focus-mode editor options when active editor changes.

### Specific Implementation Strategy for Approach A (Hardened)

**UI Hiding Strategy (Recommended):**
- Use a **single orchestration path** based on explicit commands plus a per-session **change ledger**.
- Record only what this session changes (`changedByFocusMode` flags), then restore only those changes on exit.
- Avoid persistent settings writes for workbench/editor UI state.
- Treat enter/exit as idempotent transitions in a small state machine.

**Single-File Strategy:**
- Default behavior should enforce one visible editor group (`focusMode.singleEditorOnly = true`).
- On enter, collapse/join groups to a single group if needed.
- If collapse cannot be completed, abort activation and notify the user.

**Dimming Strategy:** Two decoration types:
1. `dimmedDecoration` — `{ opacity: "0.5", isWholeLine: true }`
2. No decoration on the current line (inherits theme's full brightness)

**Cursor Tracking:** Listen to `onDidChangeTextEditorSelection`, debounced at ~16ms, to update which line is current.

**Exit Strategy:** Bind `Escape` with a defensive `when` clause so focus mode exits only when no higher-priority editor widget is active.
