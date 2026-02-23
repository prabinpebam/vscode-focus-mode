import * as vscode from 'vscode';
import { FocusModeConfig, toLineNumberStyle } from './config';

/**
 * Tracks which UI elements were changed by this Focus Mode session
 * so that only those are reversed on exit (deterministic restore).
 */
interface ChangedByFocusMode {
  sideBar: boolean;
  panel: boolean;
  statusBar: boolean;
  activityBar: boolean;
  fullScreen: boolean;
  centeredLayout: boolean;
  minimap: boolean;
  tabs: boolean;
  editorActions: boolean;
  breadcrumbs: boolean;
  menuBar: boolean;
  layoutControl: boolean;
  lineNumbers: boolean;
  zoom: boolean;
}

/**
 * Snapshot of settings-backed UI state (deterministic tier).
 * These can be read before changing and precisely restored.
 */
interface SettingsSnapshot {
  minimapEnabled: boolean | undefined;
  showTabs: string | undefined;
  editorActionsLocation: string | undefined;
  breadcrumbsEnabled: boolean | undefined;
  menuBarVisibility: string | undefined;
  layoutControlEnabled: boolean | undefined;
  lineNumbers: string | undefined;
  zoomLevel: number | undefined;
  zoomPerWindow: boolean | undefined;
}

/**
 * Manages hiding and restoring VS Code UI chrome.
 *
 * Two restoration tiers:
 * 1. **Deterministic** (settings-backed): minimap, tabs, breadcrumbs, line numbers
 *    — snapshot exact values, write, restore from snapshot.
 * 2. **Best-effort** (command toggles): sidebar, panel, activity bar, status bar, fullscreen
 *    — record what we changed, reverse only those on exit.
 */
export class UIManager {
  private changed: ChangedByFocusMode = this.freshLedger();
  private settingsSnapshot: SettingsSnapshot = {
    minimapEnabled: undefined,
    showTabs: undefined,
    editorActionsLocation: undefined,
    breadcrumbsEnabled: undefined,
    menuBarVisibility: undefined,
    layoutControlEnabled: undefined,
    lineNumbers: undefined,
    zoomLevel: undefined,
    zoomPerWindow: undefined,
  };
  /** Tracks how many hide steps succeeded so rollback can undo them. */
  private hideStepsCompleted = 0;
  /** globalState memento for persisting focus-mode zoom level across sessions. */
  private globalState: vscode.Memento;

  constructor(globalState: vscode.Memento) {
    this.globalState = globalState;
  }

