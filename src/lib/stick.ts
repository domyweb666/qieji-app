// 茄子火柴人的姿勢（2026-11-15，照多米的《茄子火柴人動作庫》網頁原樣搬）：身體是八個關節角度，頭套是一張可以換的圖。
// 每個動作只是「角度隨時間怎麼變」的一組數字。0° 是垂直向下，正值往畫面右邊轉；手肘與膝蓋是相對於上一節的角度。
// 純計算，不碰畫面：測試直接跑；畫的在 components/Stickman.tsx，那邊每一格在動畫執行緒上算（所以每個函式都標 worklet）。
// 還沒搬的：思考的泡泡、打瞌睡的 Z、抓頭的汗、大慶祝的星星（動作本身都在，只少這些小道具）。

// 畫布與骨架（單位是動作庫的畫布點：寬 320，y 從 -50 到 400）
export const RIG = { hipX: 160, hipY: 260, ground: 380, thigh: 62, shin: 62, torso: 78, shoulderDrop: 12, shoulderHalf: 6, upper: 44, fore: 44, foot: 12 };
export const VIEW = { x: 0, y: -50, w: 320, h: 450 };

export type Mouth = 'smile' | 'open' | 'wavy' | 'o' | 'flat';
export type Dir = 'up' | 'right' | 'down' | 'left';
export type Pose = {
  rx: number; ry: number; lean: number; head: number; hy: number; sh: number;
  lS: number; lE: number; rS: number; rE: number; lH: number; lK: number; rH: number; rK: number;
  eyeH: number; lookX: number; lookY: number; brow: number; browY: number; squash: number;
  tl: number; hs: number; sx: number; mouth: Mouth; happy: number;
};
export type Act = 'idle' | 'wave' | 'point' | 'think' | 'cheer' | 'shrug' | 'oops' | 'bigcheer' | 'focus' | 'please' | 'bow' | 'sleep';

