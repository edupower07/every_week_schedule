import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, F_TELOP, F_UI, cl, easeBack, easeOut, lerp } from './theme';

/* 撮った画像の大きさ（deviceScaleFactor=2 なので CSS px の2倍） */
export const SIZE: Record<string, [number, number]> = {
  week: [2320, 1830], empty: [2320, 1830], 'base-loaded': [2320, 1830], copied: [2320, 1830], 'excel-done': [2320, 1830], drag: [2320, 1830],
  weekend: [2320, 1936], excel: [1580, 636], input: [980, 1232], 'input-split': [980, 1480], 'input-shidou': [980, 632], drive: [980, 664],
  summary: [1580, 1404], 'print-kanji': [2360, 2210], 'print-hiragana': [2360, 2210], 'print-modal': [980, 460],
  notes: [1580, 1552], folder: [980, 948], search: [1580, 1172], settings: [1580, 1780], 'settings-bottom': [1580, 1780],
  'gemini-weekly': [1580, 1020], 'gemini-plan': [1580, 1020], 'gemini-hours': [1580, 1020], 'gemini-notes': [1580, 1020],
  'toast-save': [456, 78], 'toast-undo': [670, 80],
};

export type R = [number, number, number, number];

/* ノートの紙（全編うしろに敷く） */
export const Paper: React.FC<{ dark?: number }> = ({ dark = 0 }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    <AbsoluteFill style={{
      backgroundImage: `repeating-linear-gradient(0deg, transparent 0 63px, rgba(150,120,80,.10) 63px 64px)`,
    }} />
    {/* 左のとじ線 */}
    <div style={{ position: 'absolute', left: 34, top: 0, bottom: 0, width: 4, background: 'rgba(200,90,80,.28)' }} />
    <div style={{ position: 'absolute', left: 44, top: 0, bottom: 0, width: 2, background: 'rgba(200,90,80,.18)' }} />
    {dark > 0 && <AbsoluteFill style={{ background: C.dark, opacity: dark }} />}
  </AbsoluteFill>
);

/* 画像の一部（crop）を、幅 w に合わせて表示する。crop2 と k を渡すと寄り引きできる */
export const Crop: React.FC<{
  name: string; crop: R; w: number; h?: number; crop2?: R; k?: number;
  rings?: { r: R; t0: number; t1?: number; color?: string }[]; t?: number;
  over?: { name?: string; src: R; at: R; o: number }[];
  style?: React.CSSProperties; card?: boolean; img2?: string; clipY?: number;
}> = ({ name, crop, w, h, crop2, k = 0, rings = [], t = 0, style, card = true, img2, clipY, over = [] }) => {
  const [iw, ih] = SIZE[name];
  const c: R = crop2 ? (crop.map((v, i) => lerp(v, crop2[i], k)) as R) : crop;
  const s = w / c[2];
  const H = h ?? Math.round(crop[3] * (w / crop[2]));
  const img = (n: string, extra?: React.CSSProperties) => (
    <Img src={staticFile(`shots/${n}.png`)} style={{
      position: 'absolute', left: -c[0] * s, top: -c[1] * s, width: iw * s, height: ih * s, maxWidth: 'none', ...extra,
    }} />
  );
  return (
    <div style={{
      position: 'relative', width: w, height: H, overflow: 'hidden', background: C.card,
      borderRadius: card ? 22 : 0, boxShadow: card ? '0 22px 50px rgba(70,50,30,.22), 0 0 0 3px #e6dbc9' : undefined, ...style,
    }}>
      {img(name)}
      {/* 2枚目を上から下へ ぬりかえる（clipY = 0..1） */}
      {img2 && clipY !== undefined && (
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 ${(1 - cl(clipY)) * 100}% 0)` }}>{img(img2)}</div>
      )}
      {/* 画像の一部を別の場所に重ねる（ドラッグで置いたコマなど） */}
      {over.map((o, i) => o.o > 0 && (
        <div key={i} style={{
          position: 'absolute', left: (o.at[0] - c[0]) * s, top: (o.at[1] - c[1]) * s, width: o.src[2] * s, height: o.src[3] * s,
          overflow: 'hidden', opacity: o.o,
        }}>
          <Img src={staticFile(`shots/${o.name ?? name}.png`)} style={{ position: 'absolute', left: -o.src[0] * s, top: -o.src[1] * s, width: iw * s, height: ih * s, maxWidth: 'none' }} />
        </div>
      ))}
      {rings.map((r, i) => {
        const on = t >= r.t0 && (r.t1 === undefined || t < r.t1);
        if (!on) return null;
        const p = easeBack((t - r.t0) / 0.3);
        const pad = 10;
        return (
          <div key={i} style={{
            position: 'absolute', left: (r.r[0] - c[0]) * s - pad, top: (r.r[1] - c[1]) * s - pad,
            width: r.r[2] * s + pad * 2, height: r.r[3] * s + pad * 2, borderRadius: 16,
            border: `7px solid ${r.color ?? C.gold}`, boxShadow: `0 0 0 6px rgba(255,255,255,.7), 0 0 30px ${r.color ?? C.gold}`,
            transform: `scale(${lerp(1.25, 1, p)})`, opacity: cl((t - r.t0) / 0.12),
          }} />
        );
      })}
    </div>
  );
};

/* 画像まるごと（小さい部品用） */
export const Pic: React.FC<{ name: string; w: number; style?: React.CSSProperties; shadow?: boolean }> = ({ name, w, style, shadow = true }) => {
  const [iw, ih] = SIZE[name];
  return <Img src={staticFile(`shots/${name}.png`)} style={{
    width: w, height: ih * (w / iw), borderRadius: 14, display: 'block',
    boxShadow: shadow ? '0 18px 40px rgba(60,40,20,.28)' : undefined, ...style,
  }} />;
};

/* アプリのロゴ：茶色のノートに金の留め具 */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 120 }) => (
  <div style={{ position: 'relative', width: size, height: size * 1.1, flex: 'none' }}>
    <div style={{
      position: 'absolute', inset: 0, borderRadius: size * 0.16, background: `linear-gradient(160deg, #7a6a58, ${C.brown})`,
      boxShadow: `0 ${size * 0.08}px ${size * 0.2}px rgba(60,40,20,.35)`,
    }} />
    <div style={{ position: 'absolute', left: size * 0.18, right: size * 0.1, top: size * 0.14, bottom: size * 0.14, borderRadius: size * 0.08, background: C.card }}>
      {[0, 1, 2].map((r) => (
        <div key={r} style={{ position: 'absolute', left: '10%', right: '10%', top: `${22 + r * 24}%`, height: '13%', display: 'flex', gap: '7%' }}>
          {[C.red, C.blue, C.green].map((col, i) => (
            <div key={i} style={{ flex: 1, borderRadius: 4, background: (r + i) % 3 === 0 ? col : '#e8dfd0' }} />
          ))}
        </div>
      ))}
    </div>
    <div style={{ position: 'absolute', left: size * 0.04, top: size * 0.3, width: size * 0.12, height: size * 0.5, borderRadius: 999, background: C.gold }} />
  </div>
);

export const Logo: React.FC<{ size?: number; sub?: boolean; color?: string }> = ({ size = 1, sub = true, color = C.ink }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 26 * size }}>
    <LogoMark size={110 * size} />
    <div>
      <div style={{ fontFamily: F_UI, fontWeight: 700, fontSize: 104 * size, color, lineHeight: 1.05, letterSpacing: '.02em' }}>週案作成くん</div>
      {sub && <div style={{ fontFamily: F_UI, fontWeight: 700, fontSize: 34 * size, color: C.ink2, marginTop: 8 * size, letterSpacing: '.06em' }}>週案＆時数管理ノート ｜ Google Apps Script</div>}
    </div>
  </div>
);

