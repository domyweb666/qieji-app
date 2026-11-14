// 茄子火柴人（2026-11-15，多米的《茄子火柴人動作庫》）：身體是幾條線，頭套是一張圖。動作的數字在 lib/stick.ts。
// 每一格都在動畫執行緒上算（useFrameCallback → 一個共用的座標值 → 每條線自己讀），不經過 React 重畫，捲動和打字不會被它拖到。
// 頭整顆用一個 Animated.View 搬、轉、壓（樣式上的 transform 最穩），裡面只有眼睛、眉毛、嘴在換；身體的線改的是兩端座標。
// 減少動態：不跑時鐘，停在這個動作的第一格。純裝飾：預設不給讀屏讀（要讀就傳 label）。
import { memo } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { RIG, VIEW, frameOf, poseAt, type Act, type Dir, type Frame } from '../lib/stick';

const ALine = Animated.createAnimatedComponent(Line);
const ARect = Animated.createAnimatedComponent(Rect);
const AEllipse = Animated.createAnimatedComponent(Ellipse);
const AG = Animated.createAnimatedComponent(G);

// 頭套的顏色是這張圖自己的（茄子紫、蒂頭綠、白臉），不是介面的設計代號；換 app 換的就是這一包。只用一次
const HEAD = { egg: ['#9a5cb0', '#6b2f86', '#3f1750'], shine: '#c9a2d8', stem: '#587f2e', leaf: ['#8dbb52', '#4f7d2a'], rim: '#34143f', face: ['#ffffff', '#e6e2e8'], ink: '#2b2329' };
const SHINE_ALPHA = 0.45, SHADOW_ALPHA = 0.16;
// 頭套那張圖的範圍（原點＝脖子）：左 52、上 164、寬 126、高 174
const HB = { l: 52, t: 164, w: 126, h: 174 };
const LIMB = 9, ARM = 8.5; // 線的粗細（畫布點）
const GROUND_AT = `${((RIG.ground - VIEW.y) / VIEW.h) * 100}%` as const; // 壓扁時以腳底為中心

type F = SharedValue<Frame>;
type Key = keyof Frame;

function Seg({ f, a, b, w, color }: { f: F; a: [Key, Key]; b: [Key, Key]; w: number; color: string }) {
  const p = useAnimatedProps(() => ({ x1: f.value[a[0]], y1: f.value[a[1]], x2: f.value[b[0]], y2: f.value[b[1]] }));
  return <ALine animatedProps={p} stroke={color} strokeWidth={w} strokeLinecap="round" />;
}

function Eye({ f, side }: { f: F; side: 1 | -1 }) {
  const eye = useAnimatedProps(() => {
    const v = f.value;
    return { x: side * 11 + v.lookX - 2.3, y: -48 + v.lookY - v.eyeH / 2, height: v.eyeH, opacity: v.happy > 0.5 ? 0 : 1 };
  });
  const smile = useAnimatedProps(() => ({ opacity: f.value.happy > 0.5 ? 1 : 0 }));
  const brow = useAnimatedProps(() => {
    const v = f.value, bx = side * 12 + v.lookX * 0.5, by = -61 + v.browY + v.lookY * 0.5, r = v.brow * Math.PI / 180;
    const c = 8 * Math.cos(r), s = 8 * Math.sin(r);
    return { x1: bx - side * c, y1: by + s, x2: bx + side * c, y2: by - s };
  });
  const cx = side * 11;
  return (
    <>
      <ARect animatedProps={eye} width={4.6} rx={2.3} fill={HEAD.ink} />
      <AG animatedProps={smile}>
        <Path d={`M${cx - 5},-45 Q${cx},-54 ${cx + 5},-45`} fill="none" stroke={HEAD.ink} strokeWidth={3.6} strokeLinecap="round" />
      </AG>
      <ALine animatedProps={brow} stroke={HEAD.ink} strokeWidth={3.4} strokeLinecap="round" />
    </>
  );
}

// 五種嘴疊在同一個位置，只亮現在這一種
function Mouth({ f, i, children }: { f: F; i: number; children: React.ReactNode }) {
  const p = useAnimatedProps(() => ({ opacity: f.value.mouth === i ? 1 : 0 }));
  return <AG animatedProps={p}>{children}</AG>;
}

