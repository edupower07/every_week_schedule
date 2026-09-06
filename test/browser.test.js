// index.html（ブラウザ側）を Playwright で動かし、google.script.run をモックして主要な流れを検証する。
// 実行: node test/browser.test.js   （playwright が必要。グローバル導入なら NODE_PATH=<global node_modules> を付ける）
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');

let playwright;
try { playwright = require('playwright'); }
catch (e) { console.error('playwright が見つかりません。 npm i -D playwright  か  NODE_PATH に playwright のある node_modules を指定してください。'); process.exit(2); }

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const schoolYear = (d) => String((d.getMonth() + 1) <= 3 ? d.getFullYear() - 1 : d.getFullYear());
const NOW_YEAR = schoolYear(new Date());

// ---- google.script.run のモック（ブラウザ内で動く） ----
const MOCK_INIT = (cfg) => {
  const m = window.__mock = { store: cfg.store, failLoad: cfg.failLoad, failSave: cfg.failSave || 0, delay: cfg.delay || 5, saveCalls: [], loadCalls: 0, uploads: [] };
  const clone = (o) => JSON.parse(JSON.stringify(o === undefined ? null : o));
  function serverLoad() {
    m.loadCalls++;
    if (!m.store) m.store = { settings: {}, data: {}, notes: [], meta: { revision: 1, legacyChecked: true } };
    return clone(m.store);
  }
  function serverSave(settings, data, notes, expected) {
    const cur = m.store; const curRev = cur ? cur.meta.revision : 0;
    const nonEmpty = cur && (Object.keys(cur.data).length + cur.notes.length > 0);
    if (cur && nonEmpty && (expected === null || expected === undefined)) return { ok: false, conflict: true, reason: 'NOT_LOADED', current: clone(cur) };
    if (cur && expected !== curRev) return { ok: false, conflict: true, reason: 'REVISION_MISMATCH', current: clone(cur) };
    m.store = { settings: clone(settings), data: clone(data), notes: clone(notes), meta: { revision: curRev + 1, legacyChecked: true } };
    return { ok: true, revision: curRev + 1 };
  }
  function runner() {
    let ok = function() {}, fail = function() {};
    const r = {
      withSuccessHandler(f) { ok = f; return r; },
      withFailureHandler(f) { fail = f; return r; },
      loadDataFromServer() { setTimeout(() => { if (m.failLoad) { fail(new Error('mock load failure')); return; } ok(serverLoad()); }, m.delay); },
      saveDataToServer(settings, data, notes, expected) {
        const args = clone({ settings, data, notes, expected: (expected === undefined ? null : expected) });
        m.saveCalls.push(args);
        setTimeout(() => {
          if (m.failSave > 0) { m.failSave--; fail(new Error('mock save failure')); return; }
          ok(serverSave(args.settings, args.data, args.notes, args.expected));
        }, m.delay);
      },
      uploadFileFromForm() { setTimeout(() => ok({ url: 'https://drive.example/x', name: 'x.pdf' }), m.delay); },
      uploadFileData(name, mime, b64) { m.uploads.push({ name, mime, size: b64.length }); setTimeout(() => ok({ url: 'https://drive.example/y', name }), m.delay); },
      searchDriveFiles(q) { setTimeout(() => ok([{ name: 'found ' + q, url: 'https://drive.example/f' }]), m.delay); }
    };
    return r;
  }
  window.google = { script: { run: { withSuccessHandler: (f) => runner().withSuccessHandler(f), withFailureHandler: (f) => runner().withFailureHandler(f) } } };
};

function baseStore(year = NOW_YEAR) {
  return {
    settings: {
      year: year,
      configByYear: { [year]: { grade: '5', className: '1組', termType: '2', countMorning: false, baseTimetable: {} } },
      foldersByYear: { [year]: ['未分類', '児童の様子'] },
      folderDetailsByYear: { [year]: { '未分類': { color: '#e8e6e1', parent: '' }, '児童の様子': { color: '#ffdce0', parent: '' } } }
    },
    data: {}, notes: [], meta: { revision: 3, legacyChecked: true }
  };
}
const lesson = (subject, unit = '', extra = {}) => Object.assign({ subject, unit, contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] }, extra);