export function basePose(): Pose {
  'worklet';
  return { rx: 0, ry: 0, lean: 0, head: 0, hy: 0, sh: 0,
    lS: -38, lE: 143, rS: 38, rE: -143, lH: -14, lK: 0, rH: 14, rK: 0,
    eyeH: 12, lookX: 0, lookY: 0, brow: 2, browY: 0, squash: 0,
    tl: 1, hs: 1, sx: 1, mouth: 'smile', happy: 0 };
}
function ss(a: number, b: number, x: number) {
  'worklet';
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

// 每個動作回「跟站姿不一樣的那幾項」
export function actAt(name: Act, t: number, d: Dir): Partial<Pose> {
  'worklet';
  const sin = Math.sin, PI = Math.PI;
  switch (name) {
    case 'idle': {
      const b = sin(t * 2.2), tb = t % 3.6;
      return { sh: -1.2 * b, hy: -1.2 * b, lean: 1.4 * sin(t * 1.1), head: 1.5 * sin(t * 0.9), eyeH: tb > 3.46 ? 1.5 : 12 };
    }
    case 'wave':
      return { rS: 110, rE: 40 + 22 * sin(t * 9), lS: -16, lE: -6, head: 5 + 2 * sin(t * 4.5), lean: 2, brow: 5, browY: -1, mouth: 'smile', hy: -1 * sin(t * 4.5) };
    case 'point': {
      const k = sin(t * 5);
      if (d === 'right') return { brow: 4, rS: 92, rE: 0, lS: -40, lE: 100, lean: 3 + 1.5 * k, head: 3, lookX: 3 };
      if (d === 'left') return { brow: 4, lS: -92, lE: 0, rS: 40, rE: -100, lean: -3 - 1.5 * k, head: -3, lookX: -3 };
      if (d === 'up') return { brow: 4, rS: 105, rE: 62, lS: -40, lE: 100, hy: -1.5 * k, sh: -1.5 * k, head: -4, lookY: -3, lookX: 1 };
      return { brow: 4, rS: 30, rE: 8, lS: -40, lE: 100, lean: 2, head: 9 + 1.5 * k, lookY: 3.5, lookX: 2 };
    }
    case 'think':
      return { rS: 42, rE: 165, lS: -30, lE: 120, head: -8 + 1.5 * sin(t * 1.6), lean: -1.5, lookX: -2, lookY: -3, brow: 3, browY: -2, mouth: 'flat' };
    case 'cheer': {
      const P = 0.72, p = (t % P) / P, h = p < 0.8 ? sin(PI * p / 0.8) : 0, s = p >= 0.8 ? sin(PI * (p - 0.8) / 0.2) : 0, w = sin(t * 15);
      return { ry: -34 * h, squash: 0.07 * s, lS: -105, lE: -62 - 8 * w, rS: 105, rE: 62 + 8 * w,
        lH: -14 - 12 * h, lK: 34 * h, rH: 14 + 12 * h, rK: -34 * h, brow: -4, browY: -3, happy: 1, mouth: 'open', head: 3 * w * 0.3 };
    }
    case 'shrug': {
      const c = t % 2.4, u = ss(0, 0.3, c) * (1 - ss(1.5, 1.9, c));
      return { sh: -6 * u, lS: -16 - 14 * u, lE: -6 - 82 * u, rS: 16 + 14 * u, rE: 6 + 82 * u,
        head: 8 * u, brow: 2 - 12 * u, browY: -3 * u, mouth: u > 0.4 ? 'wavy' : 'smile', lookY: -1 * u };
    }
    case 'oops':
      return { rS: 112, rE: 45 + 7 * sin(t * 12), lS: -16, lE: -6, head: 9, lean: 2, brow: -12, browY: -1, lookY: 3, lookX: -1, mouth: 'wavy' };
    case 'bigcheer': {
      const P = 1.15, p = (t % P) / P, air = p < 0.72, q = p / 0.72, h = air ? sin(PI * q) : 0, s = air ? 0 : sin(PI * (p - 0.72) / 0.28), w = sin(t * 18);
      return { ry: -54 * h, squash: 0.09 * s, sx: air ? Math.cos(2 * PI * q) : 1, lS: -112, lE: -58 - 12 * w, rS: 112, rE: 58 + 12 * w,
        lH: -14 - 16 * h, lK: 44 * h, rH: 14 + 16 * h, rK: -44 * h, brow: -6, browY: -4, happy: 1, mouth: 'open' };
    }
    case 'focus': {
      const k = sin(t * 13), b = sin(t * 1.8);
      return { ry: 98, lH: -75, lK: 160, rH: 75, rK: -160, tl: 0.92, lS: -26, lE: 58 + 7 * k, rS: 26, rE: -58 + 7 * sin(t * 13 + 1.4),
        head: 4 + 1.2 * b, hy: 2, lookY: 4, eyeH: t % 4.2 > 4.05 ? 1.5 : 9, brow: 10, browY: 1, mouth: 'flat' };
    }
    case 'please': {
      const k = sin(t * 7);
      return { lS: -50, lE: 167, rS: 50, rE: -167, sh: -2 - 1.5 * k, hy: -1.5 * k, head: 7 + 1.5 * k, lean: 1, brow: -15, browY: -2, eyeH: 13, lookY: -1.5, mouth: 'o' };
    }
    case 'bow': {
      const c = t % 2.6, u = ss(0, 0.45, c) * (1 - ss(1.5, 2.0, c));
      return { lS: -12, lE: -4, rS: 12, rE: 4, tl: 1 - 0.3 * u, hs: 1 - 0.14 * u, hy: 8 * u, lookY: 6 * u, eyeH: 12 - 10.5 * ss(0.4, 0.8, u), brow: 2, browY: 2 * u };
    }
    default: { // sleep
      const n = sin(t * 1.4);
      return { head: 13 + 3 * n, lean: 3 + 0.8 * n, hy: 1, eyeH: 1.5, brow: 0, browY: 2, mouth: 'o', sh: -1 * n };
    }
  }
}

export function poseAt(name: Act, t: number, d: Dir = 'right'): Pose {
  'worklet';
  return { ...basePose(), ...actAt(name, t, d) };
}

// 畫面要的座標：姿勢 → 每一節的兩端、頭的位置與轉角、整隻的壓扁。全部是畫布點
export type Frame = Record<
  'hipX' | 'hipY' | 'neckX' | 'neckY' | 'lKx' | 'lKy' | 'lAx' | 'lAy' | 'lFx' | 'lFy' | 'rKx' | 'rKy' | 'rAx' | 'rAy' | 'rFx' | 'rFy'
  | 'lSx' | 'lSy' | 'lEx' | 'lEy' | 'lHx' | 'lHy' | 'rSx' | 'rSy' | 'rEx' | 'rEy' | 'rHx' | 'rHy'
  | 'headX' | 'headY' | 'headRot' | 'headSy' | 'bodySx' | 'bodySy' | 'lift'
  | 'eyeH' | 'lookX' | 'lookY' | 'brow' | 'browY' | 'happy' | 'mouth', number>;

const MOUTHS: Mouth[] = ['smile', 'open', 'wavy', 'o', 'flat'];
export const mouthIndex = (m: Mouth) => { 'worklet'; return MOUTHS.indexOf(m); };

export function frameOf(p: Pose): Frame {
  'worklet';
  const R = RIG, rad = Math.PI / 180;
  const dx = (a: number) => Math.sin(a * rad), dy = (a: number) => Math.cos(a * rad);
  const hipX = R.hipX + p.rx, hipY = R.hipY + p.ry;
  const up = 180 - p.lean, TL = R.torso * p.tl;
  const neckX = hipX + dx(up) * TL, neckY = hipY + dy(up) * TL;
  const shoX = hipX + dx(up) * (TL - R.shoulderDrop), shoY = hipY + dy(up) * (TL - R.shoulderDrop) + p.sh;
  const leg = (h: number, k: number, side: number) => {
    const kx = hipX + dx(h) * R.thigh, ky = hipY + dy(h) * R.thigh;
    const ax = kx + dx(h + k) * R.shin, ay = ky + dy(h + k) * R.shin;
    return [kx, ky, ax, ay, ax + side * R.foot, ay + 1];
  };
  const arm = (s: number, e: number, side: number) => {
    const sx = shoX + side * R.shoulderHalf;
    const ex = sx + dx(s) * R.upper, ey = shoY + dy(s) * R.upper;
    return [sx, shoY, ex, ey, ex + dx(s + e) * R.fore, ey + dy(s + e) * R.fore];
  };
  const L = leg(p.lH, p.lK, -1), Rl = leg(p.rH, p.rK, 1), La = arm(p.lS, p.lE, -1), Ra = arm(p.rS, p.rE, 1);
  return {
    hipX, hipY, neckX, neckY: neckY + p.sh * 0.5,
    lKx: L[0], lKy: L[1], lAx: L[2], lAy: L[3], lFx: L[4], lFy: L[5],
    rKx: Rl[0], rKy: Rl[1], rAx: Rl[2], rAy: Rl[3], rFx: Rl[4], rFy: Rl[5],
    lSx: La[0], lSy: La[1], lEx: La[2], lEy: La[3], lHx: La[4], lHy: La[5],
    rSx: Ra[0], rSy: Ra[1], rEx: Ra[2], rEy: Ra[3], rHx: Ra[4], rHy: Ra[5],
    headX: neckX, headY: neckY + p.hy + p.sh * 0.5, headRot: p.head + p.lean, headSy: p.hs,
    bodySx: p.sx * (1 + p.squash * 0.6), bodySy: 1 - p.squash, lift: Math.max(0, -p.ry / 40),
    eyeH: Math.max(1.5, p.eyeH), lookX: p.lookX, lookY: p.lookY, brow: p.brow, browY: p.browY, happy: p.happy, mouth: mouthIndex(p.mouth),
  };
}