/* ボタンを押した演出（アプリのボタンを切り抜いて拡大） */
export const PressButton: React.FC<{ crop: R; t: number; at: number; w: number }> = ({ crop, t, at, w }) => {
  const pin = easeBack((t - (at - 0.3)) / 0.3);
  const press = t > at && t < at + 0.16 ? 0.9 : 1;
  const ripple = cl((t - at) / 0.5);
  return (
    <div style={{ position: 'relative', transform: `scale(${pin * press})`, opacity: cl((t - (at - 0.3)) / 0.1) }}>
      <Crop name="week" crop={crop} w={w} card={false} style={{ borderRadius: 14, boxShadow: '0 14px 30px rgba(0,60,160,.25)' }} />
      {t > at && ripple < 1 && (
        <div style={{
          position: 'absolute', left: '50%', top: '50%', width: w * 1.1, height: w * 1.1, marginLeft: -w * 0.55, marginTop: -w * 0.55,
          borderRadius: '50%', border: `6px solid ${C.gold}`, transform: `scale(${0.2 + ripple * 0.9})`, opacity: 1 - ripple,
        }} />
      )}
    </div>
  );
};

/* 見出しの中の強調 */
export const Em: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => (
  <span style={{ color: c, background: `linear-gradient(transparent 68%, ${c}33 68%)` }}>{children}</span>
);

/* 小さいチップ */
export const Chip: React.FC<{ children: React.ReactNode; c?: string; size?: number; style?: React.CSSProperties }> = ({ children, c = C.brown, size = 40, style }) => (
  <div style={{
    fontFamily: F_TELOP, fontWeight: 700, fontSize: size, color: c, background: '#fff', border: `4px solid ${c}`,
    borderRadius: 999, padding: `${size * 0.22}px ${size * 0.7}px`, whiteSpace: 'nowrap', boxShadow: '0 10px 24px rgba(60,40,20,.14)', ...style,
  }}>{children}</div>
);

/* 下から ぽん と出す */
export const popIn = (t: number, at: number, d = 0.32) => {
  const p = easeBack((t - at) / d);
  return { opacity: cl((t - at) / 0.1), transform: `translateY(${(1 - easeOut((t - at) / d)) * 50}px) scale(${lerp(0.88, 1, p)})` } as React.CSSProperties;
};