async function openApp(browser, cfg = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('https://holidays-jp.github.io/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cfg.holidays || {}) }));
  await context.route('http://app.test/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: HTML }));
  await context.addInitScript(MOCK_INIT, { store: cfg.store === undefined ? baseStore() : cfg.store, failLoad: !!cfg.failLoad, failSave: cfg.failSave || 0, delay: cfg.delay || 5 });
  const page = await context.newPage();
  const dialogs = []; const errors = [];
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    const accept = cfg.dialog ? cfg.dialog(d.message()) : true;
    if (d.type() === 'prompt') await d.accept(cfg.promptValue || ''); else if (accept) await d.accept(); else await d.dismiss();
  });
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  await page.goto('http://app.test/index.html');
  return { context, page, dialogs, errors };
}
const waitFor = (page, fn, timeout = 8000) => page.waitForFunction(fn, null, { timeout, polling: 50 });
const ready = (page) => page.waitForSelector('#cell-0-1', { timeout: 8000 });

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('読み込み→描画：版番号を保持し、見出しに年度が出る', async (browser) => {
  const { context, page, errors } = await openApp(browser);
  await ready(page);
  assert.strictEqual(await page.evaluate(() => serverRevision), 3);
  assert.strictEqual(await page.evaluate(() => document.getElementById('loadingScreen').style.display), 'none');
  assert.match(await page.textContent('#displayClassInfo'), new RegExp(NOW_YEAR + '年度 5年1組'));
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('コマを保存すると版番号つきで送られ、サーバー側が更新される', async (browser) => {
  const { context, page, errors } = await openApp(browser);
  await ready(page);
  await page.evaluate(() => { openInputModal(0, 1); setSelectValue(document.getElementById('inputSubject'), '国語'); document.getElementById('inputUnit').value = 'ごんぎつね'; saveInputData(); });
  await waitFor(page, () => window.__mock.saveCalls.length === 1 && !saveInFlight && !hasUnsavedChanges);
  const r = await page.evaluate(() => ({ store: window.__mock.store, call: window.__mock.saveCalls[0], key: getDataKey(0, 1), rev: serverRevision }));
  assert.strictEqual(r.call.expected, 3);
  assert.strictEqual(r.store.meta.revision, 4);
  assert.strictEqual(r.rev, 4);
  assert.strictEqual(r.store.data[r.key].subject, '国語');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('連続した変更は1回にまとめ、送信中の変更は終わってから送る', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  await page.evaluate(() => { for (let i = 0; i < 5; i++) syncToServer(); });
  await waitFor(page, () => window.__mock.saveCalls.length === 1 && !saveInFlight);
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => window.__mock.saveCalls.length), 1, 'デバウンスで1回');
  await page.evaluate(() => { window.__mock.delay = 400; syncToServer(); });
  await page.waitForTimeout(500);                 // 400ms のデバウンス後、送信中
  assert.strictEqual(await page.evaluate(() => saveInFlight), true);
  await page.evaluate(() => flushSave());          // 送信中に再要求 → pending
  await waitFor(page, () => window.__mock.saveCalls.length === 3 && !saveInFlight && !hasUnsavedChanges);
  assert.strictEqual(await page.evaluate(() => window.__mock.store.meta.revision), 6);
  await context.close();
});

test('別端末の更新と競合したら、サーバーの最新にこちらの変更だけ重ねて再保存する', async (browser) => {
  const { context, page, errors } = await openApp(browser);
  await ready(page);
  const keys = await page.evaluate(() => {
    const kA = getDataKey(1, 2), kB = getDataKey(2, 3);
    appData[kA] = { subject: '算数', unit: 'こちら', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] };
    const m = window.__mock; m.store.data[kB] = { subject: '理科', unit: 'あちら' }; m.store.notes.push({ id: 99, content: 'remote note', date: '2026/09/01 10:00', folder: '未分類', year: appSettings.year }); m.store.meta.revision += 1;
    syncToServer();
    return { kA, kB };
  });
  await waitFor(page, () => window.__mock.saveCalls.length >= 2 && !saveInFlight && !hasUnsavedChanges);
  const r = await page.evaluate((k) => ({ store: window.__mock.store, calls: window.__mock.saveCalls.map(c => c.expected), local: { a: appData[k.kA], b: appData[k.kB], notes: appNotes.length }, rev: serverRevision }), keys);
  assert.deepStrictEqual(r.calls, [3, 4]);
  assert.strictEqual(r.store.data[keys.kA].unit, 'こちら');
  assert.strictEqual(r.store.data[keys.kB].unit, 'あちら');
  assert.strictEqual(r.store.notes.length, 1);
  assert.strictEqual(r.local.b.unit, 'あちら', '画面側にも相手の変更が取り込まれる');
  assert.strictEqual(r.local.notes, 1);
  assert.strictEqual(r.rev, 5);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('読み込み失敗時は操作できず保存もされない。再試行で復帰する', async (browser) => {
  const store = baseStore(); store.data['2026-09-07-1'] = lesson('国語');
  const { context, page, errors } = await openApp(browser, { store, failLoad: true });
  await waitFor(page, () => document.getElementById('loadingError').style.display === 'block');
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#timetableBody td').length), 0, '表は作られない');
  assert.strictEqual(await page.evaluate(() => serverRevision), null);
  await page.evaluate(() => syncToServer());
  await page.waitForTimeout(700);
  assert.strictEqual(await page.evaluate(() => window.__mock.saveCalls.length), 0, '保存は送られない');
  assert.match(await page.textContent('#saveToast'), /読み込みが完了していない/);
  await page.evaluate(() => { window.__mock.failLoad = false; });
  await page.click('#loadingError button:first-child');
  await ready(page);
  assert.strictEqual(await page.evaluate(() => serverRevision), 3);
  assert.strictEqual(await page.evaluate(() => document.getElementById('loadingScreen').style.display), 'none');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('ドラッグ＆ドロップ：空コマは何もしない・上書きは元に戻せる・種類違いは拒否', async (browser) => {
  const { context, page, errors } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    const L = (s, u) => ({ subject: s, unit: u, contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] });
    const evt = (src) => ({ preventDefault() {}, stopPropagation() {}, currentTarget: { style: {} }, dataTransfer: { getData: () => src } });
    const kEmpty = getDataKey(3, 4); delete appData[kEmpty];
    const kTarget = getDataKey(0, 1); appData[kTarget] = L('国語', 'U');
    handleDrop(evt(kEmpty), 0, 1);
    const stillThere = appData[kTarget] && appData[kTarget].subject === '国語';
    const kSrc = getDataKey(1, 1); appData[kSrc] = L('算数', 'V');
    handleDrop(evt(kSrc), 0, 1);
    const overwritten = appData[kTarget].subject === '算数';
    const undoVisible = document.getElementById('undoToast').style.display === 'flex';
    performUndo();
    const restored = appData[kTarget].subject === '国語';
    const kMemo = getDataKey(0, 'gyoji'); appData[kMemo] = { record: '運動会', attachments: [] };
    handleDrop(evt(kMemo), 2, 2);
    const blocked = !appData[getDataKey(2, 2)];
    renderCell(3, 4);
    const emptyDraggable = document.querySelector('#cell-3-4 .cell-content').getAttribute('draggable');
    return { stillThere, overwritten, undoVisible, restored, blocked, emptyDraggable };
  });
  assert.deepStrictEqual(r, { stillThere: true, overwritten: true, undoVisible: true, restored: true, blocked: true, emptyDraggable: null });
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('コマの添付が次に書くノートへ混入しない', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    openInputModal(0, 1);
    currentAttachments.push({ id: 1, name: 'x.pdf', url: 'https://example.com/x.pdf', type: 'file' });
    renderEditorAttachments();
    closeInputModal();
    openNoteModal();
    const areaEmpty = document.getElementById('noteAttachmentArea').children.length === 0;
    document.getElementById('newNoteInput').value = 'テストメモ';
    saveNote();
    return { areaEmpty, atts: appNotes[0].attachments.length, year: appNotes[0].year };
  });
  assert.strictEqual(r.areaEmpty, true);
  assert.strictEqual(r.atts, 0);
  assert.strictEqual(r.year, NOW_YEAR);
  await context.close();
});

