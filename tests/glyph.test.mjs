// 磚上的字（2026-11-04）：超過一個字當頁擋下；emoji 看起來一個就算一個，不能被擋、也不能被切成半個
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glyphProblem, graphemes, setGlyph } from '../src/lib/model.ts';

const paper = () => ({ id: 'p', type: 'check', title: '', body: '', items: [], bin: [], color: 'yellow', pinned: false, deleted: false, created: 1, updated: 1, b: true });

test('看起來一個字的都算一個', () => {
  for (const s of ['茄', 'a', '😀', '❤️', '🇹🇼', '👍🏽', '👨‍👩‍👧', '1️⃣', 'é']) {
    assert.equal(graphemes(s).length, 1, s);
    assert.equal(glyphProblem(s), null, s);
  }
});

test('超過一個字要擋，講清楚現在有幾個', () => {
  assert.equal(glyphProblem('茄子'), '只能打一個字，現在有 2 個');
  assert.equal(glyphProblem('abc'), '只能打一個字，現在有 3 個');
  assert.equal(glyphProblem('😀😀'), '只能打一個字，現在有 2 個');
  assert.equal(glyphProblem('🇹🇼🇯🇵'), '只能打一個字，現在有 2 個');
});

test('清空、前後空白不算字', () => {
  assert.equal(glyphProblem(''), null);
  assert.equal(glyphProblem('   '), null);
  assert.equal(glyphProblem(' 茄 '), null);
});

test('存進去的是完整的 emoji，不是半個', () => {
  const n = paper();
  assert.equal(setGlyph(n, '❤️'), true);
  assert.equal(n.glyph, '❤️');
  assert.equal(setGlyph(n, '🇹🇼'), true);
  assert.equal(n.glyph, '🇹🇼');
  assert.equal(setGlyph(n, ''), true);
  assert.equal(n.glyph, undefined);
  assert.equal(setGlyph(n, ''), false);
});
