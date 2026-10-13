// 週案＆時数管理ノートの「決め絵」を撮る（PR動画・表紙の素材）。
// 実行: NODE_PATH=$(npm root -g) node promo/capture.cjs   → promo/shots/*.png
// google.script.run はモック。データはすべて架空（5年1組・児童名は記号）。
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

// アプリのフォント（BIZ UDPゴシック）は Google Fonts から取れないので、手元に落とした実体を読ませる
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=BIZ\+UDPGothic[^>]*>/, '<link rel="stylesheet" href="/fonts/biz-udpgothic/fonts.css">');

const YEAR = '2026';
const TODAY = '2026-10-21T16:20:00+09:00';   // 水曜。表示する週は 10/19〜10/23
const HOLIDAYS = {
  '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日', '2026-05-05': 'こどもの日', '2026-05-06': '休日',
  '2026-07-20': '海の日', '2026-09-21': '敬老の日', '2026-09-22': '休日', '2026-09-23': '秋分の日',
  '2026-10-12': 'スポーツの日', '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日'
};

// ---- 基本の時間割（5年） ----
const BASE = [
  ['国語', '算数', '社会', '体育', '外国語', '総合的な学習の時間'],
  ['算数', '国語', '理科', '理科', '図画工作', '図画工作'],
  ['国語', '算数', '音楽', '家庭', '学活'],
  ['国語', '算数', '社会', '体育', '外国語', '総合的な学習の時間'],
  ['算数', '国語', '理科', '道徳', '家庭', '体育']
];
const baseTimetable = {};
BASE.forEach((day, d) => day.forEach((s, i) => { baseTimetable[`${d}-${i + 1}`] = s; }));

const L = (subject, unit = '', extra = {}) => Object.assign({ subject, unit, contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] }, extra);
const M = (record, extra = {}) => Object.assign({ subject: '', unit: '', contact: '', record, isSplit: false, subject2: '', unit2: '', attachments: [] }, extra);
const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 4月〜先週までは基本時間割どおりに授業した、という架空の記録で時数集計を埋める
const UNITS = { '国語': '漢字の広場', '算数': '小数のかけ算', '理科': '植物の発芽と成長', '社会': '日本の国土' };
function history() {
  const data = {};
  const start = new Date(2026, 3, 8), end = new Date(2026, 9, 16);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(); if (wd === 0 || wd === 6) continue;
    const s = fmt(d);
    if (HOLIDAYS[s]) continue;
    if (s >= '2026-07-21' && s <= '2026-08-31') continue;   // 夏季休業
    if (s >= '2026-10-10' && s <= '2026-10-12') continue;   // 秋季休業
    BASE[wd - 1].forEach((sub, i) => { data[`${s}-${i + 1}`] = L(sub, UNITS[sub] || ''); });
  }
  return data;
}

