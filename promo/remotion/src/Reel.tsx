import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import { C, F_CATCH, F_TELOP, F_UI, cl, easeBack, easeInOut, easeOut, lerp, prog, pulse, useFonts } from './theme';
import { Chip, Crop, Em, Logo, Paper, Pic, PressButton, R, popIn } from './parts';
import rects from './rects.json';

/* ============================================================
   週案作成くん  インスタ用PR動画（リール 9:16）
   フック → 全景 → できること20個 → まとめ → 配布の案内
   ============================================================ */
export const FPS = 30;
export const W = 1080;
export const H = 1920;

/* コメントで書いてもらう合言葉（変えるならここだけ） */
const KEYWORD = '週案';

const wk = (k: string) => (rects as any).week[k] as R;
const pad = (r: R, p: number): R => [r[0] - p, r[1] - p, r[2] + p * 2, r[3] + p * 2];

/* ---- 章 ---- */
const CH = {
  make: { name: 'つくる', c: C.orange },
  write: { name: '書く', c: C.blue },
  count: { name: '数える', c: '#c08a00' },
  print: { name: '印刷する', c: C.green },
  note: { name: 'ためる', c: C.pink },
  ai: { name: 'Geminiと', c: C.purple },
  safe: { name: '守る', c: C.teal },
};
type Ch = keyof typeof CH;

/* ---- レイアウト（リールの上下の帯・右のボタン列を避ける） ---- */
const HEAD_Y = 196;
const TITLE_Y = 330;
const VIS_TOP = 585;
const VIS_H = 810;
const SUB_Y = 1418;

/* 見せたいものを VIS 枠の中央に置く */
const Vis: React.FC<{ children: React.ReactNode; gap?: number }> = ({ children, gap = 26 }) => (
  <div style={{
    position: 'absolute', left: 0, right: 0, top: VIS_TOP, height: VIS_H,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap,
  }}>{children}</div>
);

type Feature = { ch: Ch; title: React.ReactNode; sub: string; dur: number; vis: (t: number) => React.ReactNode };

/* ============================================================
   できること 20
   ============================================================ */
