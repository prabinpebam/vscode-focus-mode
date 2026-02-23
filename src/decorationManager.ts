import * as vscode from 'vscode';

/**
 * Manages the dimming decoration that creates the "spotlight" effect.
 *
 * Strategy: one TextEditorDecorationType with reduced opacity is applied
 * to all lines EXCEPT the lines where cursors are positioned.
 */
export class DecorationManager {
  private dimDecoration: vscode.TextEditorDecorationType;

  constructor(opacity: number) {
    this.dimDecoration = vscode.window.createTextEditorDecorationType({
      opacity: String(opacity),
      isWholeLine: true,
    });
  }

  /**
   * Recompute and apply dimmed ranges for the given editor.
   * All lines except cursor lines get the dim decoration.
   */
  updateDecorations(editor: vscode.TextEditor): void {
    const totalLines = editor.document.lineCount;
    if (totalLines === 0) {
      editor.setDecorations(this.dimDecoration, []);
      return;
    }

    const cursorLines = DecorationManager.getCursorLines(editor);
    const dimmedRanges = DecorationManager.computeDimmedRanges(cursorLines, totalLines);
    editor.setDecorations(this.dimDecoration, dimmedRanges);
  }

  /** Remove all dimming decorations from the given editor. */
  clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.dimDecoration, []);
  }

  /** Recreate the decoration type with a new opacity (e.g. after config change). */
  recreate(opacity: number): void {
    this.dimDecoration.dispose();
    this.dimDecoration = vscode.window.createTextEditorDecorationType({
      opacity: String(opacity),
      isWholeLine: true,
    });
  }

  dispose(): void {
    this.dimDecoration.dispose();
  }

  // ── Pure helpers (static for testability) ──────────────────────────

  /**
   * Extract unique, sorted cursor line numbers from an editor.
   */
  static getCursorLines(editor: vscode.TextEditor): number[] {
    const lines = new Set<number>();
    for (const sel of editor.selections) {
      lines.add(sel.active.line);
    }
    return Array.from(lines).sort((a, b) => a - b);
  }

  /**
   * Given sorted cursor lines and total line count, compute the ranges
   * that should be dimmed (everything NOT a cursor line).
   *
   * Returns an array of Range objects covering the gap lines.
   *
   * @param cursorLines Sorted array of 0-based line numbers where cursors sit.
   * @param totalLines  Total number of lines in the document.
   */
  static computeDimmedRanges(cursorLines: number[], totalLines: number): vscode.Range[] {
    if (totalLines === 0) { return []; }

    const ranges: vscode.Range[] = [];
    let nextStart = 0;

    for (const cursorLine of cursorLines) {
      if (cursorLine > nextStart) {
        // Gap before this cursor line
        ranges.push(new vscode.Range(nextStart, 0, cursorLine - 1, Number.MAX_SAFE_INTEGER));
      }
      nextStart = cursorLine + 1;
    }

    // Gap after the last cursor line
    if (nextStart < totalLines) {
      ranges.push(new vscode.Range(nextStart, 0, totalLines - 1, Number.MAX_SAFE_INTEGER));
    }

    return ranges;
  }
}
