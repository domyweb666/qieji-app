// 單點提示：輸入框的 ✓（2026-11-15，多米選）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typedReturn, tipToShow } from '../src/lib/tip.ts';

test('按一下 Return（多一個換行）算', () => {
  assert.equal(typedReturn('買牛奶', '買牛奶\n'), true);
  assert.equal(typedReturn('買牛奶雞蛋', '買牛奶\n雞蛋'), true); // 游標在中間
  assert.equal(typedReturn('', '\n'), true);
  assert.equal(typedReturn('一\n二', '一\n二\n'), true); // 已經有換行，再按一次
});

test('打一般的字、刪字、沒變都不算', () => {
  assert.equal(typedReturn('買', '買牛'), false);
  assert.equal(typedReturn('買牛奶\n', '買牛奶'), false);
  assert.equal(typedReturn('買', '買'), false);
});

test('貼上一大段（裡面有換行）不算', () => {
  assert.equal(typedReturn('', '牛奶\n雞蛋\n吐司'), false);
  assert.equal(typedReturn('買', '買\n\n'), false);
});

test('看過了就不再冒', () => {
  assert.equal(tipToShow(false, '買牛奶', '買牛奶\n'), true);
  assert.equal(tipToShow(true, '買牛奶', '買牛奶\n'), false);
  assert.equal(tipToShow(false, '買', '買牛'), false);
});