  /**
   * Hide all non-editor UI chrome based on config.
   * Records what was changed for precise restoration.
   *
   * If any step fails, previously applied steps are rolled back.
   */
  async hideChrome(config: FocusModeConfig): Promise<void> {
    this.changed = this.freshLedger();
    this.hideStepsCompleted = 0;

    try {
      // ── Deterministic tier: snapshot then write settings ──────────

      // Minimap
      if (config.hideMinimap) {
        const editorCfg = vscode.workspace.getConfiguration('editor.minimap');
        this.settingsSnapshot.minimapEnabled = editorCfg.get<boolean>('enabled');
        if (this.settingsSnapshot.minimapEnabled !== false) {
          await editorCfg.update('enabled', false, vscode.ConfigurationTarget.Global);
          this.changed.minimap = true;
        }
      }
      this.hideStepsCompleted++;

      // Tabs
      {
        const wbCfg = vscode.workspace.getConfiguration('workbench.editor');
        this.settingsSnapshot.showTabs = wbCfg.get<string>('showTabs');
        if (this.settingsSnapshot.showTabs !== 'none') {
          await wbCfg.update('showTabs', 'none', vscode.ConfigurationTarget.Global);
          this.changed.tabs = true;
        }
      }
      this.hideStepsCompleted++;

      // Editor actions bar (split/close/... icons at top of editor group)
      {
        const wbCfg = vscode.workspace.getConfiguration('workbench.editor');
        this.settingsSnapshot.editorActionsLocation = wbCfg.get<string>('editorActionsLocation');
        if (this.settingsSnapshot.editorActionsLocation !== 'hidden') {
          await wbCfg.update('editorActionsLocation', 'hidden', vscode.ConfigurationTarget.Global);
          this.changed.editorActions = true;
        }
      }
      this.hideStepsCompleted++;

      // Breadcrumbs
      {
        const bcCfg = vscode.workspace.getConfiguration('breadcrumbs');
        this.settingsSnapshot.breadcrumbsEnabled = bcCfg.get<boolean>('enabled');
        if (this.settingsSnapshot.breadcrumbsEnabled !== false) {
          await bcCfg.update('enabled', false, vscode.ConfigurationTarget.Global);
          this.changed.breadcrumbs = true;
        }
      }
      this.hideStepsCompleted++;

      // Menu bar (title bar with File/Edit/View etc.)
      {
        const winCfg = vscode.workspace.getConfiguration('window');
        this.settingsSnapshot.menuBarVisibility = winCfg.get<string>('menuBarVisibility');
        if (this.settingsSnapshot.menuBarVisibility !== 'hidden') {
          await winCfg.update('menuBarVisibility', 'hidden', vscode.ConfigurationTarget.Global);
          this.changed.menuBar = true;
        }
      }
      this.hideStepsCompleted++;

      // Layout controls (split/grid/layout icons in the title bar area)
      {
        const wbCfg = vscode.workspace.getConfiguration('workbench.layoutControl');
        this.settingsSnapshot.layoutControlEnabled = wbCfg.get<boolean>('enabled');
        if (this.settingsSnapshot.layoutControlEnabled !== false) {
          await wbCfg.update('enabled', false, vscode.ConfigurationTarget.Global);
          this.changed.layoutControl = true;
        }
      }
      this.hideStepsCompleted++;

      // Zoom level — maintain separate zoom for focus mode vs normal mode.
      //
      // IMPORTANT: Since VS Code 1.86, `window.zoomPerWindow` is ON by default.
      // When enabled, Ctrl+=/- only change a per-window zoom that is NOT
      // reflected in the `window.zoomLevel` setting.  The per-window zoom
      // *overrides* the setting for that window.
      //
      // Ordering is critical:
      //   1. Snapshot `window.zoomLevel` and `window.zoomPerWindow`.
      //   2. While zoomPerWindow is still true, call zoomReset to clear
      //      any per-window override (with zoomPerWindow=true, zoomReset
      //      clears the override and syncs to the setting — safe).
      //   3. Disable `window.zoomPerWindow` so future Ctrl+=/- writes
      //      directly to the setting (lets us read true zoom on exit).
      //   4. Write saved focus zoom into `window.zoomLevel` LAST.
      //      With zoomPerWindow=false, this immediately takes effect.
      //      Do NOT call zoomReset after this — when zoomPerWindow is
      //      false, zoomReset resets window.zoomLevel to 0!
      {
        const winCfg = vscode.workspace.getConfiguration('window');
        const currentZoom = winCfg.get<number>('zoomLevel') ?? 0;
        this.settingsSnapshot.zoomLevel = currentZoom;
        this.settingsSnapshot.zoomPerWindow = winCfg.get<boolean>('zoomPerWindow');

        // Step 2: clear per-window override while zoomPerWindow is still true
        await vscode.commands.executeCommand('workbench.action.zoomReset');

        // Step 3: disable zoomPerWindow so Ctrl+=/- goes to the setting
        if (this.settingsSnapshot.zoomPerWindow !== false) {
          await winCfg.update('zoomPerWindow', false, vscode.ConfigurationTarget.Global);
        }

        // Step 4: apply saved focus zoom LAST (no zoomReset after this!)
        const savedFocusZoom = this.globalState.get<number>('focusMode.focusZoomLevel');
        if (savedFocusZoom !== undefined && savedFocusZoom !== currentZoom) {
          await winCfg.update('zoomLevel', savedFocusZoom, vscode.ConfigurationTarget.Global);
          this.changed.zoom = true;
        }
      }
      this.hideStepsCompleted++;

      // ── Best-effort tier: commands ────────────────────────────────

      // Sidebar (close is idempotent)
      await vscode.commands.executeCommand('workbench.action.closeSidebar');
      this.changed.sideBar = true;
      this.hideStepsCompleted++;

      // Panel (close is idempotent)
      await vscode.commands.executeCommand('workbench.action.closePanel');
      this.changed.panel = true;
      this.hideStepsCompleted++;

      // Activity bar (toggle — no state query available)
      await vscode.commands.executeCommand('workbench.action.toggleActivityBarVisibility');
      this.changed.activityBar = true;
      this.hideStepsCompleted++;

      // Status bar (toggle — no state query available)
      await vscode.commands.executeCommand('workbench.action.toggleStatusbarVisibility');
      this.changed.statusBar = true;
      this.hideStepsCompleted++;

      // Full screen
      if (config.fullScreen) {
        await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
        this.changed.fullScreen = true;
      }
      this.hideStepsCompleted++;

      // Center layout
      if (config.centerLayout) {
        await vscode.commands.executeCommand('workbench.action.toggleCenteredLayout');
        this.changed.centeredLayout = true;
      }
      this.hideStepsCompleted++;
    } catch (err) {
      // Rollback whatever was already applied
      await this.restoreChromePartial();
      throw err;
    }
  }

