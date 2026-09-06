// Code.gs（Apps Script 側）のロジックを、GAS のサービスをモックしてローカルで検証する。
// 実行: node test/server.test.js
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');

function makeEnv(opts = {}) {
  let tick = 0;
  let nextId = 1;
  const env = {
    activeEmail: opts.activeEmail === undefined ? 'teacher@example.com' : opts.activeEmail,
    effectiveEmail: opts.effectiveEmail === undefined ? (opts.activeEmail === undefined ? 'teacher@example.com' : opts.activeEmail) : opts.effectiveEmail,
    files: [], folders: [], props: {}, lockCount: 0, lockHeld: false, sheetValues: opts.sheetValues || null
  };
  const mkFile = (f) => ({
    getId: () => f.id, getName: () => f.name, isTrashed: () => f.trashed,
    getLastUpdated: () => new Date(f.lastUpdated),
    getBlob: () => ({ getDataAsString: () => f.content }),
    setContent: (c) => { f.content = c; f.lastUpdated = 1e12 + (++tick); },
    makeCopy: (name) => { const nf = { id: 'f' + (nextId++), name, content: f.content, trashed: false, lastUpdated: 1e12 + (++tick) }; env.files.push(nf); return mkFile(nf); },
    getUrl: () => 'https://drive.example/' + f.id,
    addViewer: (e) => { f.viewers = (f.viewers || []).concat(e); },
    setSharing: () => { f.sharedPublic = true; }
  });
  const iter = (arr, wrap) => { let i = 0; return { hasNext: () => i < arr.length, next: () => wrap(arr[i++]) }; };
  const parseQuery = (q) => {
    const m = q.match(/^title (=|contains) '((?:[^'\\]|\\.)*)' and trashed = false$/);
    if (!m) throw new Error('mock: unsupported/invalid query: ' + q);
    return { op: m[1], val: m[2].replace(/\\(.)/g, '$1') };
  };
  env.addFile = (name, content, extra = {}) => { const f = Object.assign({ id: 'f' + (nextId++), name, content, trashed: false, lastUpdated: 1e12 + (++tick) }, extra); env.files.push(f); return f; };
  const mkFolder = (fo) => ({ getId: () => fo.id, getName: () => fo.name, createFile: (blob) => { const f = env.addFile(blob.name || 'blob', '(binary)'); f.folder = fo.name; f.mime = blob.mime; return mkFile(f); } });
  const sandbox = {
    console,
    Session: {
      getActiveUser: () => ({ getEmail: () => env.activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => env.effectiveEmail })
    },
    DriveApp: {
      searchFiles: (q) => { const { op, val } = parseQuery(q); return iter(env.files.filter(f => !f.trashed && (op === '=' ? f.name === val : f.name.includes(val))), mkFile); },
      getFileById: (id) => { const f = env.files.find(x => x.id === id); if (!f) throw new Error('mock: file not found ' + id); return mkFile(f); },
      createFile: (name, content) => mkFile(env.addFile(name, content)),
      searchFolders: (q) => { const { val } = parseQuery(q); return iter(env.folders.filter(fo => fo.name === val), mkFolder); },
      createFolder: (name) => { const fo = { id: 'd' + (nextId++), name }; env.folders.push(fo); return mkFolder(fo); },
      getFilesByName: () => { throw new Error('getFilesByName は使わない（ゴミ箱内も拾うため）'); },
      getFoldersByName: () => { throw new Error('getFoldersByName は使わない'); }
    },
    PropertiesService: {
      getUserProperties: () => ({ getProperty: (k) => (k in env.props ? env.props[k] : null), setProperty: (k, v) => { env.props[k] = v; } }),
      getDocumentProperties: () => { throw new Error('mock: no document'); },
      getScriptProperties: () => ({ getKeys: () => [], getProperty: () => null })
    },
    LockService: {
      getUserLock: () => ({
        tryLock: () => { env.lockCount++; if (env.lockHeld) throw new Error('mock: re-entrant lock'); env.lockHeld = true; return true; },
        releaseLock: () => { env.lockHeld = false; }
      })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => {
        if (!env.sheetValues) throw new Error('mock: not bound');
        return { getSheets: () => [{ getDataRange: () => ({ getValues: () => env.sheetValues }) }] };
      }
    },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Utilities: {
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      base64Decode: (s) => Buffer.from(s, 'base64')
    },
    Logger: { log: () => {} },
    HtmlService: { createHtmlOutputFromFile: () => ({ setTitle() { return this; }, addMetaTag() { return this; } }) }
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox, { filename: 'Code.gs' });
  env.gs = sandbox;
  env.userFile = () => env.files.filter(f => f.name === 'weekly_plan_data_teacher_example_com.json' && !f.trashed);
  return env;
}

