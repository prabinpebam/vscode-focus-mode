import * as assert from 'assert';
import * as vscode from 'vscode';
import { DecorationManager } from '../../decorationManager';

suite('DecorationManager', () => {
  suite('computeDimmedRanges', () => {
    test('cursor in middle dims top and bottom', () => {
      const ranges = DecorationManager.computeDimmedRanges([5], 10);
      assert.strictEqual(ranges.length, 2);
      // Top range: lines 0–4
      assert.strictEqual(ranges[0].start.line, 0);
      assert.strictEqual(ranges[0].end.line, 4);
      // Bottom range: lines 6–9
      assert.strictEqual(ranges[1].start.line, 6);
      assert.strictEqual(ranges[1].end.line, 9);
    });

    test('cursor at first line dims only below', () => {
      const ranges = DecorationManager.computeDimmedRanges([0], 10);
      assert.strictEqual(ranges.length, 1);
      assert.strictEqual(ranges[0].start.line, 1);
      assert.strictEqual(ranges[0].end.line, 9);
    });

    test('cursor at last line dims only above', () => {
      const ranges = DecorationManager.computeDimmedRanges([9], 10);
      assert.strictEqual(ranges.length, 1);
      assert.strictEqual(ranges[0].start.line, 0);
      assert.strictEqual(ranges[0].end.line, 8);
    });

    test('multi-cursor dims gaps between cursors', () => {
      const ranges = DecorationManager.computeDimmedRanges([2, 5, 8], 10);
      // Expected: 0–1, 3–4, 6–7, 9
      assert.strictEqual(ranges.length, 4);
      assert.strictEqual(ranges[0].start.line, 0);
      assert.strictEqual(ranges[0].end.line, 1);
      assert.strictEqual(ranges[1].start.line, 3);
      assert.strictEqual(ranges[1].end.line, 4);
      assert.strictEqual(ranges[2].start.line, 6);
      assert.strictEqual(ranges[2].end.line, 7);
      assert.strictEqual(ranges[3].start.line, 9);
      assert.strictEqual(ranges[3].end.line, 9);
    });

    test('single-line file with cursor on it returns no dimmed ranges', () => {
      const ranges = DecorationManager.computeDimmedRanges([0], 1);
      assert.strictEqual(ranges.length, 0);
    });

    test('empty file returns no ranges', () => {
      const ranges = DecorationManager.computeDimmedRanges([], 0);
      assert.strictEqual(ranges.length, 0);
    });

    test('adjacent cursors produce no gap between them', () => {
      const ranges = DecorationManager.computeDimmedRanges([3, 4, 5], 10);
      // Expected: 0–2, 6–9
      assert.strictEqual(ranges.length, 2);
      assert.strictEqual(ranges[0].start.line, 0);
      assert.strictEqual(ranges[0].end.line, 2);
      assert.strictEqual(ranges[1].start.line, 6);
      assert.strictEqual(ranges[1].end.line, 9);
    });
  });
});