  /**
   * Restore only the UI elements that were changed by this focus mode session.
   */
  async restoreChrome(): Promise<void> {
    // ── Deterministic tier: restore exact settings values ────────

    if (this.changed.minimap && this.settingsSnapshot.minimapEnabled !== undefined) {
      const editorCfg = vscode.workspace.getConfiguration('editor.minimap');
      await editorCfg.update('enabled', this.settingsSnapshot.minimapEnabled, vscode.ConfigurationTarget.Global);
    }

    if (this.changed.tabs && this.settingsSnapshot.showTabs !== undefined) {
      const wbCfg = vscode.workspace.getConfiguration('workbench.editor');
      await wbCfg.update('showTabs', this.settingsSnapshot.showTabs, vscode.ConfigurationTarget.Global);
    }

    if (this.changed.editorActions && this.settingsSnapshot.editorActionsLocation !== undefined) {
      const wbCfg = vscode.workspace.getConfiguration('workbench.editor');
      await wbCfg.update('editorActionsLocation', this.settingsSnapshot.editorActionsLocation, vscode.ConfigurationTarget.Global);
    }

    if (this.changed.breadcrumbs && this.settingsSnapshot.breadcrumbsEnabled !== undefined) {
      const bcCfg = vscode.workspace.getConfiguration('breadcrumbs');
      await bcCfg.update('enabled', this.settingsSnapshot.breadcrumbsEnabled, vscode.ConfigurationTarget.Global);
    }

    if (this.changed.menuBar && this.settingsSnapshot.menuBarVisibility !== undefined) {
      const winCfg = vscode.workspace.getConfiguration('window');
      await winCfg.update('menuBarVisibility', this.settingsSnapshot.menuBarVisibility, vscode.ConfigurationTarget.Global);
    }

    if (this.changed.layoutControl && this.settingsSnapshot.layoutControlEnabled !== undefined) {
      const wbCfg = vscode.workspace.getConfiguration('workbench.layoutControl');
      await wbCfg.update('enabled', this.settingsSnapshot.layoutControlEnabled, vscode.ConfigurationTarget.Global);
    }

    // Zoom level — save current (focus-mode) zoom, restore normal-mode zoom.
    //
    // Because we disabled zoomPerWindow on enter, Ctrl+=/- during focus mode
    // wrote directly to window.zoomLevel.  We can now read the true zoom.
    //
    // Ordering:
    //   1. Read window.zoomLevel — accurate since zoomPerWindow was false.
    //   2. Persist it as focus-mode zoom for next session.
    //   3. Write normal-mode zoom back to window.zoomLevel.
    //   4. Restore zoomPerWindow to original (typically true).
    //   5. Call zoomReset AFTER restoring zoomPerWindow — with
    //      zoomPerWindow=true this safely clears any stale per-window
    //      override and the window adopts the setting value.
    {
      const winCfg = vscode.workspace.getConfiguration('window');
      const currentZoom = winCfg.get<number>('zoomLevel') ?? 0;

      // Step 2: persist focus-mode zoom
      await this.globalState.update('focusMode.focusZoomLevel', currentZoom);

      // Step 3: restore normal-mode zoom
      if (this.settingsSnapshot.zoomLevel !== undefined
          && currentZoom !== this.settingsSnapshot.zoomLevel) {
        await winCfg.update('zoomLevel', this.settingsSnapshot.zoomLevel, vscode.ConfigurationTarget.Global);
      }

      // Step 4: restore zoomPerWindow BEFORE zoomReset
      if (this.settingsSnapshot.zoomPerWindow !== undefined
          && this.settingsSnapshot.zoomPerWindow !== false) {
        await winCfg.update('zoomPerWindow', this.settingsSnapshot.zoomPerWindow, vscode.ConfigurationTarget.Global);
      }

      // Step 5: zoomReset with zoomPerWindow=true clears per-window override safely
      await vscode.commands.executeCommand('workbench.action.zoomReset');
    }

    // ── Best-effort tier: reverse toggle commands ────────────────

    if (this.changed.centeredLayout) {
      await vscode.commands.executeCommand('workbench.action.toggleCenteredLayout');
    }

    if (this.changed.fullScreen) {
      await vscode.commands.executeCommand('workbench.action.toggleFullScreen');
    }

    if (this.changed.statusBar) {
      await vscode.commands.executeCommand('workbench.action.toggleStatusbarVisibility');
    }

    if (this.changed.activityBar) {
      await vscode.commands.executeCommand('workbench.action.toggleActivityBarVisibility');
    }

    if (this.changed.panel) {
      await vscode.commands.executeCommand('workbench.action.togglePanel');
    }

    if (this.changed.sideBar) {
      await vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
    }

    // Reset ledger
    this.changed = this.freshLedger();
  }

