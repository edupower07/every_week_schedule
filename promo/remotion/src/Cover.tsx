import React from 'react';
import { AbsoluteFill } from 'remotion';
import { F_TELOP, F_UI, useFonts } from './theme';
import { Crop, LogoMark } from './parts';

/* ============================================================
   リールのカバー（1080×1920）
   instagram-cover-image スキルの「型I カラーブロック（ツール系）」に合わせる。
   配色は「校務効率化」：--bg #4A3B78 / --accent #FFD24A
   プロフィールのグリッドは中央の3:4（y=240〜1680）だけが見えるので、
   文字と画面はすべてその中に入れる。
   ============================================================ */
const BG = '#4A3B78';
const ACC = '#FFD24A';
const SUB = '#CFC6EE';
const HANDLE = '@edupower07';

export const Cover: React.FC = () => {
  useFonts('校務効率化GASで無料配布週案と時数これ1つで動く週案作成くんできること20個をまるごとプレゼント@edupower070123456789');
  return (
    <AbsoluteFill style={{ background: BG, color: '#fff', fontFamily: F_TELOP, wordBreak: 'keep-all', lineBreak: 'strict' as any }}>
      {/* うっすら方眼 */}
      <AbsoluteFill style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 2px, transparent 2px), linear-gradient(90deg, rgba(255,255,255,.05) 2px, transparent 2px)', backgroundSize: '60px 60px' }} />

      <div style={{ position: 'absolute', left: 92, top: 300 }}>
        <div style={{ display: 'inline-block', background: ACC, color: '#2a1f4f', fontSize: 34, fontWeight: 900, letterSpacing: '.12em', padding: '12px 30px', borderRadius: 8 }}>
          校務効率化 ｜ GASで無料配布
        </div>
      </div>

      <div style={{ position: 'absolute', left: 92, right: 60, top: 400, fontSize: 142, fontWeight: 900, lineHeight: 1.2, letterSpacing: '-.02em' }}>
        週案と時数、<br /><span style={{ color: ACC }}>これ1つ</span>で。
      </div>

      <div style={{ position: 'absolute', left: 92, right: 80, top: 770, fontSize: 46, fontWeight: 700, lineHeight: 1.6, color: SUB, borderLeft: `8px solid ${ACC}`, paddingLeft: 30 }}>
        Googleで動く<b style={{ color: '#fff' }}>「週案作成くん」</b><br />できること<b style={{ color: '#fff' }}>20個</b>、ぜんぶ見せます。
      </div>

      {/* アプリの画面 */}
      <div style={{ position: 'absolute', left: 70, top: 975, transform: 'rotate(-3deg)' }}>
        <Crop name="week" crop={[0, 0, 2320, 1380]} w={940} style={{ boxShadow: '0 30px 70px rgba(0,0,0,.45), 0 0 0 6px rgba(255,255,255,.9)' }} />
      </div>

      {/* 無料ステッカー */}
      <div style={{
        position: 'absolute', right: 56, top: 900, width: 230, height: 230, borderRadius: '50%', background: ACC, color: '#2a1f4f',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: 'rotate(10deg)',
        boxShadow: '0 16px 36px rgba(0,0,0,.35)', border: '6px solid #fff',
      }}>
        <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1 }}>まるごと</div>
        <div style={{ fontSize: 82, fontWeight: 900, lineHeight: 1.1 }}>無料</div>
      </div>

      {/* フッター */}
      <div style={{
        position: 'absolute', left: 92, right: 92, top: 1612, borderTop: '3px solid rgba(255,255,255,.28)', paddingTop: 22,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 30, fontWeight: 700, color: SUB, letterSpacing: '.06em',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: F_UI }}><LogoMark size={40} />週案作成くん</span>
        <span>{HANDLE}</span>
      </div>
    </AbsoluteFill>
  );
};
