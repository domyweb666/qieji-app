// 茄子火柴人的姿勢計算（2026-11-15）：數字要跟多米的動作庫網頁一樣
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIG, basePose, poseAt, frameOf } from '../src/lib/stick.ts';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} 應該約等於 ${b}`);

test('站姿：八個關節角度跟動作庫一樣', () => {
  const p = basePose();
  assert.deepEqual([p.lS, p.lE, p.rS, p.rE, p.lH, p.lK, p.rH, p.rK], [-38, 143, 38, -143, -14, 0, 14, 0]);
});

test('待機 t=0：只有眨眼前的眼睛高度，其他是站姿', () => {
  const p = poseAt('idle', 0);
  assert.equal(p.eyeH, 12);
  near(p.lean, 0); near(p.sh, 0);
  assert.equal(poseAt('idle', 3.5).eyeH, 1.5); // 每 3.6 秒眨一下
});

test('揮手：右手舉高、手肘在 40 上下擺 22', () => {
  assert.equal(poseAt('wave', 0).rS, 110);
  near(poseAt('wave', 0).rE, 40);
  near(poseAt('wave', Math.PI / 18).rE, 62);
});

test('指向四個方向各有自己的手', () => {
  assert.equal(poseAt('point', 0, 'right').rS, 92);
  assert.equal(poseAt('point', 0, 'left').lS, -92);
  assert.equal(poseAt('point', 0, 'up').rE, 62);
  assert.equal(poseAt('point', 0, 'down').rS, 30);
});

test('座標：站直時脖子在髖的正上方、腳踩在地上', () => {
  const f = frameOf(basePose());
  near(f.neckX, RIG.hipX); near(f.neckY, RIG.hipY - RIG.torso);
  near(f.lAy, RIG.hipY + (RIG.thigh + RIG.shin) * Math.cos(14 * Math.PI / 180));
  assert.ok(f.lAx < RIG.hipX && f.rAx > RIG.hipX);
  near(f.rAx - RIG.hipX, RIG.hipX - f.lAx); // 左右對稱
  assert.equal(f.mouth, 0); assert.equal(f.bodySy, 1);
});

test('慶祝：跳起來時髖離地、影子變小的量大於 0；落地那段會壓扁', () => {
  const up = frameOf(poseAt('cheer', 0.72 * 0.4));
  assert.ok(up.hipY < RIG.hipY && up.lift > 0);
  const land = frameOf(poseAt('cheer', 0.72 * 0.9));
  assert.ok(land.bodySy < 1 && land.lift === 0);
  assert.equal(land.happy, 1);
});