const eqJson = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('新規ユーザー：読込でファイルが作られ、版番号つきで保存・再読込できる', () => {
  const env = makeEnv();
  const loaded = env.gs.loadDataFromServer();
  eqJson(loaded.data, {});
  assert.strictEqual(loaded.meta.revision, 1);
  assert.strictEqual(loaded.meta.legacyChecked, true);
  assert.strictEqual(env.userFile().length, 1, 'ユーザー別ファイルが1つ作られる');
  assert.ok(Object.keys(env.props).some(k => k.startsWith('DATA_FILE_ID_')), 'ファイルIDが記憶される');

  const res = env.gs.saveDataToServer({ year: '2026' }, { '2026-09-07-1': { subject: '国語' } }, [{ id: 1, content: 'a' }], 1);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.revision, 2);
  const again = env.gs.loadDataFromServer();
  assert.strictEqual(again.meta.revision, 2);
  assert.strictEqual(again.data['2026-09-07-1'].subject, '国語');
  assert.strictEqual(again.notes.length, 1);
  assert.strictEqual(env.userFile().length, 1, '同名ファイルが増えない');
});

test('版番号が古い保存は上書きされず conflict が返る', () => {
  const env = makeEnv();
  env.gs.loadDataFromServer();
  assert.strictEqual(env.gs.saveDataToServer({}, { a: { subject: 'A' } }, [], 1).ok, true);   // rev 2
  const stale = env.gs.saveDataToServer({}, { b: { subject: 'B' } }, [], 1);                 // 古い版で保存
  assert.strictEqual(stale.ok, false);
  assert.strictEqual(stale.conflict, true);
  assert.strictEqual(stale.reason, 'REVISION_MISMATCH');
  eqJson(Object.keys(stale.current.data), ['a'], 'サーバー側の最新が返る');
  assert.strictEqual(stale.current.meta.revision, 2);
});

test('読込が済んでいない（版番号なし）クライアントは、中身のあるファイルを上書きできない', () => {
  const env = makeEnv();
  env.gs.loadDataFromServer();
  env.gs.saveDataToServer({}, { a: { subject: 'A' } }, [], 1);
  const res = env.gs.saveDataToServer({}, {}, [], undefined);   // 旧クライアント／未読込の保存
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'NOT_LOADED');
  const stored = JSON.parse(env.userFile()[0].content);
  eqJson(Object.keys(stored.data), ['a'], 'データは消えていない');
});

test('旧ファイルからの移行は一度だけ：全部消しても復活しない', () => {
  const env = makeEnv();
  env.addFile('weekly_plan_data.json', JSON.stringify({ settings: { year: '2025' }, data: { '2025-05-01-1': { subject: '算数' } }, notes: [{ id: 7, content: 'old' }] }));
  const loaded = env.gs.loadDataFromServer();
  assert.strictEqual(loaded.data['2025-05-01-1'].subject, '算数', '旧データが取り込まれる');
  assert.strictEqual(loaded.meta.legacyChecked, true);
  // 利用者が全部削除して保存
  const res = env.gs.saveDataToServer(loaded.settings, {}, [], loaded.meta.revision);
  assert.strictEqual(res.ok, true);
  const after = env.gs.loadDataFromServer();
  eqJson(after.data, {}, '空にした後に旧データが復活しない');
  eqJson(after.notes, []);
});

test('設定だけ入った空のユーザーファイル：旧データを補うが、今の設定は残す', () => {
  const env = makeEnv();
  env.addFile('weekly_plan_data_teacher_example_com.json', JSON.stringify({ settings: { year: '2026', configByYear: { '2026': { grade: '3' } } }, data: {}, notes: [] }));
  env.addFile('weekly_plan_data.json', JSON.stringify({ settings: { year: '2024', configByYear: { '2024': { grade: '5' } } }, data: { k: { subject: '理科' } }, notes: [] }));
  const loaded = env.gs.loadDataFromServer();
  assert.strictEqual(loaded.settings.year, '2026', '現在の設定が優先される');
  assert.strictEqual(loaded.settings.configByYear['2026'].grade, '3');
  assert.strictEqual(loaded.data.k.subject, '理科', '旧データは補われる');
});

