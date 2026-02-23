import * as assert from 'assert';
import * as vscode from 'vscode';

suite('FocusMode Integration', () => {
  test('toggle command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('focusMode.toggle'), 'focusMode.toggle should be registered');
    assert.ok(commands.includes('focusMode.exit'), 'focusMode.exit should be registered');
  });

  test('toggle enters and exits cleanly', async () => {
    // Open a temporary document
    const doc = await vscode.workspace.openTextDocument({
      content: 'line1\nline2\nline3\nline4\nline5',
      language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc);

    // Enter focus mode
    await vscode.commands.executeCommand('focusMode.toggle');

    // Small delay for async operations
    await delay(200);

    // Exit focus mode
    await vscode.commands.executeCommand('focusMode.toggle');

    await delay(200);

    // If we got here without throwing, enter/exit was clean
    assert.ok(true, 'Toggle cycle completed without error');
  });

  test('exit without enter is a no-op', async () => {
    // Should not throw
    await vscode.commands.executeCommand('focusMode.exit');
    assert.ok(true, 'Exit without active focus mode did not throw');
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
