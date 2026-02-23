import * as vscode from 'vscode';

/** Typed configuration for Focus Mode. */
export interface FocusModeConfig {
  /** Opacity for non-focused lines (0.1–0.9). */
  opacity: number;
  /** Line number visibility: off, on, relative, or inherit. */
  lineNumbers: 'off' | 'on' | 'relative' | 'inherit';
  /** Whether to enter full-screen on activation. */
  fullScreen: boolean;
  /** Whether to center the editor layout. */
  centerLayout: boolean;
  /** Whether to hide the minimap. */
  hideMinimap: boolean;
  /** Whether to collapse to a single editor group. */
  singleEditorOnly: boolean;
}

/**
 * Reads the current Focus Mode configuration from VS Code settings.
 * Returns typed defaults for any missing/invalid values.
 */
export function getConfig(): FocusModeConfig {
  const cfg = vscode.workspace.getConfiguration('focusMode');

  let opacity = cfg.get<number>('opacity', 0.5);
  if (opacity < 0.1) { opacity = 0.1; }
  if (opacity > 0.9) { opacity = 0.9; }

  return {
    opacity,
    lineNumbers: cfg.get<FocusModeConfig['lineNumbers']>('lineNumbers', 'off'),
    fullScreen: cfg.get<boolean>('fullScreen', true),
    centerLayout: cfg.get<boolean>('centerLayout', true),
    hideMinimap: cfg.get<boolean>('hideMinimap', true),
    singleEditorOnly: cfg.get<boolean>('singleEditorOnly', true),
  };
}

/**
 * Maps our config lineNumbers value to the VS Code TextEditorLineNumbersStyle enum.
 * Returns undefined for 'inherit' (meaning don't change the user's setting).
 */
export function toLineNumberStyle(
  value: FocusModeConfig['lineNumbers']
): vscode.TextEditorLineNumbersStyle | undefined {
  switch (value) {
    case 'off': return vscode.TextEditorLineNumbersStyle.Off;
    case 'on': return vscode.TextEditorLineNumbersStyle.On;
    case 'relative': return vscode.TextEditorLineNumbersStyle.Relative;
    case 'inherit': return undefined;
  }
}