test('同名ファイルが複数・ゴミ箱にもある場合：ゴミ箱を除いた最新を使い、以後はIDで固定する', () => {
  const env = makeEnv();
  const older = env.addFile('weekly_plan_data_teacher_example_com.json', JSON.stringify({ data: { old: { subject: 'OLD' } }, notes: [] }));
  const newer = env.addFile('weekly_plan_data_teacher_example_com.json', JSON.stringify({ data: { new: { subject: 'NEW' } }, notes: [] }));
  env.addFile('weekly_plan_data_teacher_example_com.json', JSON.stringify({ data: { trash: { subject: 'TRASH' } }, notes: [] }), { trashed: true });
  const loaded = env.gs.loadDataFromServer();
  eqJson(Object.keys(loaded.data), ['new']);
  const propKey = Object.keys(env.props).find(k => k.startsWith('DATA_FILE_ID_'));
  assert.strictEqual(env.props[propKey], newer.id);
  // 古い方を後から更新しても、IDで固定されているので影響しない
  older.content = JSON.stringify({ data: { old2: {} }, notes: [] }); older.lastUpdated = 9e12;
  eqJson(Object.keys(env.gs.loadDataFromServer().data), ['new']);
});

test('記憶していたファイルがゴミ箱に入っていたら名前検索に戻る', () => {
  const env = makeEnv();
  env.gs.loadDataFromServer();
  const f = env.userFile()[0];
  f.trashed = true;
  const loaded = env.gs.loadDataFromServer();
  assert.strictEqual(loaded.meta.revision, 1, '新しいファイルとして作り直される');
  assert.strictEqual(env.userFile().length, 1);
});

test('利用者のメールが取れない場合はエラーにして、共有ファイルを作らない', () => {
  const env = makeEnv({ activeEmail: '' });
  assert.throws(() => env.gs.loadDataFromServer(), /ウェブアプリケーションにアクセスしているユーザー/);
  assert.strictEqual(env.files.length, 0);
});

test('壊れたJSONのファイルは、上書きする前に控えを残す', () => {
  const env = makeEnv();
  env.addFile('weekly_plan_data_teacher_example_com.json', '{"data": {"x": broken');
  const loaded = env.gs.loadDataFromServer();
  eqJson(loaded.data, {});
  const backups = env.files.filter(f => f.name.includes('.corrupt-'));
  assert.strictEqual(backups.length, 1);
  assert.strictEqual(backups[0].content, '{"data": {"x": broken');
});

test('ドライブ検索：キーワードの引用符がエスケープされる', () => {
  const env = makeEnv();
  env.addFile("週案 'A組' メモ.pdf", '');
  env.addFile('other.pdf', '');
  const res = env.gs.searchDriveFiles("'A組'");
  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].name, "週案 'A組' メモ.pdf");
});

test('添付：公開共有しない。所有者として実行中のときだけ本人に閲覧権限を付ける', () => {
  const same = makeEnv();
  const r1 = same.gs.uploadFileData('photo.jpg', 'image/jpeg', Buffer.from('abc').toString('base64'));
  assert.ok(r1.url && r1.name === 'photo.jpg');
  const up1 = same.files.find(f => f.name === 'photo.jpg');
  assert.ok(!up1.sharedPublic && !up1.viewers, '本人実行なら共有設定なし');
  assert.strictEqual(up1.folder, '週案アプリ_添付ファイル');

  const owner = makeEnv({ activeEmail: 'teacher@example.com', effectiveEmail: 'owner@example.com' });
  owner.gs.uploadFileFromForm({ myFile: { name: 'p.pdf', mime: 'application/pdf' } });
  const up2 = owner.files.find(f => f.name === 'p.pdf');
  eqJson(up2.viewers, ['teacher@example.com']);
  assert.ok(!up2.sharedPublic);
});

test('添付：ファイル未選択はエラーメッセージを返す', () => {
  const env = makeEnv();
  assert.ok(env.gs.uploadFileFromForm({}).error);
  assert.ok(env.gs.uploadFileData('a', 'b', '').error);
});

test('読み書きはロックの中で行われる', () => {
  const env = makeEnv();
  env.gs.loadDataFromServer();
  env.gs.saveDataToServer({}, {}, [], 1);
  assert.strictEqual(env.lockCount, 2);
  assert.strictEqual(env.lockHeld, false);
});

test('バインド済みスプレッドシートからの手動移行は既存データを消さない', () => {
  const env = makeEnv({ sheetValues: [['settings', JSON.stringify({ configByYear: { '2023': { grade: '2' } } })], ['data', JSON.stringify({ '2023-04-10-1': { subject: '生活' } })]] });
  env.gs.loadDataFromServer();
  env.gs.saveDataToServer({ year: '2026' }, { now: { subject: '国語' } }, [], 1);
  const msg = env.gs.migrateSpreadsheetToDrive();
  assert.match(msg, /移行完了/);
  const after = env.gs.loadDataFromServer();
  assert.strictEqual(after.data.now.subject, '国語');
  assert.strictEqual(after.data['2023-04-10-1'].subject, '生活');
  assert.strictEqual(after.settings.year, '2026');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('  ok   ' + t.name); }
  catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
