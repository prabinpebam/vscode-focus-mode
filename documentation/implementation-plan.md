# Focus Mode Extension — Implementation Plan

> **Document Purpose:** Step-by-step build plan with safe testing strategy  
> **Spec Reference:** `technical-spec.md` (Approach A — Decoration API + Built-in Commands)  
> **Estimated Effort:** ~3–4 days for a complete, tested v1.0

---

## Table of Contents

1. [Development Environment & Tooling](#1-development-environment--tooling)
2. [Project Scaffold (Phase 0)](#2-project-scaffold-phase-0)
3. [Implementation Phases](#3-implementation-phases)
4. [File-by-File Implementation Order](#4-file-by-file-implementation-order)
5. [Testing Strategy — Without Affecting Your VS Code](#5-testing-strategy--without-affecting-your-vs-code)
6. [Debugging Workflow](#6-debugging-workflow)
7. [Definition of Done Checklist](#7-definition-of-done-checklist)

---

## 1. Development Environment & Tooling

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18.x | Runtime for build tools and tests |
| npm | ≥ 9.x | Package management |
| VS Code | ≥ 1.85.0 | Target platform and development IDE |
| TypeScript | ~5.3+ | Language for source code |
| `@vscode/vsce` | latest | Packaging the `.vsix` for local install |

### Key Dependencies (devDependencies)

```json
{
  "@types/vscode": "^1.85.0",
  "@types/mocha": "^10.0.0",
  "@types/node": "^20.0.0",
  "typescript": "^5.3.0",
  "@vscode/test-electron": "^2.3.8",
  "mocha": "^10.2.0",
  "esbuild": "^0.19.0",
  "@vscode/vsce": "^2.22.0",
  "glob": "^10.0.0"
}
```

### Why These Choices

- **esbuild** over webpack: Faster builds (~50ms vs ~3s), simpler config. Extensions are small; tree-shaking needs are minimal.
- **mocha** over jest: `@vscode/test-electron` is built around Mocha; Jest requires extra adapters.
- **`@vscode/test-electron`**: Official VS Code test runner — launches a sandboxed VS Code instance (more in §5).

---

## 2. Project Scaffold (Phase 0)

### Target Directory Structure

```
vscode-focus-mode/
├── .vscode/
│   ├── launch.json             # F5 debug configs (Extension Host + Tests)
│   ├── tasks.json              # Build tasks (watch, compile)
│   └── settings.json           # Workspace settings (formatter, etc.)
├── documentation/
│   ├── original-spec-human-created.md
│   ├── research-approaches.md
│   ├── technical-spec.md
│   └── implementation-plan.md  # ← this file
├── src/
│   ├── extension.ts            # activate() / deactivate() entry point
│   ├── focusMode.ts            # Core state machine & orchestrator
│   ├── decorationManager.ts    # Decoration type creation & range calculation
│   ├── uiManager.ts            # UI chrome hide/restore with change ledger
│   └── config.ts               # Typed config reader
├── src/test/
│   ├── runTest.ts              # Test launcher (uses @vscode/test-electron)
│   ├── suite/
│   │   ├── index.ts            # Mocha test suite entry
│   │   ├── decorationManager.test.ts
│   │   ├── config.test.ts
│   │   ├── focusMode.test.ts   # Integration tests
│   │   └── uiManager.test.ts
├── package.json
├── tsconfig.json
├── esbuild.mjs                 # Build script
├── .vscodeignore               # Files to exclude from packaged extension
├── .gitignore
├── CHANGELOG.md
├── README.md
└── LICENSE
```

### Scaffold Steps

1. Initialize `package.json` with the full `contributes` block from the technical spec
2. Create `tsconfig.json` targeting ES2022, module: Node16, outDir: `./out`
3. Create `esbuild.mjs` with two entry points (extension + test suite)
4. Create `.vscode/launch.json` with two configs:
   - **Run Extension** — launches Extension Development Host
   - **Extension Tests** — launches test runner in isolated VS Code
5. Create `.vscode/tasks.json` with `watch` and `compile` tasks
6. Create `.gitignore` and `.vscodeignore`
7. `npm install`

---

## 3. Implementation Phases

### Phase 1: Config + DecorationManager (Core Logic, No Side Effects)

**Goal:** Get the dimming math right in isolation.

| Step | File | What to Build | Verify |
|---|---|---|---|
| 1.1 | `src/config.ts` | `getConfig()` function — reads all 7 settings from `vscode.workspace.getConfiguration('focusMode')` with typed defaults | Unit test: defaults are correct, overrides work |
| 1.2 | `src/decorationManager.ts` | `DecorationManager` class — constructor creates `dimDecoration` type; `updateDecorations(editor)` computes top+bottom ranges excluding cursor line(s); `clearDecorations(editor)`; `dispose()` | Unit test: range calculation for cursor at top, middle, bottom, multi-cursor, empty file, single-line file |
| 1.3 | - | Write unit tests for 1.1 and 1.2 | Run tests via Extension Tests launch config |

**Key detail for `updateDecorations`:**
```
Input:  editor with N lines, cursors at lines [C1, C2, …]
Output: array of Range objects covering all lines NOT in the cursor set
```

Sort cursor lines, then build gap ranges between them. This handles multi-cursor naturally.

### Phase 2: UIManager (Commands + Change Ledger)

**Goal:** Reliably hide and restore UI chrome.

| Step | File | What to Build | Verify |
|---|---|---|---|
| 2.1 | `src/uiManager.ts` | `UIManager` class with `ChangedByFocusMode` ledger | Manual test: hide → restore cycle leaves VS Code unchanged |
| 2.2 | `src/uiManager.ts` | `hideChrome()` — execute commands based on config booleans; record what was changed | Manual test in Extension Dev Host |
| 2.3 | `src/uiManager.ts` | `restoreChrome()` — read ledger, only reverse what was changed | Manual test: toggle twice rapidly, confirm idempotent |
| 2.4 | `src/uiManager.ts` | `enforceSingleEditorGroup()` — collapse groups using `workbench.action.joinAllGroups` or similar | Manual test: split editor, then enter focus mode |
| 2.5 | - | Write integration test for UIManager | Test in isolated Extension Host |

**UIManager Implementation Notes:**

The main challenge is **detecting current state before hiding**. Strategy per element:

| Element | Detection Approach | Hide Command | Restore Command |
|---|---|---|---|
| Sidebar | Try closing; if no visible change occurred, it was already closed — but simpler: just close unconditionally and record `changedByFocusMode.sideBar = true` | `workbench.action.closeSidebar` | `workbench.action.toggleSidebarVisibility` |
| Panel | Same as sidebar | `workbench.action.closePanel` | `workbench.action.togglePanel` |
| Activity Bar | No direct query API; use `executeCommand` toggle and record | `workbench.action.toggleActivityBarVisibility` | Same command (toggle back) |
| Status Bar | Same toggle pattern | `workbench.action.toggleStatusbarVisibility` | Same command |
| Minimap | Can be read from `editor.minimap.enabled` setting | `editor.minimap.enabled → false` | Restore original setting value |
| Tabs | Read `workbench.editor.showTabs` setting | Set to `"none"` | Restore original value |
| Breadcrumbs | Read `breadcrumbs.enabled` setting | Set to `false` | Restore original value |
| Full Screen | Check via `vscode.window.state.isFullScreen` (available since 1.x) — **Note:** this property does NOT exist in the public API. Alternative: record whether WE caused fullscreen. | `workbench.action.toggleFullScreen` | Same command (toggle back only if we toggled it) |

**Critical rule:** For toggle-based commands (activity bar, status bar, fullscreen), we cannot query pre-state via public API. Strategy:
- **Minimap, Tabs, Breadcrumbs:** Readable via settings → read before, write, restore. ✅ Deterministic.
- **Sidebar, Panel:** Use close commands (not toggle). Closing an already-closed sidebar is a no-op. On restore, toggle open only if `changedByFocusMode` is true. ⚠️ Assumes sidebar was open if the close command has any effect.  
  Better approach: use `vscode.commands.executeCommand('workbench.action.closeSidebar')` which is idempotent (closing already-closed = no-op). But we need to know if it WAS open for restore. Best effort: assume it was open before close (record `true`), accept the edge case where user had it closed → we'll open it on exit. This is acceptable for v1.0.
- **Activity Bar, Status Bar:** Pure toggles with no query. Record that we toggled; toggle back on exit. If user toggles mid-session, we may desync. Accept for v1.0 with a note.
- **Full Screen:** Record if WE entered it. Only exit if we entered it.

### Phase 3: FocusMode Orchestrator (State Machine)

**Goal:** Wire everything together into the enter/exit state machine.

| Step | File | What to Build | Verify |
|---|---|---|---|
| 3.1 | `src/focusMode.ts` | `FocusMode` class skeleton — `isActive` flag, constructor takes `ExtensionContext` | Compiles |
| 3.2 | `src/focusMode.ts` | `enter()` — sequence: enforce single editor → hide chrome → apply decorations → set context → register listeners | Manual test: full enter flow in Dev Host |
| 3.3 | `src/focusMode.ts` | `exit()` — sequence: clear decorations → restore chrome → clear context → dispose listeners | Manual test: enter → exit → UI matches original |
| 3.4 | `src/focusMode.ts` | `toggle()` — calls `enter()` or `exit()` based on `isActive` | Manual test |
| 3.5 | `src/focusMode.ts` | Cursor tracking listener — `onDidChangeTextEditorSelection` → debounce → `updateDecorations` | Manual test: cursor moves, spotlight follows |
| 3.6 | `src/focusMode.ts` | Editor change listener — `onDidChangeActiveTextEditor` → reapply decorations + line-number policy | Manual test: open new file while in focus mode |
| 3.7 | `src/focusMode.ts` | Guard: if last editor closes, auto-exit focus mode | Manual test |
| 3.8 | - | Integration tests for enter/exit/toggle | Run in isolated host |

**Debounce detail for 3.5:**  
Use a simple `setTimeout`-based debounce at ~16ms. The `onDidChangeTextEditorSelection` event fires very frequently during selection drags. The debounce ensures we recompute at most ~60 times/sec. Implementation:

```typescript
private selectionDebounceTimer: NodeJS.Timeout | undefined;

private onSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
  if (this.selectionDebounceTimer) clearTimeout(this.selectionDebounceTimer);
  this.selectionDebounceTimer = setTimeout(() => {
    this.decorationManager.updateDecorations(e.textEditor);
  }, 16);
}
```

### Phase 4: Extension Entry Point

**Goal:** Register commands, wire up FocusMode instance.

| Step | File | What to Build | Verify |
|---|---|---|---|
| 4.1 | `src/extension.ts` | `activate()` — create `FocusMode` instance, register `focusMode.toggle` and `focusMode.exit` commands, push to `context.subscriptions` | F5 → Command Palette → "Focus Mode: Toggle" works |
| 4.2 | `src/extension.ts` | `deactivate()` — call `focusMode.dispose()` if active | Extension disable/uninstall cleans up |

### Phase 5: Polish & Edge Cases

| Step | What to Do | Verify |
|---|---|---|
| 5.1 | Handle config changes while active (`onDidChangeConfiguration`) — update opacity, recreate decoration type | Change opacity in settings → dimming updates live |
| 5.2 | Handle editor close during focus mode (auto-exit if no editors remain) | Close all editors → auto-exits |
| 5.3 | Split editor enforcement: if user splits while in focus mode + `singleEditorOnly`, rejoin | Split editor → auto-collapses back |
| 5.4 | Crash recovery: write `focusMode.wasActive` to `globalState` on enter, clear on exit; on activate, check and run cleanup | Kill Dev Host while active → reopen → settings restored |
| 5.5 | Multi-cursor support — ensure all cursor lines are bright | Select multi-cursor → all lines bright |
| 5.6 | Code cleanup, JSDoc comments, README | Code review |

### Phase 6: Packaging & Distribution

| Step | What to Do | Output |
|---|---|---|
| 6.1 | Create `.vscodeignore` (exclude `src/`, `documentation/`, `node_modules/`, `.vscode/`) | Lean package |
| 6.2 | Build production bundle: `esbuild --minify` | `out/extension.js` |
| 6.3 | Package: `vsce package` | `vscode-focus-mode-1.0.0.vsix` |
| 6.4 | Test: install `.vsix` locally in a fresh VS Code profile (see §5) | Extension works as installed |
| 6.5 | Optional: publish to VS Code Marketplace | Live extension |

---

## 4. File-by-File Implementation Order

This is the **dependency-driven** build order. Each file can be tested before moving to the next.

```
1. src/config.ts              ← zero dependencies, pure reads
2. src/decorationManager.ts   ← depends on config.ts + vscode API only
3. src/uiManager.ts           ← depends on config.ts + vscode commands
4. src/focusMode.ts           ← depends on all above
5. src/extension.ts           ← thin shell, depends on focusMode.ts
6. src/test/suite/*.test.ts   ← parallel with each file above
```

---

## 5. Testing Strategy — Without Affecting Your VS Code

### ⚡ Key Guarantee: Your VS Code Is Never Modified

VS Code extensions are developed using the **Extension Development Host** pattern:

```
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│     YOUR VS CODE INSTANCE       │    │  EXTENSION DEVELOPMENT HOST     │
│  (where you write code)         │    │  (separate VS Code window)      │
│                                 │    │                                 │
│  • Your settings untouched      │    │  • YOUR extension loaded here   │
│  • Your extensions unaffected   │    │  • Isolated settings            │
│  • Your workspace unchanged     │    │  • Isolated extension host      │
│                                 │    │  • Can be killed safely         │
│  Press F5 to launch ─────────────────►  Opens automatically           │
│                                 │    │                                 │
└─────────────────────────────────┘    └─────────────────────────────────┘
```

**How it works:**
1. You press **F5** in your dev VS Code (the editor where you write code)
2. VS Code spawns a **completely separate VS Code window** called the Extension Development Host
3. Your extension is loaded **only** in that second window
4. The second window has its own settings, its own UI state, its own editor area
5. Nothing you do in the Extension Development Host touches your real VS Code
6. When you close the Extension Development Host, everything it changed dies with it

### 5.1 Test Levels

#### Level 1: Unit Tests (Automated, Isolated)

**Runner:** `@vscode/test-electron` + Mocha  
**What it tests:** Pure logic — range calculations, config parsing  
**How it runs:** Spawns a headless VS Code instance, runs Mocha inside it, exits  
**Affects your VS Code?** **No.** It's a separate process.

| Test File | Tests |
|---|---|
| `config.test.ts` | Reads defaults; respects overrides; clamps out-of-range values |
| `decorationManager.test.ts` | Range calc: cursor top/middle/bottom; empty file; single line; multi-cursor; 100 cursors |

**Example test (decorationManager):**
```typescript
test('cursor at line 5 in a 10-line file dims lines 0-4 and 6-9', () => {
  const ranges = computeDimmedRanges(cursorLines: [5], totalLines: 10);
  assert.deepStrictEqual(ranges, [
    new vscode.Range(0, 0, 4, Number.MAX_SAFE_INTEGER),
    new vscode.Range(6, 0, 9, Number.MAX_SAFE_INTEGER)
  ]);
});
```

#### Level 2: Integration Tests (Automated, Sandboxed VS Code)

**Runner:** `@vscode/test-electron` + Mocha  
**What it tests:** Full enter/exit lifecycle with real VS Code API  
**How it runs:** Same isolated VS Code instance as unit tests  
**Affects your VS Code?** **No.**

| Test | What It Verifies |
|---|---|
| Toggle on/off | `focusMode.active` context key toggles correctly |
| Decorations applied | Active editor has decorations after enter |
| Decorations cleared | Active editor has no decorations after exit |
| Double toggle | Rapid toggle → no crash, clean state |
| No editor open | Toggle with no open editor → graceful no-op or error message |

**Example integration test:**
```typescript
test('toggle enters and exits cleanly', async () => {
  // Open a test file in the Extension Dev Host
  const doc = await vscode.workspace.openTextDocument({ content: 'line1\nline2\nline3' });
  await vscode.window.showTextDocument(doc);

  // Enter focus mode
  await vscode.commands.executeCommand('focusMode.toggle');
  // (Validate context key, decorations, etc.)

  // Exit focus mode
  await vscode.commands.executeCommand('focusMode.toggle');
  // (Validate decorations cleared, UI restored)
});
```

#### Level 3: Manual Exploratory Testing (Extension Development Host)

**Runner:** You, pressing F5  
**What it tests:** Visual correctness, Escape key behavior, theme compatibility  
**Affects your VS Code?** **No.** Everything happens in the Dev Host window.

##### Manual Test Matrix

| # | Test | Steps | Expected Result |
|---|---|---|---|
| M1 | Basic enter/exit | F5 → open a file → Ctrl+K Ctrl+F → Escape | Full-screen + dimming → back to normal |
| M2 | Cursor tracking | Enter focus mode → arrow keys up/down rapidly | Spotlight follows cursor smoothly, no flicker |
| M3 | Multi-cursor | Ctrl+Alt+Down to add cursors → observe | All cursor lines bright |
| M4 | Escape priority | Enter focus mode → Ctrl+F (find) → Escape | Find widget closes, focus mode stays |
| M5 | Escape priority 2 | Enter focus mode → trigger IntelliSense → Escape | IntelliSense closes, focus mode stays |
| M6 | New file | Enter focus mode → Ctrl+N (new file) | New file gets dimming applied |
| M7 | Close last editor | Enter focus mode → close the file | Focus mode auto-exits |
| M8 | Theme compatibility (dark) | Switch to dark theme → enter focus mode | Dimming looks correct |
| M9 | Theme compatibility (light) | Switch to light theme → enter focus mode | Dimming looks correct |
| M10 | Theme compatibility (HC) | Switch to High Contrast theme → enter focus mode | Dimming looks correct |
| M11 | Opacity config | Change `focusMode.opacity` to 0.3 → toggle | Dimming is stronger |
| M12 | Line numbers | Set `focusMode.lineNumbers: "on"` → enter | Line numbers visible |
| M13 | Large file | Open a 50K+ line file → enter focus mode → scroll | No lag, smooth scrolling |
| M14 | Split editor | Split editor → enter focus mode (singleEditorOnly=true) | Groups collapse to one |
| M15 | Double toggle | Press shortcut twice quickly | No crash, clean state |
| M16 | Crash recovery | Enter focus mode → kill Dev Host → reopen | UI is normal on next open |

#### Level 4: Profile-Isolated Install Testing

For final pre-release validation, install the `.vsix` in a **separate VS Code profile** so it doesn't touch your default profile:

```powershell
# Create and use a temporary profile for testing
code --profile "FocusMode-Test" --install-extension ./vscode-focus-mode-1.0.0.vsix
code --profile "FocusMode-Test" .
```

VS Code profiles are fully isolated:
- Own set of installed extensions
- Own settings.json
- Own keybindings
- Own UI state

When done testing, delete the profile:
- Command Palette → "Profiles: Delete Profile…" → select "FocusMode-Test"

**Your default profile is completely untouched.**

### 5.2 Test Infrastructure Files

#### `src/test/runTest.ts` — Test Launcher

```typescript
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // Launches a fresh, isolated VS Code instance
      launchArgs: [
        '--disable-extensions',  // Don't load other extensions
        '--disable-gpu',         // Faster in CI
      ],
    });
  } catch (err) {
    console.error('Failed to run tests');
    process.exit(1);
  }
}

main();
```

#### `src/test/suite/index.ts` — Mocha Suite Entry

```typescript
import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10000 });
  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    glob('**/**.test.js', { cwd: testsRoot }).then(files => {
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
      mocha.run(failures => {
        if (failures > 0) reject(new Error(`${failures} tests failed.`));
        else resolve();
      });
    }).catch(reject);
  });
}
```

### 5.3 Launch Configurations (`.vscode/launch.json`)

```jsonc
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: watch"
    },
    {
      "name": "Extension Tests",
      "type": "extensionHost",
      "request": "launch",
      "args": [
        "--extensionDevelopmentPath=${workspaceFolder}",
        "--extensionTestsPath=${workspaceFolder}/out/test/suite/index"
      ],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: compile"
    }
  ]
}
```

### 5.4 Continuous Testing Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Development Loop (repeat for every change)                 │
│                                                             │
│  1. Edit source code in your VS Code                        │
│  2. esbuild watcher auto-recompiles (< 50ms)                │
│  3. Press F5 → Extension Development Host opens             │
│  4. Test your change manually in the Dev Host               │
│  5. Close Dev Host → back to your VS Code (unchanged)       │
│  6. Run automated tests: F5 on "Extension Tests" config     │
│  7. All tests run in an isolated VS Code, results shown     │
│     in the Debug Console of your VS Code                    │
│  8. Commit                                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Debugging Workflow

### Breakpoints

With the `"Run Extension"` launch config, you can set breakpoints directly in your TypeScript source files (`src/*.ts`). The debugger maps correctly through source maps.

**Useful breakpoint locations:**
- `focusMode.ts` → `enter()` and `exit()` — trace the full lifecycle
- `decorationManager.ts` → `updateDecorations()` — inspect computed ranges
- `uiManager.ts` → `hideChrome()` / `restoreChrome()` — verify ledger state

### Debug Console

While the Extension Development Host is running, you can use the Debug Console in your main VS Code to:
- Evaluate expressions in the extension's context
- Call `vscode.window.activeTextEditor` to inspect state
- Log intermediate values

### Common Debug Scenarios

| Problem | What to Check |
|---|---|
| Decorations not appearing | Breakpoint in `updateDecorations()` — check range arrays. Verify the decoration type opacity value is a string `"0.5"` not number `0.5`. |
| UI not restoring | Breakpoint in `restoreChrome()` — inspect `changedByFocusMode` ledger. Check if toggle commands are actually executing. |
| Escape not working | Check `when` clause in package.json. Open Keyboard Shortcuts editor in Dev Host → search "escape" → verify your binding is listed and its when clause evaluates to true. |
| Flickering on cursor move | Check debounce timer value. Increase from 16ms to 32ms. |

---

## 7. Definition of Done Checklist

### Must-Have (v1.0 Release Gate)

- [ ] **P0-01:** `focusMode.toggle` command enters and exits cleanly
- [ ] **P0-02:** All non-editor UI chrome hidden on enter, restored on exit
- [ ] **P0-03:** Dimming applied to all lines except cursor line
- [ ] **P0-04:** Cursor tracking — spotlight follows cursor movement in real-time
- [ ] **P0-05:** Multi-cursor — all cursor lines at full brightness
- [ ] **P0-06:** Escape exits focus mode (only when no overlay widgets active)
- [ ] **P0-07:** Single editor group enforcement when `singleEditorOnly = true`
- [ ] **P0-08:** Config settings respected: opacity, lineNumbers, fullScreen, centerLayout, hideMinimap
- [ ] **P0-09:** New file opened during focus mode gets decorations
- [ ] **P0-10:** Last editor closed → auto-exit focus mode
- [ ] **P0-11:** All automated tests pass
- [ ] **P0-12:** Manual test matrix (M1–M16) passes
- [ ] **P0-13:** Works with Dark+, Light+, and High Contrast themes
- [ ] **P0-14:** Change ledger restores only what was changed
- [ ] **P0-15:** No console errors or warnings during normal usage

### Should-Have (v1.0 Nice-to-Have)

- [ ] **P1-01:** Crash recovery via `globalState` marker
- [ ] **P1-02:** Configuration change while active updates decorations live
- [ ] **P1-03:** Editor title bar icon to toggle focus mode
- [ ] **P1-04:** README with screenshots and GIF demo
- [ ] **P1-05:** CHANGELOG.md populated

### Won't-Have (v1.0 — Future Backlog)

- [ ] Paragraph mode
- [ ] Smooth opacity transitions / animations
- [ ] Typewriter mode (cursor always vertically centered)
- [ ] Session timer
- [ ] Custom background color

---

## Appendix A: Risk Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Toggle commands desync (user toggles activity bar mid-focus) | Activity bar may be incorrectly toggled on exit | Accept for v1.0; document behavior. v1.1: add periodic state reconciliation. |
| VS Code API changes break decorations | Extension stops working | Pin `engines.vscode` to `^1.85.0`, test on latest Insiders before release |
| esbuild bundling drops vscode import | Extension fails to load | Use `external: ['vscode']` in esbuild config (standard practice) |
| Large file causes decoration lag | Poor UX on huge files | Ranges are O(1) — VS Code handles natively. No risk unless file has 1M+ lines. |
| Race condition: rapid toggle during async hideChrome | Inconsistent state | Add `isTransitioning` guard in `FocusMode.toggle()` |

## Appendix B: Quick-Start Commands (After Scaffold)

```powershell
# Install dependencies
npm install

# Start watch mode (auto-recompile on save)
npm run watch

# Launch Extension Development Host (or just press F5)
# → A new VS Code window opens with your extension loaded

# Run automated tests
npm test

# Package for distribution
npx vsce package
```