const FEATURES: Feature[] = [
  /* ---------- つくる ---------- */
  {
    ch: 'make', dur: 2.9, sub: '設定した時間割を、1週間ぶん一気に',
    title: <>基本の時間割を<br /><Em c={C.orange}>ワンクリック</Em>で読込</>,
    vis: (t) => {
      const k = prog(t, 0.6, 0.75);
      const w = 940, h = Math.round(1068 * (w / 1331));
      return (
        <Vis>
          <div style={{ position: 'relative', ...popIn(t, 0) }}>
            <Crop name="empty" img2="base-loaded" clipY={easeInOut(k)} crop={[100, 345, 1331, 1068]} w={w} />
            {k > 0 && k < 1 && <div style={{ position: 'absolute', left: 0, right: 0, top: easeInOut(k) * h - 4, height: 8, background: C.gold, boxShadow: `0 0 26px 8px ${C.gold}` }} />}
            <div style={{ position: 'absolute', left: 30, top: -70 }}>
              <PressButton crop={pad(wk('.btn-group button:nth-child(1)'), 8)} t={t} at={0.45} w={440} />
            </div>
          </div>
        </Vis>
      );
    },
  },
  {
    ch: 'make', dur: 2.7, sub: '教科も単元名も、来週へまるごと',
    title: <><Em c={C.orange}>先週コピー</Em>で<br />単元ごと引き継ぎ</>,
    vis: (t) => (
      <Vis>
        <div style={{ position: 'relative', ...popIn(t, 0) }}>
          <Crop name="copied" crop={[100, 234, 1331, 1179]} w={880} />
          <div style={{ position: 'absolute', right: 30, top: -66 }}>
            <PressButton crop={pad(wk('.btn-group button:nth-child(2)'), 8)} t={t} at={0.4} w={330} />
          </div>
          <div style={{ position: 'absolute', left: -20, bottom: -40, ...popIn(t, 0.9) }}>
            <Pic name="toast-undo" w={920} />
          </div>
        </div>
      </Vis>
    ),
  },
  {
    ch: 'make', dur: 2.9, sub: '「国」「算」みたいな略し書きもOK',
    title: <><Em c={C.orange}>Excelの時間割</Em>も<br />コピーして貼るだけ</>,
    vis: (t) => (
      <Vis gap={34}>
        <div style={popIn(t, 0)}><Crop name="excel" crop={[0, 0, 1580, 636]} w={880} /></div>
        <div style={{ position: 'relative', ...popIn(t, 0.75) }}>
          <Crop name="empty" img2="excel-done" clipY={easeInOut(prog(t, 1.0, 0.6))} crop={[100, 345, 1331, 648]} w={880} />
          <div style={{
            position: 'absolute', left: '50%', top: -58, marginLeft: -48, width: 96, height: 96, borderRadius: '50%',
            background: C.orange, color: '#fff', fontSize: 58, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(0,0,0,.2)', fontFamily: F_TELOP, fontWeight: 900,
          }}>↓</div>
        </div>
      </Vis>
    ),
  },
  {
    ch: 'make', dur: 3.0, sub: 'コピー＆貼り付けボタンでもOK',
    title: <>コマは<Em c={C.orange}>ドラッグ</Em>で<br />ほかの日へコピー</>,
    vis: (t) => {
      const crop: R = [603, 713, 828, 700];
      const w = 900, s = w / crop[2];
      const src = wk('#cell-2-2'), tgt = wk('#cell-2-6');
      const m = easeInOut(prog(t, 0.5, 0.8));
      const landed = t >= 1.3;
      const gx = (lerp(src[0], tgt[0], m) - crop[0]) * s, gy = (lerp(src[1], tgt[1], m) - crop[1]) * s;
      const lift = t >= 0.4 && !landed ? 1 : 0;
      return (
        <Vis>
          <div style={{ position: 'relative', ...popIn(t, 0) }}>
            <Crop name="week" crop={crop} w={w} t={t}
              rings={[{ r: src, t0: 0.15, t1: 0.5 }, { r: tgt, t0: 1.32, color: C.orange }]}
              over={[{ src, at: tgt, o: landed ? 1 : 0 }]} />
            {lift > 0 && (
              <div style={{
                position: 'absolute', left: gx, top: gy, width: src[2] * s, height: src[3] * s,
                transform: `rotate(-3deg) scale(1.08)`, boxShadow: '0 26px 40px rgba(60,40,20,.35)', borderRadius: 10, overflow: 'hidden', opacity: 0.95,
              }}>
                <Crop name="week" crop={src} w={src[2] * s} card={false} />
              </div>
            )}
          </div>
        </Vis>
      );
    },
  },
  {
    ch: 'make', dur: 2.8, sub: '時数は0.5時間ずつ、自動で振り分け',
    title: <>1コマを<br /><Em c={C.orange}>2教科に分割</Em>できる</>,
    vis: (t) => (
      <Vis>
        <div style={{ position: 'relative', ...popIn(t, 0) }}>
          <Crop name="input-split" crop={[0, 0, 980, 860]} w={760} t={t} rings={[{ r: [44, 142, 330, 60], t0: 0.35 }]} />
          <div style={{ position: 'absolute', right: -70, bottom: -50, transform: 'rotate(3deg)' }}>
            <div style={popIn(t, 1.0)}><Crop name="week" crop={wk('#cell-4-6')} w={470} style={{ boxShadow: '0 20px 40px rgba(60,40,20,.3), 0 0 0 5px ' + C.orange }} /></div>
          </div>
        </div>
      </Vis>
    ),
  },
  {
    ch: 'make', dur: 2.7, sub: '読込・コピーは 休みの日を自動でスキップ',
    title: <><Em c={C.orange}>祝日・長期休み</Em>も<br />自動で表示</>,
    vis: (t) => (
      <Vis gap={30}>
        <div style={popIn(t, 0)}>
          <Crop name="weekend" crop={[100, 400, 980, 560]} w={900} t={t} rings={[{ r: [189, 420, 296, 80], t0: 0.4, color: C.red }]} />
        </div>
        <div style={{ display: 'flex', gap: 22, alignItems: 'center', ...popIn(t, 0.85) }}>
          <Crop name="weekend" crop={[1669, 410, 591, 90]} w={470} />
          <Chip c={C.blue} size={38}>土日の表示も切替</Chip>
        </div>
        <div style={popIn(t, 1.15)}><Chip c={C.ink2} size={38}>夏休みなどの休業期間も設定できる</Chip></div>
      </Vis>
    ),
  },
  /* ---------- 書く ---------- */
  {
    ch: 'write', dur: 2.9, sub: '連絡は印刷に出る／記録・所感は自分用',
    title: <><Em c={C.blue}>単元・連絡・記録</Em>を<br />1コマずつ残せる</>,
    vis: (t) => (
      <Vis>
        <div style={popIn(t, 0)}>
          <Crop name="input" crop={[0, 0, 980, 940]} w={800} t={t} rings={[
            { r: [40, 431, 900, 64], t0: 0.3, t1: 0.85, color: C.blue },
            { r: [40, 555, 900, 92], t0: 0.85, t1: 1.4, color: C.blue },
            { r: [40, 711, 900, 120], t0: 1.4, color: C.blue },
          ]} />
        </div>
      </Vis>
    ),
  },
  {
    ch: 'write', dur: 2.7, sub: '行事・朝自習・連絡・指導記録・会議記録',
    title: <>授業以外の<br /><Em c={C.blue}>記録の欄</Em>もそろってる</>,
    vis: (t) => (
      <Vis gap={18}>
        <div style={popIn(t, 0)}><Crop name="week" crop={[100, 345, 917, 228]} w={920} t={t} rings={[{ r: [102, 395, 85, 176], t0: 0.35, color: C.blue }]} /></div>
        <div style={{ fontFamily: F_TELOP, fontWeight: 700, fontSize: 40, color: C.ink2, ...popIn(t, 0.2) }}>︙　1〜6校時　︙</div>
        <div style={popIn(t, 0.35)}><Crop name="week" crop={[100, 1413, 917, 330]} w={920} t={t} rings={[{ r: [102, 1415, 85, 326], t0: 0.75, color: C.blue }]} /></div>
      </Vis>
    ),
  },
  {
    ch: 'write', dur: 2.9, sub: '画像・PDF・URL・ドライブのファイル',
    title: <>プリントも資料も<br /><Em c={C.blue}>コマに添付</Em></>,
    vis: (t) => (
      <Vis gap={30}>
        <div style={popIn(t, 0)}><Crop name="input" crop={[24, 836, 932, 150]} w={900} /></div>
        <div style={popIn(t, 0.45)}><Crop name="drive" crop={[0, 0, 980, 664]} w={820} /></div>
      </Vis>
    ),
  },
  /* ---------- 数える ---------- */
  {
    ch: 'count', dur: 2.5, sub: '朝自習を1/3時間で数える設定も',
    title: <>今週の授業コマ数を<br /><Em c="#c08a00">自動カウント</Em></>,
    vis: (t) => {
      const n = Math.round(29 * easeOut(prog(t, 0.2, 0.9)));
      return (
        <Vis gap={20}>
          <div style={{ ...popIn(t, 0), fontFamily: F_TELOP, fontWeight: 900, color: C.brown, display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 330, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
            <span style={{ fontSize: 110 }}>コマ</span>
          </div>
          <div style={popIn(t, 0.9)}><Crop name="week" crop={[1700, 1736, 580, 64]} w={720} /></div>
        </Vis>
      );
    },
  },
  {
    ch: 'count', dur: 3.5, sub: '標準時数との比較・残り・達成率まで',
    title: <>年間の<Em c="#c08a00">授業時数</Em>を<br />自動で集計</>,
    vis: (t) => (
      <Vis>
        <div style={popIn(t, 0)}>
          <Crop name="summary" crop={[40, 205, 1500, 1187]} crop2={[898, 205, 642, 508]} k={easeInOut(prog(t, 1.0, 0.9))} w={960} h={760} t={t}
            rings={[{ r: [1384, 206, 155, 506], t0: 2.05, color: C.red }]} />
        </div>
      </Vis>
    ),
  },
  {
    ch: 'count', dur: 2.8, sub: '学期ごとの時数も、Excelで開けるCSVに',
    title: <>2学期制も3学期制も<br /><Em c="#c08a00">CSV書き出し</Em>も</>,
    vis: (t) => (
      <Vis gap={36}>
        <div style={popIn(t, 0)}><Crop name="settings" crop={[30, 300, 800, 180]} w={940} t={t} rings={[{ r: [44, 410, 400, 64], t0: 0.45, color: '#c08a00' }]} /></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, ...popIn(t, 0.8) }}>
          <Crop name="summary" crop={[862, 1182, 296, 80]} w={380} />
          <span style={{ fontSize: 70, color: C.ink2, fontFamily: F_TELOP, fontWeight: 900 }}>→</span>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, background: '#fff', borderRadius: 18, padding: '18px 26px',
            boxShadow: '0 16px 34px rgba(60,40,20,.2)', border: '3px solid #cfe5d4', ...popIn(t, 1.15),
          }}>
            <div style={{ width: 70, height: 84, borderRadius: 10, background: '#1f7a45', color: '#fff', fontFamily: F_TELOP, fontWeight: 900, fontSize: 26, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 10, boxSizing: 'border-box' }}>CSV</div>
            <div style={{ fontFamily: F_TELOP, fontWeight: 700, fontSize: 30, color: C.ink, lineHeight: 1.3 }}>時数集計_<br />2026年度_5年.csv</div>
          </div>
        </div>
      </Vis>
    ),
  },
  /* ---------- 印刷する ---------- */
  {
    ch: 'print', dur: 3.1, sub: 'ボタン1つで 教室掲示用の時間割に',
    title: <>時間割を印刷<br /><Em c={C.green}>漢字</Em>も<Em c={C.green}>ひらがな</Em>も</>,
    vis: (t) => {
      const f = prog(t, 1.25, 0.5);
      const hira = f >= 0.5;
      const rot = f < 0.5 ? f * 180 : (f - 1) * 180;
      return (
        <Vis>
          <div style={{ position: 'relative', ...popIn(t, 0) }}>
            <div style={{ transform: `perspective(1600px) rotateY(${rot}deg)` }}>
              <Crop name={hira ? 'print-hiragana' : 'print-kanji'} crop={[0, 0, 1434, 1306]} w={880} h={801} />
            </div>
            <div style={{ position: 'absolute', right: -24, top: -34 }}>
              <Chip c={C.green} size={44} style={{ background: hira ? C.green : '#fff', color: hira ? '#fff' : C.green }}>{hira ? 'ひらがな（低学年）' : '漢字（標準）'}</Chip>
            </div>
          </div>
        </Vis>
      );
    },
  },
  /* ---------- ためる ---------- */
  {
    ch: 'note', dur: 3.0, sub: 'フォルダ分け・色分け・添付・PDF出力',
    title: <>気づきは<br /><Em c={C.pink}>クイックノート</Em>へ</>,
    vis: (t) => (
      <Vis>
        <div style={{ position: 'relative', ...popIn(t, 0) }}>
          <Crop name="notes" crop={[0, 0, 1580, 1440]} w={860} />
          <div style={{ position: 'absolute', right: -60, bottom: -40, transform: 'rotate(4deg)' }}>
            <div style={popIn(t, 1.05)}><Crop name="folder" crop={[0, 0, 980, 948]} w={400} style={{ boxShadow: '0 24px 50px rgba(60,40,20,.35), 0 0 0 5px ' + C.pink }} /></div>
          </div>
        </div>
      </Vis>
    ),
  },
  {
    ch: 'note', dur: 2.5, sub: '見つけたら、その週へジャンプ',
    title: <>週案もノートも<br /><Em c={C.pink}>まとめて検索</Em></>,
    vis: (t) => (
      <Vis>
        <div style={popIn(t, 0)}><Crop name="search" crop={[0, 0, 1580, 1172]} w={960} /></div>
      </Vis>
    ),
  },
  /* ---------- Geminiと ---------- */
  {
    ch: 'ai', dur: 2.8, sub: 'コピーして Geminiに貼るだけ',
    title: <>1週間の記録から<br /><Em c={C.purple}>週報</Em>をつくる</>,
    vis: (t) => (
      <Vis>
        <div style={{ position: 'relative', ...popIn(t, 0) }}>
          <Crop name="gemini-weekly" crop={[0, 0, 1580, 1020]} w={960} />
          <Sparkles t={t} />
        </div>
      </Vis>
    ),
  },
  {
    ch: 'ai', dur: 2.3, sub: '単元名から、45分の流れを考えてもらう',
    title: <><Em c={C.purple}>指導案のたたき台</Em>も</>,
    vis: (t) => (
      <Vis>
        <div style={{ position: 'relative', ...popIn(t, 0) }}>
          <Crop name="gemini-plan" crop={[0, 0, 1580, 1020]} w={960} />
          <Sparkles t={t} />
        </div>
      </Vis>
    ),
  },
  {
    ch: 'ai', dur: 2.7, sub: 'データが外部に送られることはありません',
    title: <><Em c={C.purple}>時数の分析</Em>も<br /><Em c={C.purple}>ノートの要約</Em>も</>,
    vis: (t) => (
      <Vis>
        <div style={{ position: 'relative', width: 960, height: 760 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, ...popIn(t, 0) }}><Crop name="gemini-hours" crop={[0, 0, 1580, 1020]} w={760} /></div>
          <div style={{ position: 'absolute', right: 0, bottom: 0, ...popIn(t, 0.5) }}><Crop name="gemini-notes" crop={[0, 0, 1580, 1020]} w={760} style={{ boxShadow: '0 30px 60px rgba(60,40,20,.35), 0 0 0 4px ' + C.purple }} /></div>
        </div>
      </Vis>
    ),
  },
  /* ---------- 守る ---------- */
  {
    ch: 'safe', dur: 2.8, sub: 'データは あなたのGoogleドライブに',
    title: <>入力したら<br /><Em c={C.teal}>自動でクラウド保存</Em></>,
    vis: (t) => <SaveVis t={t} />,
  },
  {
    ch: 'safe', dur: 2.7, sub: 'バックアップの書き出し・読み込みも',
    title: <>うっかり消しても<br /><Em c={C.teal}>元に戻せる</Em></>,
    vis: (t) => (
      <Vis gap={50}>
        <div style={{ position: 'relative', ...popIn(t, 0) }}>
          <Pic name="toast-undo" w={960} />
          <div style={{ position: 'absolute', right: 8, top: -6, width: 290, height: 120, borderRadius: 18, border: `7px solid ${C.teal}`, boxShadow: `0 0 26px ${C.teal}`, opacity: cl((t - 0.45) / 0.12), transform: `scale(${lerp(1.2, 1, easeBack((t - 0.45) / 0.3))})` }} />
        </div>
        <div style={popIn(t, 0.85)}><Crop name="settings-bottom" crop={[30, 1480, 830, 170]} w={940} /></div>
      </Vis>
    ),
  },
];

