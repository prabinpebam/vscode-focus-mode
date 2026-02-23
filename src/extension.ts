import * as vscode from 'vscode';
import { FocusMode } from './focusMode';

let focusMode: FocusMode | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  focusMode = new FocusMode(context);

  // Run crash recovery (restores settings if VS Code was killed while active)
  await focusMode.crashRecovery();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('focusMode.toggle', () => focusMode?.toggle()),
    vscode.commands.registerCommand('focusMode.exit', () => focusMode?.exit())
  );
}

export async function deactivate(): Promise<void> {
  if (focusMode) {
    await focusMode.dispose();
    focusMode = undefined;
  }
}