// ---- 表示する週（10/19〜23）を作り込む ----
const W = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
function thisWeek() {
  const x = {};
  const put = (d, p, v) => { x[`${W[d]}-${p}`] = v; };
  // 月
  put(0, 'gyoji', M('避難訓練（2校時）'));
  put(0, 'morning', L('その他', '読書'));
  put(0, 1, L('国語', '大造じいさんとガン'));
  put(0, 2, L('算数', '分数のたし算とひき算'));
  put(0, 3, L('社会', 'これからの工業生産'));
  put(0, 4, L('体育', 'マット運動', { contact: '体操服' }));
  put(0, 5, L('外国語', 'Unit5 道案内'));
  put(0, 6, L('総合的な学習の時間', '米づくり（収穫）'));
  put(0, 'renraku', M('体操服・赤白帽子'));
  put(0, 'shidou', M('マット運動、補助が必要な子3名。来週も声かけ。'));
  // 火
  put(1, 'morning', L('その他', '漢字ドリル'));
  put(1, 1, L('算数', '分数のたし算とひき算'));
  put(1, 2, L('国語', '大造じいさんとガン'));
  put(1, 3, L('理科', '流れる水のはたらき', {
    record: '流水実験、班の役割分担がうまくいった',
    attachments: [{ id: 1, type: 'drive', name: '流水実験ワークシート.pdf', url: 'https://drive.example/a' }, { id: 2, type: 'url', name: '川の観察動画', url: 'https://example.com/v' }]
  }));
  put(1, 4, L('理科', '流れる水のはたらき'));
  put(1, 5, L('図画工作', '糸のこスイスイ', { contact: 'エプロン' }));
  put(1, 6, L('図画工作', '糸のこスイスイ'));
  put(1, 'renraku', M('図工：エプロン'));
  // 水（今日）
  put(2, 'gyoji', M('委員会活動'));
  put(2, 'morning', L('その他', '計算タイム'));
  put(2, 1, L('国語', '大造じいさんとガン'));
  put(2, 2, L('算数', '分数のたし算とひき算', { record: '通分でつまずき3名 → 放課後補充' }));
  put(2, 3, L('音楽', '和音の美しさ'));
  put(2, 4, L('家庭', 'くらしを支えるお金と物'));
  put(2, 5, L('学活', '係活動の見直し'));
  put(2, 'shidou', M('通分のつまずき3名。明日の朝に5分補充。'));
  put(2, 'kaigi', M('学年会：音楽会の練習割り振り'));
  // 木
  put(3, 'gyoji', M('音楽会リハーサル'));
  put(3, 'morning', L('その他', '読書'));
  put(3, 1, L('国語', '大造じいさんとガン'));
  put(3, 2, L('算数', '分数のたし算とひき算'));
  put(3, 3, L('社会', 'これからの工業生産'));
  put(3, 4, L('体育', 'マット運動'));
  put(3, 5, L('外国語', 'Unit5 道案内'));
  put(3, 6, L('総合的な学習の時間', '米づくり（まとめ）'));
  put(3, 'renraku', M('習字道具'));
  put(3, 'kaigi', M('職員会議：後期の行事確認'));
  // 金
  put(4, 'gyoji', M('学年集会'));
  put(4, 'morning', L('その他', '視写'));
  put(4, 1, L('算数', '分数のたし算とひき算'));
  put(4, 2, L('国語', '漢字の広場⑤'));
  put(4, 3, L('理科', '流れる水のはたらき'));
  put(4, 4, L('道徳', 'すれちがい'));
  put(4, 5, L('家庭', 'くらしを支えるお金と物'));
  put(4, 6, L('学活', 'お楽しみ会の計画', { isSplit: true, subject2: '総合的な学習の時間', unit2: '米の発表準備' }));
  put(4, 'renraku', M('お楽しみ会の準備物'));
  return x;
}

const FOLDERS = ['未分類', '児童の様子', 'Aさん', 'Bさん', '学年会', '行事', '音楽会', '研修'];
const FOLDER_DETAILS = {
  '未分類': { color: '#e8e6e1', parent: '' },
  '児童の様子': { color: '#ffdce0', parent: '' },
  'Aさん': { color: '#ffdce0', parent: '児童の様子' },
  'Bさん': { color: '#ffdce0', parent: '児童の様子' },
  '学年会': { color: '#dcf0ff', parent: '' },
  '行事': { color: '#e6ffcc', parent: '' },
  '音楽会': { color: '#ffe6cc', parent: '行事' },
  '研修': { color: '#ffccff', parent: '' }
};
const NOTES = [
  { id: 106, date: '2026/10/21 15:48', folder: 'Aさん', year: YEAR, content: '休み時間、低学年の子に鉄棒を教えていた。本人に伝えたら照れていた。', attachments: [] },
  { id: 105, date: '2026/10/21 12:10', folder: '学年会', year: YEAR, content: '音楽会：合奏の練習は火・木の5校時。体育館は学年で交代。\n楽器の運搬は前日の放課後。', attachments: [{ id: 51, type: 'drive', name: '音楽会練習割り振り表', url: 'https://drive.example/b' }] },
  { id: 104, date: '2026/10/20 17:02', folder: '音楽会', year: YEAR, content: '衣装は白シャツ＋黒ズボン。おたより10/23配布。', attachments: [{ id: 52, type: 'file', name: 'おたより案.pdf', url: 'https://drive.example/c' }] },
  { id: 103, date: '2026/10/19 16:35', folder: '研修', year: YEAR, content: '校内研：「問い」をつくる導入の工夫。\n・既習とのズレを見せる\n・予想を立ててから確かめる', attachments: [{ id: 53, type: 'url', name: '研修資料（共有ドライブ）', url: 'https://example.com/k' }] },
  { id: 102, date: '2026/10/16 15:20', folder: 'Bさん', year: YEAR, content: '音読の声が大きくなってきた。保護者にも連絡帳で伝えた。', attachments: [] },
  { id: 101, date: '2026/10/14 09:05', folder: '未分類', year: YEAR, content: '教材室のプロジェクター、ケーブル交換済み。', attachments: [] }
];

