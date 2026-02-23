import * as vscode from 'vscode';
import { getConfig, FocusModeConfig } from './config';
import { DecorationManager } from './decorationManager';
import { UIManager } from './uiManager';

/**
 * Core Focus Mode state machine.
 *
 * States: inactive → entering → active → exiting → inactive
 *
 * The `isTransitioning` guard prevents re-entrant toggle calls
 * from corrupting state during async enter/exit sequences.
 */
export class FocusMode {
  private isActive = false;
  private isTransitioning = false;
  private decorationManager: DecorationManager;
  private uiManager: UIManager;
  private disposables: vscode.Disposable[] = [];
  private selectionDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private context: vscode.ExtensionContext) {
    const config = getConfig();
    this.decorationManager = new DecorationManager(config.opacity);
    this.uiManager = new UIManager();
  }

  /** Toggle focus mode on or off. Guarded against re-entrant calls. */
  async toggle(): Promise<void> {
    if (this.isTransitioning) { return; }
    if (this.isActive) {
      await this.exit();
    } else {
      await this.enter();
    }
  }

  /** Enter focus mode. */
  async enter(): Promise<void> {
    if (this.isActive || this.isTransitioning) { return; }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Focus Mode: No active editor to focus.');
      return;
    }

    this.isTransitioning = true;
    try {
      const config = getConfig();

      // Recreate decoration in case opacity changed since construction
      this.decorationManager.recreate(config.opacity);

      // 1. Enforce single editor group
      if (config.singleEditorOnly) {
        await this.uiManager.enforceSingleEditorGroup();
      }

      // 2. Hide UI chrome (with rollback on failure)
      await this.uiManager.hideChrome(config);

      // 3. Apply line numbers policy
      this.uiManager.applyLineNumbers(editor, config);

      // 4. Apply dimming decorations
      this.decorationManager.updateDecorations(editor);

      // 5. Set context key
      await vscode.commands.executeCommand('setContext', 'focusMode.active', true);

      // 6. Write crash-recovery marker
      this.context.globalState.update('focusMode.wasActive', true);

      // 7. Register event listeners
      this.registerListeners(config);

      this.isActive = true;
    } catch (err) {
      // enter failed — UIManager already rolled back chrome in hideChrome's catch
      await vscode.commands.executeCommand('setContext', 'focusMode.active', false);
      vscode.window.showErrorMessage(`Focus Mode: Failed to enter — ${err}`);
    } finally {
      this.isTransitioning = false;
    }
  }

  /** Exit focus mode and restore everything. */
  async exit(): Promise<void> {
    if (!this.isActive || this.isTransitioning) { return; }

    this.isTransitioning = true;
    try {
      // 1. Clear debounce timer
      if (this.selectionDebounceTimer) {
        clearTimeout(this.selectionDebounceTimer);
        this.selectionDebounceTimer = undefined;
      }

      // 2. Dispose event listeners
      this.disposeListeners();

      // 3. Clear decorations on all visible editors
      for (const editor of vscode.window.visibleTextEditors) {
        this.decorationManager.clearDecorations(editor);
        this.uiManager.restoreLineNumbers(editor);
      }

      // 4. Restore UI chrome
      await this.uiManager.restoreChrome();

      // 5. Clear context key
      await vscode.commands.executeCommand('setContext', 'focusMode.active', false);

      // 6. Clear crash-recovery marker
      this.context.globalState.update('focusMode.wasActive', false);

      this.isActive = false;
    } catch (err) {
      vscode.window.showErrorMessage(`Focus Mode: Error during exit — ${err}`);
    } finally {
      this.isTransitioning = false;
    }
  }

  /** Get the current activation state. */
  get active(): boolean {
    return this.isActive;
  }

  /** Clean up all resources. If active, exit first. */
  async dispose(): Promise<void> {
    if (this.isActive) {
      await this.exit();
    }
    this.decorationManager.dispose();
  }

  /**
   * Run crash-recovery on activation: if the extension was active when
   * VS Code was killed, settings may be stuck. Restore them.
   */
  async crashRecovery(): Promise<void> {
    const wasActive = this.context.globalState.get<boolean>('focusMode.wasActive', false);
    if (wasActive) {
      // Force a restore cycle to clean up any stuck settings
      try {
        await this.uiManager.restoreChrome();
      } catch {
        // best-effort
      }
      await this.context.globalState.update('focusMode.wasActive', false);
      await vscode.commands.executeCommand('setContext', 'focusMode.active', false);
    }
  }

  // ── Private: Event Listeners ──────────────────────────────────

  private registerListeners(config: FocusModeConfig): void {
    // Cursor movement → update spotlight (debounced)
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        this.onSelectionChange(e);
      })
    );

    // Active editor change → reapply decorations + line numbers
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.onActiveEditorChange(editor, config);
      })
    );

    // All visible editors closed → auto-exit
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        if (editors.length === 0 && this.isActive) {
          this.exit();
        }
      })
    );

    // Configuration change → update decorations live
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('focusMode')) {
          this.onConfigChange();
        }
      })
    );
  }

  private onSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {
    if (this.selectionDebounceTimer) {
      clearTimeout(this.selectionDebounceTimer);
    }
    this.selectionDebounceTimer = setTimeout(() => {
      if (this.isActive) {
        this.decorationManager.updateDecorations(e.textEditor);
      }
    }, 16);
  }

  private onActiveEditorChange(
    editor: vscode.TextEditor | undefined,
    config: FocusModeConfig
  ): void {
    if (!editor || !this.isActive) { return; }

    // Reapply line-number policy for the new editor
    this.uiManager.applyLineNumbers(editor, config);

    // Reapply dimming
    this.decorationManager.updateDecorations(editor);
  }

  private onConfigChange(): void {
    if (!this.isActive) { return; }

    const config = getConfig();
    this.decorationManager.recreate(config.opacity);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.decorationManager.updateDecorations(editor);
      this.uiManager.applyLineNumbers(editor, config);
    }
  }

  private disposeListeners(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
