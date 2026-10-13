import React from 'react';
import { staticFile, continueRender, delayRender } from 'remotion';

/* ============================================================
   書体の役割（Fukuda-app の packages/fonts/README.md と同じ考え方）
   - Yusei Magic          手書き風。フックのつぶやき・CTAの呼びかけ
   - Zen Kaku Gothic New  角ゴシック。読ませる見出し・テロップ
   - Zen Maru Gothic      丸ゴシック。アプリ名・ラベル・チップ
   この環境の日本語フォントは IPAゴシックだけなので、名前で指定しても効かない。
   public/fonts/ の実体を読み込み、読み終わるまで書き出しを止める。
   ============================================================ */
export const F_CATCH = '"Yusei Magic", sans-serif';
export const F_TELOP = '"Zen Kaku Gothic New", sans-serif';
export const F_UI = '"Zen Maru Gothic", sans-serif';

const FAMILIES = ['yusei-magic', 'zen-kaku-gothic-new', 'zen-maru-gothic'];

export const useFonts = (text: string) => {
  const [handle] = React.useState(() => delayRender('フォント読み込み'));
  React.useEffect(() => {
    FAMILIES.forEach((f) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = staticFile(`fonts/${f}/fonts.css`);
      document.head.appendChild(link);
    });
    const want = ['400 100px "Yusei Magic"', '700 100px "Zen Kaku Gothic New"', '900 100px "Zen Kaku Gothic New"', '700 100px "Zen Maru Gothic"'];
    // CSS の link が刺さってからでないと load が空振りするので、少し待ってから読む
    const go = () => Promise.all(want.map((f) => document.fonts.load(f, text))).then(() => document.fonts.ready);
    setTimeout(() => {
      go().then(go).then(() => continueRender(handle)).catch(() => continueRender(handle));
    }, 300);
  }, [handle, text]);
};

/* ---- 色（アプリの茶系ノートに合わせる） ---- */
export const C = {
  paper: '#f6f1e7', paper2: '#efe7d8', card: '#fdfbf7', line: '#e2d6c3',
  ink: '#3f352b', ink2: '#7a6a58', brown: '#5c4e3c', dark: '#2f271f',
  gold: '#d4a017', red: '#d6455a', blue: '#2f6fd0', green: '#3c9a5a', orange: '#e0702e',
  purple: '#8a5cd6', teal: '#2b8f88', pink: '#c94f8e',
};

/* ---- 時間の補助 ---- */
export const cl = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOut = (x: number) => 1 - Math.pow(1 - cl(x), 3);
export const easeInOut = (x: number) => { const u = cl(x); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
export const easeBack = (x: number) => { const c = 2.2; const u = cl(x) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
/* a秒に出て b秒に消える */
export const pulse = (t: number, a: number, b: number, fi = 0.22, fo = 0.2) =>
  t < a || t > b ? 0 : t < a + fi ? easeOut((t - a) / fi) : t > b - fo ? easeOut((b - t) / fo) : 1;
/* a秒から d秒かけて 0→1 */
export const prog = (t: number, a: number, d: number) => cl((t - a) / d);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/* シード付き乱数（毎フレーム同じ絵になるように） */
export const rng = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