function store() {
  return {
    settings: {
      year: YEAR,
      configByYear: {
        [YEAR]: {
          grade: '5', className: '1組', termType: '2', countMorning: false,
          zenkiStart: '2026-04-06', zenkiEnd: '2026-10-09', koukiStart: '2026-10-13', koukiEnd: '2027-03-24',
          haruStart: '2027-03-25', haruEnd: '2027-04-05', natsuStart: '2026-07-21', natsuEnd: '2026-08-31',
          akiStart: '2026-10-10', akiEnd: '2026-10-12', fuyuStart: '2026-12-25', fuyuEnd: '2027-01-07',
          baseTimetable
        }
      },
      foldersByYear: { [YEAR]: FOLDERS },
      folderDetailsByYear: { [YEAR]: FOLDER_DETAILS }
    },
    data: Object.assign(history(), thisWeek()),
    notes: NOTES,
    meta: { revision: 12, legacyChecked: true }
  };
}

// ---- google.script.run のモック（test/browser.test.js と同じ形） ----
const MOCK_INIT = (cfg) => {
  const m = window.__mock = { store: cfg.store };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function runner() {
    let ok = function() {}, fail = function() {};
    const r = {
      withSuccessHandler(f) { ok = f; return r; },
      withFailureHandler(f) { fail = f; return r; },
      loadDataFromServer() { setTimeout(() => ok(clone(m.store)), 5); },
      saveDataToServer(settings, data, notes, expected) {
        setTimeout(() => { const rev = m.store.meta.revision + 1; m.store = { settings, data, notes, meta: { revision: rev, legacyChecked: true } }; ok({ ok: true, revision: rev }); }, 5);
      },
      uploadFileFromForm() { setTimeout(() => ok({ url: 'https://drive.example/x', name: 'x.pdf' }), 5); },
      uploadFileData(name) { setTimeout(() => ok({ url: 'https://drive.example/y', name }), 5); },
      searchDriveFiles(q) {
        setTimeout(() => ok([
          { name: '5年 流れる水のはたらき 指導案.docx', url: 'https://drive.example/1' },
          { name: '流水実験ワークシート.pdf', url: 'https://drive.example/2' },
          { name: '理科 実験の記録（5年1組）', url: 'https://drive.example/3' }
        ]), 5);
      }
    };
    return r;
  }
  window.google = { script: { run: { withSuccessHandler: (f) => runner().withSuccessHandler(f), withFailureHandler: (f) => runner().withFailureHandler(f) } } };
};