test('リストに無い教科（Excel貼付の「学」など）を開いて保存しても消えない', async (browser) => {
  const { context, page, errors } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    appData[getDataKey(0, 2)] = { subject: '書写', unit: '', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] };
    openInputModal(0, 2);
    const shown = document.getElementById('inputSubject').value;
    document.getElementById('inputRecord').value = 'メモ';
    saveInputData();
    const kept = appData[getDataKey(0, 2)].subject;
    document.getElementById('excelPasteArea').value = '学\t国\n算\t理';
    executeExcelImport();
    const excel = [appData[getDataKey(0, 1)].subject, appData[getDataKey(1, 1)].subject, appData[getDataKey(0, 2)].subject, appData[getDataKey(1, 2)].subject];
    openInputModal(0, 1);
    const gakkatsu = document.getElementById('inputSubject').value;
    closeInputModal();
    return { shown, kept, excel, gakkatsu };
  });
  assert.strictEqual(r.shown, '書写');
  assert.strictEqual(r.kept, '書写');
  assert.deepStrictEqual(r.excel, ['学活', '国語', '算数', '理科']);
  assert.strictEqual(r.gakkatsu, '学活');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('単元名だけのコマが「未設定」で隠れない', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const text = await page.evaluate(() => { appData[getDataKey(4, 5)] = { subject: '', unit: '単元だけ', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] }; renderCell(4, 5); return document.getElementById('cell-4-5').innerText; });
  assert.ok(text.includes('単元だけ') && text.includes('教科未選択'), text);
  await context.close();
});