/* Gemini のきらきら */
const Sparkles: React.FC<{ t: number }> = ({ t }) => (
  <>
    {[[-30, -40, 90, 0.2], [900, 30, 70, 0.35], [860, 560, 80, 0.5], [-20, 520, 60, 0.6]].map(([x, y, s, a], i) => {
      const p = cl((t - a) / 0.3);
      return <div key={i} style={{
        position: 'absolute', left: x, top: y, fontSize: s, opacity: p,
        transform: `scale(${lerp(0.3, 1, easeBack(p))}) rotate(${Math.sin(t * 3 + i) * 12}deg)`,
      }}>✨</div>;
    })}
  </>
);

/* 自動保存：PC・タブレット・スマホ → 自分のドライブ */
const SaveVis: React.FC<{ t: number }> = ({ t }) => {
  const dash = (t * 120) % 40;
  return (
    <Vis gap={46}>
      <div style={{ display: 'flex', gap: 70, fontSize: 120, ...popIn(t, 0) }}>
        <span>💻</span><span>📱</span><span>🏫</span>
      </div>
      <svg width={760} height={120} style={{ marginTop: -30, marginBottom: -30, ...popIn(t, 0.2) }}>
        {[150, 380, 610].map((x, i) => (
          <line key={i} x1={x} y1={0} x2={380} y2={118} stroke={C.teal} strokeWidth={8} strokeDasharray="22 18" strokeDashoffset={-dash} strokeLinecap="round" />
        ))}
      </svg>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 24, background: '#fff', borderRadius: 28, padding: '26px 44px',
        boxShadow: '0 20px 44px rgba(40,80,80,.22)', border: `5px solid ${C.teal}`, ...popIn(t, 0.4),
      }}>
        <span style={{ fontSize: 90 }}>☁️</span>
        <div style={{ fontFamily: F_TELOP, fontWeight: 900, fontSize: 52, color: C.ink, lineHeight: 1.3 }}>自分のGoogleドライブ<br /><span style={{ fontSize: 34, color: C.ink2, fontWeight: 700 }}>どの端末から開いても同じデータ</span></div>
      </div>
      <div style={popIn(t, 0.95)}><Pic name="toast-save" w={760} /></div>
    </Vis>
  );
};