async function main() {
  const browser = await chromium.launch({ args: ['--lang=ja-JP'] });
  const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  await context.clock.install({ time: new Date(TODAY) });
  await context.route('https://holidays-jp.github.io/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HOLIDAYS) }));
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('http://app.test/fonts/**', r => {
    const f = path.join(__dirname, decodeURIComponent(new URL(r.request().url()).pathname));
    r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'font/woff2', body: fs.readFileSync(f) });
  });
  await context.route('http://app.test/', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }));
  await context.addInitScript(MOCK_INIT, { store: store() });

  const page = await context.newPage();
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.error('pageerror:', e.message));
  await page.goto('http://app.test/');
  await page.waitForFunction(() => document.getElementById('loadingScreen').style.display === 'none' || getComputedStyle(document.getElementById('loadingScreen')).display === 'none');
  // 祝日や今日の位置がちゃんと反映された状態から撮る
  await page.evaluate(async () => {
    currentMonday = new Date(2026, 9, 19); updateView();
    // 時計を止めているので自動保存のトーストが出たままにならないよう隠す
    document.getElementById('saveToast').style.opacity = 0;
    await document.fonts.load('16px "BIZ UDPGothic"'); await document.fonts.load('bold 16px "BIZ UDPGothic"');
    await document.fonts.ready;
  });
  await page.waitForTimeout(400);

  const shot = async (name, sel, opts = {}) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const el = page.locator(sel).first();
    await el.waitFor({ state: 'visible' });
    await el.screenshot({ path: path.join(OUT, name + '.png'), animations: 'disabled', ...opts });
    console.log('shot', name);
  };
  const closeAll = () => page.evaluate(() => {
    document.querySelectorAll('.modal-overlay').forEach(m => { m.style.display = 'none'; });
    document.getElementById('undoToast').style.display = 'none';
    document.getElementById('saveToast').style.opacity = 0;
  });
  // 撮った画像の中で、各要素がどこにあるか（画像のピクセル座標）を記録する。動画側で寄る・囲むのに使う
  const rects = {};
  const measure = async (name, rootSel, sels) => {
    rects[name] = await page.evaluate(([rootSel, sels]) => {
      const root = document.querySelector(rootSel).getBoundingClientRect();
      const out = {};
      sels.forEach((s) => { const e = document.querySelector(s); if (!e) return; const r = e.getBoundingClientRect(); out[s] = [r.left - root.left, r.top - root.top, r.width, r.height].map(v => Math.round(v * 2)); });
      return out;
    }, [rootSel, sels]);
  };
  const fullPage = (name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }).then(() => console.log('shot', name));

  // 1. 週案（作り込んだ週）
  await shot('week', '.notebook');
  {
    const sels = ['.header-top', '.btn-group', '.week-navigation', '.timetable', '#weeklyCount', '#displayClassInfo'];
    for (let d = 0; d < 5; d++) { sels.push('#th-' + d); ['gyoji', 'morning', 1, 2, 3, 4, 5, 6, 'renraku', 'shidou', 'kaigi'].forEach(p => sels.push(`#cell-${d}-${p}`)); }
    await measure('week', '.notebook', sels.concat(Array.from({ length: 10 }, (_, i) => `.btn-group button:nth-child(${i + 1})`)));
  }
  await fullPage('week-page');

  // 2. まっさらな来週 → 基本時間割を読込
  await page.evaluate(() => { changeWeek(1); });
  await shot('empty', '.notebook');
  await page.evaluate(() => { loadBaseTimetable(); });
  await page.evaluate(() => { document.getElementById('saveToast').style.opacity = 0; });
  await shot('base-loaded', '.notebook');
  await fullPage('base-loaded-page');
  await page.evaluate(() => { performUndo(); });
  await closeAll();

  // 3. 先週コピー（今週の単元ごと来週へ）
  await page.evaluate(() => { copyPreviousWeek(); });
  await page.evaluate(() => { document.getElementById('saveToast').style.opacity = 0; });
  await shot('copied', '.notebook');
  await fullPage('copied-page');
  await page.evaluate(() => { performUndo(); });
  await closeAll();

  // 4. Excel一括貼付
  await page.evaluate(() => {
    openExcelImportModal();
    document.getElementById('excelPasteArea').value = ['国\t算\t国\t国\t算', '算\t国\t算\t算\t国', '社\t理\t音\t社\t理', '体\t理\t家\t体\t道', '外\t図\t学\t外\t家', '総\t図\t\t総\t体'].join('\n');
  });
  await shot('excel', '#excelImportModal .modal-box');
  await page.evaluate(() => { executeExcelImport(); document.getElementById('saveToast').style.opacity = 0; });
  await shot('excel-done', '.notebook');
  await page.evaluate(() => { performUndo(); changeWeek(-1); });
  await closeAll();

  // 5. コマの入力（単元・連絡・記録・添付）
  await page.evaluate(() => { openInputModal(1, '3'); });
  await shot('input', '#inputModal .modal-box');
  await measure('input', '#inputModal .modal-box', ['#inputUnit', '#inputContact', '#inputRecord', '#recordAttachmentArea', '#pasteCellBtn', '#checkSplit']);
  await closeAll();
  // 2教科に分割
  await page.evaluate(() => { openInputModal(4, '6'); });
  await shot('input-split', '#inputModal .modal-box');
  await closeAll();
  // 行事・指導記録の欄
  await page.evaluate(() => { openInputModal(2, 'shidou'); });
  await shot('input-shidou', '#inputModal .modal-box');
  await closeAll();
  // ドライブ検索
  await page.evaluate(() => { openInputModal(1, '3'); openDriveSearchModal(); document.getElementById('driveSearchInput').value = '流水'; executeDriveSearch(); });
  await page.waitForTimeout(200);
  await shot('drive', '#driveSearchModal .modal-box');
  await closeAll();

  // 6. ドラッグでコピー（行のハイライトを演出用に撮る）
  await page.evaluate(() => { document.getElementById('cell-2-2').style.backgroundColor = '#fff3c4'; });
  await shot('drag', '.notebook');
  await page.evaluate(() => { document.getElementById('cell-2-2').style.backgroundColor = ''; });

  // 7. 元に戻す・保存のトースト
  await page.evaluate(() => {
    rememberForUndo('test'); offerUndo('先週から 30 コマをコピーしました');
    const t = document.getElementById('saveToast'); t.innerText = 'クラウドに保存しました ✅'; t.style.opacity = 1; t.style.transition = 'none';
  });
  await shot('toast-undo', '#undoToast');
  await shot('toast-save', '#saveToast');
  await closeAll();

  // 8. 土日表示・祝日（スポーツの日の週）
  await page.evaluate(() => { currentMonday = new Date(2026, 9, 12); updateView(); toggleWeekend(); });
  await shot('weekend', '.notebook');
  await page.evaluate(() => { toggleWeekend(); currentMonday = new Date(2026, 9, 19); updateView(); });

  // 9. 時数集計
  await page.evaluate(() => { openSummaryModal(); });
  await shot('summary', '#summaryModal .modal-box');
  await measure('summary', '#summaryModal .modal-box', ['#summaryTableElement', '#summaryTableElement tbody tr:nth-child(1)', '#summaryTableElement tbody tr:nth-child(3)', '#summaryTableElement thead th:nth-child(2)', '#summaryTableElement thead th:nth-child(5)', '#summaryTableElement thead th:nth-child(6)', '#summaryTableElement thead th:nth-child(7)', '#summaryModal .btn-save']);
  await closeAll();

  // 10. 印刷（漢字／ひらがな）— window.open の先を撮る
  await page.evaluate(() => { openPrintModal(); });
  await shot('print-modal', '#printModal .modal-box');
  await closeAll();
  // 印刷は window.open した窓に document.write するので、書かれる HTML を横取りして別ページで開く
  await page.evaluate(() => { window.open = () => ({ document: { write(h) { window.__printHTML = h; }, close() {} } }); });
  for (const mode of ['kanji', 'hiragana']) {
    const html = await page.evaluate((m) => { printTimetable(m, true); return window.__printHTML; }, mode);
    const fixed = html.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="/fonts/biz-udpgothic/fonts.css">');
    await context.route('http://app.test/print-' + mode, r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixed }));
    const pop = await context.newPage();
    await pop.setViewportSize({ width: 1180, height: 1000 });
    await pop.goto('http://app.test/print-' + mode);
    await pop.evaluate(async () => { await document.fonts.load('16px "BIZ UDPGothic"'); await document.fonts.load('bold 16px "BIZ UDPGothic"'); await document.fonts.ready; });
    await pop.waitForTimeout(400);
    await pop.locator('.sheet').screenshot({ path: path.join(OUT, `print-${mode}.png`) });
    console.log('shot', 'print-' + mode);
    await pop.close();
  }

  // 11. クイックノート
  await page.evaluate(() => { openNoteModal(); });
  await page.waitForTimeout(200);
  await shot('notes', '#noteModal .modal-box');
  await page.evaluate(() => { document.getElementById('noteModal').querySelector('.modal-box').scrollTop = 0; openFolderModal(); document.getElementById('newFolderName').value = '運動会'; });
  await shot('folder', '#folderModal .modal-box');
  await closeAll();

  // 12. 全体検索
  await page.evaluate(() => { openSearchModal(); document.getElementById('searchInput').value = '分数'; executeSearch(); });
  await page.waitForTimeout(200);
  await shot('search', '#searchModal .modal-box');
  await closeAll();

  // 13. Gemini（プロンプトをつくってコピー）
  await page.evaluate(() => { geminiWeeklyReport(); });
  await shot('gemini-weekly', '#geminiModal .modal-box');
  await closeAll();
  await page.evaluate(() => { openInputModal(0, '1'); geminiLessonPlan(); });
  await shot('gemini-plan', '#geminiModal .modal-box');
  await closeAll();
  await page.evaluate(() => { openSummaryModal(); geminiAnalyzeHours(); });
  await shot('gemini-hours', '#geminiModal .modal-box');
  await closeAll();
  await page.evaluate(() => { openNoteModal(); geminiSummarizeNotes(); });
  await shot('gemini-notes', '#geminiModal .modal-box');
  await closeAll();

  // 14. 設定（学期・休業・基本時間割・バックアップ）
  await page.evaluate(() => { openSettingModal(); });
  await shot('settings', '#settingModal .modal-box');
  await page.evaluate(() => { const b = document.querySelector('#settingModal .modal-box'); b.scrollTop = b.scrollHeight; });
  await shot('settings-bottom', '#settingModal .modal-box');
  await page.evaluate(() => { document.querySelector('#settingModal .modal-box').scrollTop = 0; });
  await measure('settings', '#settingModal .modal-box', ['#setYear', '#setCountMorning', '#zenkiStart', '#natsuStart', '#fuyuEnd', '#base-0-1', '#importFileInput']);
  fs.writeFileSync(path.join(OUT, 'rects.json'), JSON.stringify(rects, null, 1));
  await closeAll();

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