test('基本時間割の読込は祝日・休業日をスキップし、元に戻せる', async (browser) => {
  const { context, page, dialogs } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    getConfig().baseTimetable = { '0-1': '国語', '1-1': '算数', '2-1': '理科' };
    holidaysData[fmtDate(dateOfWeek(0))] = 'テスト祝日';
    getConfig().natsuStart = fmtDate(dateOfWeek(2)); getConfig().natsuEnd = fmtDate(dateOfWeek(2));
    loadBaseTimetable();
    const after = [!!appData[getDataKey(0, 1)], appData[getDataKey(1, 1)] && appData[getDataKey(1, 1)].subject, !!appData[getDataKey(2, 1)]];
    const toast = document.getElementById('undoToastMsg').innerText;
    performUndo();
    const undone = !appData[getDataKey(1, 1)];
    return { after, toast, undone };
  });
  assert.deepStrictEqual(r.after, [false, '算数', false]);
  assert.match(r.toast, /1コマ・祝日等 2日はスキップ/);
  assert.strictEqual(r.undone, true);
  assert.ok(dialogs.some(d => d.type === 'confirm' && d.message.includes('基本の時間割')));
  await context.close();
});

test('先週コピーも祝日をスキップする', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    const L = (s) => ({ subject: s, unit: 'u', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] });
    for (let d = 0; d < 2; d++) { const prev = dateOfWeek(d); prev.setDate(prev.getDate() - 7); appData[`${fmtDate(prev)}-1`] = L('社会'); }
    holidaysData[fmtDate(dateOfWeek(0))] = '祝';
    copyPreviousWeek();
    return [!!appData[getDataKey(0, 1)], appData[getDataKey(1, 1)] && appData[getDataKey(1, 1)].subject];
  });
  assert.deepStrictEqual(r, [false, '社会']);
  await context.close();
});

test('年度欄が不正なら保存を止める', async (browser) => {
  const { context, page, dialogs } = await openApp(browser);
  await ready(page);
  await page.evaluate(() => { openSettingModal(); document.getElementById('setYear').value = ''; saveSettings(); });
  assert.ok(dialogs.some(d => d.message.includes('4桁')));
  assert.strictEqual(await page.evaluate(() => appSettings.year), NOW_YEAR);
  assert.strictEqual(await page.evaluate(() => document.getElementById('settingModal').style.display), 'flex');
  await context.close();
});

test('時数集計：学活に標準時数（35）が付き、列見出しが「表示中の週」になる', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    appData[getDataKey(0, 3)] = { subject: '学活１', unit: '', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] };
    calculateTotalHours();
    const rows = Array.from(document.querySelectorAll('#summaryTableElement tbody tr'));
    const row = rows.find(tr => tr.firstChild.textContent.startsWith('学活'));
    return { row: row ? row.innerText : null, head: document.querySelector('#summaryTableElement thead').innerText, std: lastSummary.standard['学活'] };
  });
  assert.ok(r.row && r.row.includes('/ 35') && r.row.includes('34') && r.row.includes('%'), r.row);
  assert.ok(!r.row.includes('特活 35)'));
  assert.ok(r.head.includes('表示中の週'));
  assert.strictEqual(r.std, 35);
  await context.close();
});

test('フォルダ名に引用符があってもセレクトの値が壊れない', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const opts = await page.evaluate(() => { const y = currentSchoolYear(); getYearlyFolders(y).push('A"B<c>'); appSettings.folderDetailsByYear[y]['A"B<c>'] = { parent: '', color: '#ffdce0' }; updateNoteFolderSelects(); return Array.from(document.getElementById('newNoteFolderParent').options).map(o => o.value); });
  assert.ok(opts.includes('A"B<c>'), JSON.stringify(opts));
  await context.close();
});