/* ============================================================
   機能1つぶんの画面
   ============================================================ */
const FeatureScene: React.FC<{ f: Feature; idx: number; t: number; prevCh?: Ch }> = ({ f, idx, t, prevCh }) => {
  const ch = CH[f.ch];
  const newCh = prevCh !== f.ch;
  const total = FEATURES.length;
  const tp = easeBack(t / 0.32);
  return (
    <AbsoluteFill>
      {/* 章チップ と 番号 */}
      <div style={{ position: 'absolute', left: 70, right: 70, top: HEAD_Y, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          fontFamily: F_UI, fontWeight: 700, fontSize: 44, color: '#fff', background: ch.c, borderRadius: 999, padding: '10px 34px',
          transform: newCh ? `scale(${lerp(0.6, 1, easeBack(t / 0.3))})` : undefined, transformOrigin: 'left center',
          boxShadow: `0 10px 20px ${ch.c}55`,
        }}>{ch.name}</div>
        <div style={{ fontFamily: F_TELOP, fontWeight: 900, color: ch.c, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 40, color: C.ink2, fontWeight: 700 }}>できること</span>
          <span style={{ fontSize: 96, lineHeight: 1, display: 'inline-block', transform: `translateY(${(1 - easeOut(t / 0.25)) * -30}px)`, opacity: cl(t / 0.12) }}>{String(idx + 1).padStart(2, '0')}</span>
          <span style={{ fontSize: 40, color: C.ink2 }}>/{total}</span>
        </div>
      </div>
      {/* 進みぐあい */}
      <div style={{ position: 'absolute', left: 70, right: 70, top: HEAD_Y + 106, display: 'flex', gap: 6 }}>
        {FEATURES.map((g, i) => (
          <div key={i} style={{ flex: 1, height: 10, borderRadius: 99, background: i <= idx ? CH[g.ch].c : 'rgba(120,100,80,.18)', opacity: i === idx ? 0.5 + 0.5 * cl(t / 0.3) : 1 }} />
        ))}
      </div>
      {/* 見出し */}
      <div style={{
        position: 'absolute', left: 50, right: 50, top: TITLE_Y, height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', fontFamily: F_TELOP, fontWeight: 900, fontSize: 86, lineHeight: 1.24, color: C.ink, letterSpacing: '.01em',
        opacity: cl(t / 0.12), transform: `scale(${lerp(0.9, 1, tp)})`,
      }}><div>{f.title}</div></div>
      {f.vis(t)}
      {/* 補足 */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: SUB_Y, display: 'flex', justifyContent: 'center', ...popIn(t, 0.25) }}>
        <div style={{
          fontFamily: F_TELOP, fontWeight: 700, fontSize: 42, color: '#fff', background: 'rgba(55,44,33,.92)', borderRadius: 18,
          padding: '14px 32px 14px 22px', display: 'flex', alignItems: 'center', gap: 18, maxWidth: 900,
        }}>
          <span style={{ width: 10, alignSelf: 'stretch', borderRadius: 99, background: ch.c, flex: 'none' }} />
          <span>{f.sub}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================
   フック（0〜3.6秒）
   ============================================================ */
const HOOK = 3.6;
const Hook: React.FC<{ t: number }> = ({ t }) => {
  const HIT = 1.75;
  const before = t < HIT;
  const lines = ['週案は 手書き、', '時数は Excel、', 'メモは 付せん…'];
  return (
    <AbsoluteFill>
      {before ? (
        <AbsoluteFill style={{ background: C.dark }}>
          <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 63px, rgba(255,255,255,.05) 63px 64px)' }} />
          <div style={{ position: 'absolute', left: 90, right: 60, top: 520, display: 'flex', flexDirection: 'column', gap: 70 }}>
            {lines.map((s, i) => {
              const a = 0.08 + i * 0.42;
              const p = easeBack((t - a) / 0.3);
              return (
                <div key={i} style={{
                  fontFamily: F_CATCH, fontSize: 112, color: i === 2 ? '#ffd76a' : '#f6efe2', opacity: cl((t - a) / 0.1),
                  transform: `translateX(${(1 - easeOut((t - a) / 0.3)) * -120}px) rotate(${lerp(-6, -2 + i * 1.5, p)}deg)`,
                }}>{s}</div>
              );
            })}
          </div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center', fontFamily: F_TELOP, fontWeight: 700, fontSize: 44, color: 'rgba(246,239,226,.6)', opacity: cl(t / 0.2) }}>先生の 毎週の しごと</div>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 250, textAlign: 'center', fontFamily: F_TELOP, fontWeight: 900, color: C.ink, lineHeight: 1.18 }}>
            <div style={{ fontSize: 130, ...popIn(t, HIT, 0.25) }}>ぜんぶ、</div>
            <div style={{ fontSize: 150, ...popIn(t, HIT + 0.15, 0.25) }}><Em c={C.red}>これ1つ</Em>で。</div>
          </div>
          <div style={{ position: 'absolute', left: 60, top: 720, transform: `rotate(${lerp(-8, -3, easeOut((t - HIT) / 0.4))}deg) scale(${lerp(1.3, 1, easeBack((t - HIT - 0.1) / 0.4))})`, opacity: cl((t - HIT) / 0.08) }}>
            <Crop name="week" crop={[0, 0, 2320, 1830]} w={960} />
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* ============================================================
   全景（アプリ名と、何ができるか）
   ============================================================ */
const INTRO = 3.2;
const Intro: React.FC<{ t: number }> = ({ t }) => {
  const z = easeInOut(prog(t, 0.3, 2.8));
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 210, display: 'flex', justifyContent: 'center', ...popIn(t, 0) }}><Logo size={0.92} /></div>
      <div style={{ position: 'absolute', left: 60, top: 500, ...popIn(t, 0.15) }}>
        <Crop name="week" crop={[0, 0, 2320, 1830]} crop2={[600, 300, 1700, 1341]} k={z} w={960} h={757} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1300, display: 'flex', justifyContent: 'center', ...popIn(t, 0.6) }}>
        <div style={{ fontFamily: F_TELOP, fontWeight: 900, fontSize: 60, color: '#fff', background: C.brown, borderRadius: 24, padding: '20px 44px', boxShadow: '0 16px 36px rgba(60,40,20,.3)' }}>
          できること<span style={{ color: '#ffd76a', fontSize: 76 }}> 20個 </span>ぜんぶ見せます👇
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================
   まとめ（20個を一気に並べる）
   ============================================================ */
const RECAP = 3.0;
const RECAP_LABELS = [
  '📥 基本時間割を読込', '📄 先週コピー', '📋 Excel一括貼付', '✋ ドラッグでコピー', '➗ 2教科に分割',
  '🎌 祝日・休業日', '✏️ 単元・連絡・記録', '🗓️ 行事・会議記録', '📎 資料を添付', '🔢 週のコマ数',
  '📊 年間の時数集計', '📑 学期別・CSV', '🖨️ 漢字/ひらがな印刷', '📝 クイックノート', '🔍 全体検索',
  '✨ 週報をつくる', '✨ 指導案のたたき台', '✨ 分析・要約', '☁️ 自動クラウド保存', '↩️ 戻す・バックアップ',
];
const Recap: React.FC<{ t: number }> = ({ t }) => {
  const band = prog(t, 1.35, 0.3);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 210, textAlign: 'center', fontFamily: F_TELOP, fontWeight: 900, fontSize: 70, color: C.ink, ...popIn(t, 0) }}>
        できること <span style={{ color: C.red, fontSize: 96 }}>20</span>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 370, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 18px' }}>
        {RECAP_LABELS.map((s, i) => {
          const ch = CH[FEATURES[i].ch];
          return (
            <div key={i} style={{
              fontFamily: F_TELOP, fontWeight: 700, fontSize: 36, color: C.ink, background: '#fff', borderRadius: 14, height: 84,
              display: 'flex', alignItems: 'center', padding: '0 18px', borderLeft: `12px solid ${ch.c}`, boxShadow: '0 8px 18px rgba(60,40,20,.12)',
              whiteSpace: 'nowrap', overflow: 'hidden', ...popIn(t, 0.05 + i * 0.045, 0.25),
            }}>{s}</div>
          );
        })}
      </div>
      {band > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 700, height: 360, background: 'rgba(47,39,31,.94)', opacity: band,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
          transform: `scaleY(${lerp(0.4, 1, easeBack(band))})`,
        }}>
          <div style={{ fontFamily: F_TELOP, fontWeight: 900, fontSize: 112, color: '#fff', lineHeight: 1.2 }}>これ全部、<span style={{ color: '#ffd76a' }}>無料</span>。</div>
          <div style={{ fontFamily: F_TELOP, fontWeight: 700, fontSize: 44, color: 'rgba(255,255,255,.8)', marginTop: 14 }}>Googleアカウントがあれば すぐ使える</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/* ============================================================
   配布の案内（フォロー・いいね・リポスト・コメント）
   ============================================================ */
