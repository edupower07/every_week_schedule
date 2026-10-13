// 要所の静止画をまとめて書き出す（バンドルは1回だけ）
// 使い方: node stills.mjs 1.2 4.5 ...   → out/s_<秒>.png  （引数なしなら各場面の中ほど）
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'path';

const BX = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const comp = await selectComposition({ serveUrl, id: 'reel', browserExecutable: BX });
let secs = process.argv.slice(2).map(Number);
const scale = Number(process.env.SCALE || 1);
for (const s of secs) {
  const frame = Math.min(comp.durationInFrames - 1, Math.round(s * 30));
  await renderStill({ composition: comp, serveUrl, output: `out/s_${s}.png`, frame, browserExecutable: BX, scale });
  console.log('still', s);
}