test('保存に失敗し続けたら端末に退避し、次回起動時に復元できる', async (browser) => {
  const { context, page, dialogs, errors } = await openApp(browser);
  await ready(page);
  const key = await page.evaluate(() => {
    const k = getDataKey(0, 1);
    appData[k] = { subject: '国語', unit: '復元テスト', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] };
    for (let i = 0; i < 4; i++) onSaveFailure(new Error('simulated'));   // 3回の再試行も失敗した状態
    return k;
  });
  assert.strictEqual(await page.evaluate(() => saveFailed), true);
  assert.strictEqual(await page.evaluate(() => document.getElementById('syncIndicator').style.display), 'block');
  assert.ok(await page.evaluate((k) => JSON.parse(localStorage.getItem('weeklyPlan_unsavedDraft_v1')).snapshot.data[k].unit === '復元テスト', key));
  await page.reload();
  await ready(page);
  await waitFor(page, () => window.__mock.saveCalls.length >= 1 && !saveInFlight && !hasUnsavedChanges);
  assert.ok(dialogs.some(d => d.message.includes('保存できなかった変更が 1 件')), JSON.stringify(dialogs));
  const r = await page.evaluate((k) => ({ unit: window.__mock.store.data[k].unit, draft: localStorage.getItem('weeklyPlan_unsavedDraft_v1'), indicator: document.getElementById('syncIndicator').style.display }), key);
  assert.strictEqual(r.unit, '復元テスト');
  assert.strictEqual(r.draft, null);
  assert.strictEqual(r.indicator, 'none');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('新年度になっていたら切り替えを案内し、フォルダ構成を引き継ぐ', async (browser) => {
  const store = baseStore('2000');
  store.settings.foldersByYear['2000'].push('特別フォルダ');
  store.settings.folderDetailsByYear['2000']['特別フォルダ'] = { color: '#dcf0ff', parent: '' };
  const { context, page, dialogs, errors } = await openApp(browser, { store });
  await ready(page);
  await waitFor(page, () => window.__mock.saveCalls.length >= 1 && !saveInFlight && !hasUnsavedChanges);
  assert.ok(dialogs.some(d => d.type === 'confirm' && d.message.includes(NOW_YEAR + '年度になっています')), JSON.stringify(dialogs));
  const r = await page.evaluate(() => ({ year: appSettings.year, folders: appSettings.foldersByYear[appSettings.year], modal: document.getElementById('settingModal').style.display, header: document.getElementById('displayClassInfo').innerText, storeYear: window.__mock.store.settings.year }));
  assert.strictEqual(r.year, NOW_YEAR);
  assert.ok(r.folders.includes('特別フォルダ') && r.folders.includes('未分類'));
  assert.strictEqual(r.modal, 'flex');
  assert.ok(r.header.startsWith(NOW_YEAR + '年度'));
  assert.strictEqual(r.storeYear, NOW_YEAR);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('新年度の案内を断ると、その年度は再表示しない', async (browser) => {
  const { context, page, dialogs } = await openApp(browser, { store: baseStore('2000'), dialog: (msg) => !msg.includes('年度になっています') });
  await ready(page);
  await waitFor(page, () => window.__mock.saveCalls.length >= 1 && !saveInFlight);
  const r = await page.evaluate(() => ({ year: appSettings.year, dismissed: window.__mock.store.settings.yearRolloverDismissed }));
  assert.strictEqual(r.year, '2000');
  assert.strictEqual(r.dismissed, NOW_YEAR);
  assert.strictEqual(dialogs.filter(d => d.message.includes('年度になっています')).length, 1);
  await context.close();
});

test('検索結果からコマへジャンプすると該当セルが点滅する', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    appData[getDataKey(2, 3)] = { subject: '国語', unit: 'さがすワード', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] };
    document.getElementById('searchInput').value = 'さがす'; executeSearch();
    const btn = document.querySelector('#searchResultsArea button[data-period]');
    btn.click();
    return { period: btn.dataset.period, cls: document.getElementById('cell-2-3').className, weekly: document.getElementById('weeklyCount').innerText };
  });
  assert.strictEqual(r.period, '3');
  assert.ok(r.cls.includes('flash-cell'));
  assert.match(r.weekly, /この週の授業：1コマ/);
  await context.close();
});