const CTA = 7.5;
const STEPS = [
  { icon: '👤', label: 'フォロー', c: C.blue },
  { icon: '❤️', label: 'いいね', c: C.red },
  { icon: '🔁', label: 'リポスト', c: C.green },
  { icon: '💬', label: <>コメントに「<span style={{ color: C.orange }}>{KEYWORD}</span>」</>, c: C.orange },
];
const Cta: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 200, display: 'flex', justifyContent: 'center', ...popIn(t, 0) }}><Logo size={0.8} sub={false} /></div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 370, textAlign: 'center', fontFamily: F_CATCH, fontSize: 108, color: C.red, ...popIn(t, 0.2), }}>
      <span style={{ display: 'inline-block', transform: `rotate(-2deg)` }}>無料で配布します！</span>
    </div>
    <div style={{ position: 'absolute', left: 90, right: 90, top: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {STEPS.map((s, i) => {
        const at = 0.55 + i * 0.32;
        const last = i === STEPS.length - 1;
        const glow = last ? 0.5 + 0.5 * Math.sin((t - 2) * 6) : 0;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 28, background: '#fff', borderRadius: 26, height: 136, padding: '0 34px',
            border: `5px solid ${s.c}`, boxShadow: last && t > 2 ? `0 0 ${20 + glow * 30}px ${s.c}` : '0 12px 26px rgba(60,40,20,.14)', ...popIn(t, at),
          }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: s.c, color: '#fff', fontFamily: F_TELOP, fontWeight: 900, fontSize: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{i + 1}</div>
            <div style={{ fontSize: 70, flex: 'none' }}>{s.icon}</div>
            <div style={{ fontFamily: F_TELOP, fontWeight: 900, fontSize: last ? 60 : 68, color: C.ink, whiteSpace: 'nowrap' }}>{s.label}</div>
          </div>
        );
      })}
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1240, display: 'flex', justifyContent: 'center', ...popIn(t, 2.0) }}>
      <div style={{ fontFamily: F_TELOP, fontWeight: 900, fontSize: 54, color: '#fff', background: C.brown, borderRadius: 999, padding: '22px 54px', boxShadow: '0 16px 36px rgba(60,40,20,.3)' }}>
        DMで配布リンクをお送りします📩
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 1390, textAlign: 'center', fontFamily: F_TELOP, fontWeight: 700, fontSize: 36, color: C.ink2, ...popIn(t, 2.3) }}>
      Googleアカウントがあれば 無料で使えます
    </div>
  </AbsoluteFill>
);