  /**
   * Collapse all editor groups into one.
   * Throws if the operation fails.
   */
  async enforceSingleEditorGroup(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.joinAllGroups');
  }

  /**
   * Apply line-number style to the given editor.
   */
  applyLineNumbers(editor: vscode.TextEditor, config: FocusModeConfig): void {
    const style = toLineNumberStyle(config.lineNumbers);
    if (style !== undefined) {
      // Save the original line numbers setting on first call
      if (!this.changed.lineNumbers) {
        const editorCfg = vscode.workspace.getConfiguration('editor');
        this.settingsSnapshot.lineNumbers = editorCfg.get<string>('lineNumbers');
        this.changed.lineNumbers = true;
      }
      editor.options = { lineNumbers: style };
    }
  }

  /**
   * Restore line numbers on the given editor.
   */
  restoreLineNumbers(editor: vscode.TextEditor): void {
    if (this.changed.lineNumbers && this.settingsSnapshot.lineNumbers !== undefined) {
      // Map string back to enum
      const map: Record<string, vscode.TextEditorLineNumbersStyle> = {
        'off': vscode.TextEditorLineNumbersStyle.Off,
        'on': vscode.TextEditorLineNumbersStyle.On,
        'relative': vscode.TextEditorLineNumbersStyle.Relative,
      };
      const style = map[this.settingsSnapshot.lineNumbers] ?? vscode.TextEditorLineNumbersStyle.On;
      editor.options = { lineNumbers: style };
    }
  }

  // ── Private ────────────────────────────────────────────────────

  /** Rollback after a partial failure in hideChrome. */
  private async restoreChromePartial(): Promise<void> {
    try {
      await this.restoreChrome();
    } catch {
      // Best-effort: swallow errors during rollback
    }
  }

  private freshLedger(): ChangedByFocusMode {
    return {
      sideBar: false,
      panel: false,
      statusBar: false,
      activityBar: false,
      fullScreen: false,
      centeredLayout: false,
      minimap: false,
      tabs: false,
      editorActions: false,
      breadcrumbs: false,
      menuBar: false,
      layoutControl: false,
      lineNumbers: false,
      zoom: false,
    };
  }
}