export const Stickman = memo(function Stickman({ act = 'idle', dir = 'right', size, ink, paused, label }: {
  act?: Act; dir?: Dir;
  size: number;      // 整隻的高度（點）；寬照畫布比例
  ink: string;       // 身體線條的顏色（跟著深淺色：傳 textPrimary）
  paused?: boolean;  // 先停著（看不到的時候）
  label?: string;    // 要給讀屏讀就傳；不傳＝純裝飾
}) {
  const calm = useReducedMotion();
  const k = size / VIEW.h, width = VIEW.w * k;
  const t = useSharedValue(0);
  useFrameCallback(info => { t.value += Math.min(50, info.timeSincePreviousFrame ?? 16) / 1000; }, !calm && !paused);
  const f = useDerivedValue(() => frameOf(poseAt(act, t.value, dir)), [act, dir]);

  const body = useAnimatedStyle(() => ({ transform: [{ scaleX: f.value.bodySx }, { scaleY: f.value.bodySy }] }));
  const head = useAnimatedStyle(() => ({
    transform: [
      { translateX: (f.value.headX - VIEW.x - HB.l) * k }, { translateY: (f.value.headY - VIEW.y - HB.t) * k },
      { rotate: `${f.value.headRot}deg` }, { scaleY: f.value.headSy },
    ],
  }));
  const shadow = useAnimatedProps(() => {
    const s = 1 - f.value.lift * 0.35;
    return { cx: f.value.hipX, rx: 62 * s, ry: 8 * s, opacity: SHADOW_ALPHA * (1 - f.value.lift * 0.5) };
  });
  const box = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;
  const fill = { position: 'absolute' as const, left: 0, top: 0, width, height: size };

  return (
    <View style={{ width, height: size }} pointerEvents="none"
      accessible={!!label} accessibilityRole={label ? 'image' : undefined} accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'} accessibilityElementsHidden={!label}>
      <Svg style={fill} viewBox={box}>
        <AEllipse animatedProps={shadow} cy={RIG.ground + 7} fill={ink} />
      </Svg>
      <Animated.View style={[fill, { transformOrigin: ['50%', GROUND_AT, 0] }, body]}>
        <Svg style={fill} viewBox={box}>
          <Seg f={f} a={['hipX', 'hipY']} b={['lKx', 'lKy']} w={LIMB} color={ink} />
          <Seg f={f} a={['lKx', 'lKy']} b={['lAx', 'lAy']} w={LIMB} color={ink} />
          <Seg f={f} a={['lAx', 'lAy']} b={['lFx', 'lFy']} w={LIMB} color={ink} />
          <Seg f={f} a={['hipX', 'hipY']} b={['rKx', 'rKy']} w={LIMB} color={ink} />
          <Seg f={f} a={['rKx', 'rKy']} b={['rAx', 'rAy']} w={LIMB} color={ink} />
          <Seg f={f} a={['rAx', 'rAy']} b={['rFx', 'rFy']} w={LIMB} color={ink} />
          <Seg f={f} a={['hipX', 'hipY']} b={['neckX', 'neckY']} w={LIMB} color={ink} />
        </Svg>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: HB.w * k, height: HB.h * k, transformOrigin: [HB.l * k, HB.t * k, 0] }, head]}>
          <Svg width={HB.w * k} height={HB.h * k} viewBox={`${-HB.l} ${-HB.t} ${HB.w} ${HB.h}`}>
            <Defs>
              <RadialGradient id="stEgg" cx="34%" cy="38%" r="78%">
                <Stop offset="0" stopColor={HEAD.egg[0]} /><Stop offset="0.45" stopColor={HEAD.egg[1]} /><Stop offset="1" stopColor={HEAD.egg[2]} />
              </RadialGradient>
              <RadialGradient id="stFace" cx="42%" cy="36%" r="75%">
                <Stop offset="0" stopColor={HEAD.face[0]} /><Stop offset="1" stopColor={HEAD.face[1]} />
              </RadialGradient>
              <LinearGradient id="stLeaf" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={HEAD.leaf[0]} /><Stop offset="1" stopColor={HEAD.leaf[1]} />
              </LinearGradient>
            </Defs>
            <Path d="M-45,-40 C-48,-80 -20,-114 20,-126 C44,-133 60,-114 56,-88 C52,-56 46,-22 30,-8 C12,6 -14,6 -30,-6 C-41,-14 -45,-28 -45,-40 Z" fill="url(#stEgg)" />
            <Path d="M-30,-92 C-18,-108 0,-118 18,-121" fill="none" stroke={HEAD.shine} strokeOpacity={SHINE_ALPHA} strokeWidth={5} strokeLinecap="round" />
            <Path d="M34,-128 C33,-142 38,-152 46,-160 L58,-153 C52,-146 49,-138 50,-128 Z" fill={HEAD.stem} />
            <Path d="M6,-120 C16,-137 48,-142 66,-124 C70,-112 68,-100 70,-88 C60,-96 56,-106 50,-104 C48,-96 44,-86 36,-84 C36,-96 30,-104 24,-102 C18,-100 10,-98 2,-102 C8,-108 8,-114 6,-120 Z" fill="url(#stLeaf)" />
            <Circle cx={0} cy={-46} r={33} fill={HEAD.rim} />
            <Circle cx={0} cy={-46} r={30} fill="url(#stFace)" stroke={HEAD.ink} strokeWidth={3} />
            <Eye f={f} side={-1} />
            <Eye f={f} side={1} />
            <Mouth f={f} i={0}><Path d="M-6,-31 Q0,-25 6,-31" fill="none" stroke={HEAD.ink} strokeWidth={3} strokeLinecap="round" /></Mouth>
            <Mouth f={f} i={1}><Path d="M-7,-32 Q0,-20 7,-32 Z" fill={HEAD.ink} /></Mouth>
            <Mouth f={f} i={2}><Path d="M-7,-30 q3.5,-4 7,0 t7,0" fill="none" stroke={HEAD.ink} strokeWidth={3} strokeLinecap="round" /></Mouth>
            <Mouth f={f} i={3}><Circle cx={0} cy={-30} r={2.6} fill="none" stroke={HEAD.ink} strokeWidth={2.6} /></Mouth>
            <Mouth f={f} i={4}><Line x1={-5} y1={-30} x2={5} y2={-30} stroke={HEAD.ink} strokeWidth={3} strokeLinecap="round" /></Mouth>
          </Svg>
        </Animated.View>
        {/* 手臂畫在頭的上面（舉手時手在臉前面） */}
        <Svg style={fill} viewBox={box}>
          <Seg f={f} a={['lSx', 'lSy']} b={['lEx', 'lEy']} w={ARM} color={ink} />
          <Seg f={f} a={['lEx', 'lEy']} b={['lHx', 'lHy']} w={ARM} color={ink} />
          <Seg f={f} a={['rSx', 'rSy']} b={['rEx', 'rEy']} w={ARM} color={ink} />
          <Seg f={f} a={['rEx', 'rEy']} b={['rHx', 'rHy']} w={ARM} color={ink} />
        </Svg>
      </Animated.View>
    </View>
  );
});