test('印刷：朝自習の行を含められ、欄外に週のコマ数が出る', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const popupPromise = context.waitForEvent('page');
  await page.evaluate(() => {
    appData[getDataKey(0, 'morning')] = { subject: '国語', unit: '朝読書', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] };
    appData[getDataKey(0, 1)] = { subject: '算数', unit: 'わり算', contact: '', record: '', isSplit: false, subject2: '', unit2: '', attachments: [] };
    printTimetable('hiragana', true);
  });
  const popup = await popupPromise;
  await popup.waitForFunction(() => document.querySelector('table') !== null);
  const html = await popup.content();
  assert.ok(html.includes('r-morning') && html.includes('あさじしゅう') && html.includes('朝読書'), 'morning row printed');
  assert.ok(html.includes('授業 1コマ／朝自習 1回'));
  assert.ok(html.includes(NOW_YEAR + '年度'));
  await context.close();
});

test('ノート：削除は元に戻せる。日付順に並び、URLはリンクになる', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    const y = currentSchoolYear();
    appNotes.push({ id: 1, date: '2026/05/01 09:00', content: '古い <b>x</b> https://example.com/a?b=1&c=2 おわり', folder: '未分類', year: y, attachments: [] });
    appNotes.push({ id: 2, date: '2026/06/01 09:00', content: '新しい', folder: '未分類', year: y, attachments: [] });
    openNoteModal();
    document.getElementById('filterNoteYear').value = y; renderNotes();
    const list = document.getElementById('noteListArea');
    const firstDate = list.querySelector('span').innerText;
    const html = list.innerHTML;
    deleteNote('2');
    const afterDelete = appNotes.length;
    performUndo();
    return { firstDate, html, afterDelete, afterUndo: appNotes.length };
  });
  assert.ok(r.firstDate.includes('2026/06/01'), r.firstDate);
  assert.ok(r.html.includes('<a class="note-link" href="https://example.com/a?b=1&amp;c=2"') && r.html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.strictEqual(r.afterDelete, 1);
  assert.strictEqual(r.afterUndo, 2);
  await context.close();
});

test('コマのコピー＆貼り付け（タッチ端末向け）', async (browser) => {
  const { context, page } = await openApp(browser);
  await ready(page);
  const r = await page.evaluate(() => {
    appData[getDataKey(0, 1)] = { subject: '社会', unit: '米づくり', contact: '宿題', record: '', isSplit: false, subject2: '', unit2: '', attachments: [{ id: 1, name: 'a.pdf', url: 'https://example.com/a.pdf', type: 'file' }] };
    openInputModal(0, 1); copyCurrentCell(); closeInputModal();
    openInputModal(1, 1);
    const enabled = !document.getElementById('pasteCellBtn').disabled;
    pasteIntoCurrentCell(); saveInputData();
    const d = appData[getDataKey(1, 1)];
    return { enabled, subject: d.subject, unit: d.unit, contact: d.contact, atts: d.attachments.length, sameId: d.attachments[0].id === 1 };
  });
  assert.deepStrictEqual(r, { enabled: true, subject: '社会', unit: '米づくり', contact: '宿題', atts: 1, sameId: false });
  await context.close();
});

test('土日表示の設定と祝日データが端末に保存される', async (browser) => {
  const { context, page } = await openApp(browser, { holidays: { '2026-11-03': '文化の日' } });
  await ready(page);
  await waitFor(page, () => !!holidaysData['2026-11-03']);
  await page.evaluate(() => toggleWeekend());
  const r = await page.evaluate(() => ({ weekend: localStorage.getItem('weeklyPlan_showWeekend'), cache: JSON.parse(localStorage.getItem('weeklyPlan_holidayCache_v1')).data['2026-11-03'] }));
  assert.deepStrictEqual(r, { weekend: '1', cache: '文化の日' });
  await context.close();
});

(async () => {
  const browser = await playwright.chromium.launch();
  let failed = 0;
  for (const t of tests) {
    const started = Date.now();
    try { await t.fn(browser); console.log(`  ok   ${t.name} (${Date.now() - started}ms)`); }
    catch (e) { failed++; console.log(`  FAIL ${t.name}\n       ${(e && e.stack ? e.stack : String(e)).split('\n').slice(0, 4).join('\n       ')}`); }
  }
  await browser.close();
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
