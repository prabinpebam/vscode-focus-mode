import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        `--user-data-dir=${path.resolve(__dirname, '../../.vscode-test/test-user-data')}`,
        `--extensions-dir=${path.resolve(__dirname, '../../.vscode-test/test-extensions')}`,
        '--disable-extensions',
        '--disable-gpu',
      ],
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