/* ============================================================
   通し
   ============================================================ */
const FONT_TEXT = '週案作成くん時数管理ノートできること全部見せますつくる書く数える印刷するためるGeminiと守る' +
  RECAP_LABELS.join('') + '先生の毎週しごと手書き時数はExcelメモは付せんぜんぶこれ1つで無料で配布しますフォローいいねリポストコメントに「」' +
  'DMで配布リンクをお送りしますGoogleアカウントがあれば学校のアカウントでもOK0123456789/〜→︙';

const PLAN = (() => {
  let at = HOOK + INTRO;
  const feats = FEATURES.map((f) => { const s = at; at += f.dur; return { f, from: s }; });
  const recapFrom = at; at += RECAP;
  const ctaFrom = at; at += CTA;
  return { feats, recapFrom, ctaFrom, total: at };
})();
export const DURATION_SEC = PLAN.total;

export const Reel: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  useFonts(FONT_TEXT + FEATURES.map((f) => f.sub).join(''));

  // 白フラッシュとシェイク：フックの着地、まとめの帯
  const hits = [HOOK - 1.85, PLAN.recapFrom + 1.35, PLAN.ctaFrom];
  let veil = 0, shake = 0;
  hits.forEach((h, i) => {
    const d = t - h;
    if (d >= 0 && d < 0.45) { const k = 1 - d / 0.45; veil = Math.max(veil, (i === 1 ? 0.0 : 0.85) * k * k); shake = Math.max(shake, k); }
  });
  const sx = Math.sin(t * 95) * 26 * shake, sy = Math.cos(t * 78) * 18 * shake;

  const seq = (from: number, dur: number, el: (lt: number) => React.ReactNode, key: string) => (
    <Sequence key={key} from={Math.round(from * FPS)} durationInFrames={Math.round(dur * FPS)}>
      <Local render={el} />
    </Sequence>
  );

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px)` }}>
        <Paper />
        {seq(0, HOOK, (lt) => <Hook t={lt} />, 'hook')}
        {seq(HOOK, INTRO, (lt) => <Intro t={lt} />, 'intro')}
        {PLAN.feats.map(({ f, from }, i) => seq(from, f.dur, (lt) => <FeatureScene f={f} idx={i} t={lt} prevCh={i > 0 ? FEATURES[i - 1].ch : undefined} />, 'f' + i))}
        {seq(PLAN.recapFrom, RECAP, (lt) => <Recap t={lt} />, 'recap')}
        {seq(PLAN.ctaFrom, CTA, (lt) => <Cta t={lt} />, 'cta')}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: veil, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

const Local: React.FC<{ render: (t: number) => React.ReactNode }> = ({ render }) => {
  const f = useCurrentFrame();
  return <>{render(f / FPS)}</>;
};

/* 確認用：各場面のはじまり（秒） */
export const MARKS = { hook: 0, intro: HOOK, feats: PLAN.feats.map((x) => +x.from.toFixed(2)), recap: PLAN.recapFrom, cta: PLAN.ctaFrom, total: PLAN.total };
