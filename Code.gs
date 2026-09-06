const ATTACHMENT_FOLDER_NAME = "週案アプリ_添付ファイル";
const DATA_FILE_ID_PROP_PREFIX = "DATA_FILE_ID_";

// 旧バージョンで使っていた保存ファイル名（新しい順に探索する）
const LEGACY_DATA_FILE_NAMES = [
  "weekly_plan_data.json",     // 2代目（ユーザー共通）
  "週案アプリ_保存データ.json"  // 元祖
];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('週案＆時数管理ノート')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===== 利用者の識別 =====

// 利用者のメールアドレス。取得できない場合は、全員が同じファイルを共有してしまう事故を防ぐため保存・読込を止める。
function getActiveUserEmail_() {
  let email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e) { email = ''; }
  if (!email) {
    throw new Error('利用者を特定できないため、データを読み書きできません。' +
      'ウェブアプリのデプロイ設定で「次のユーザーとして実行」を「ウェブアプリケーションにアクセスしているユーザー」にしてください。');
  }
  return email;
}

function getUserDataFileName() {
  const safeEmail = getActiveUserEmail_().replace(/[@.]/g, '_');
  return `weekly_plan_data_${safeEmail}.json`;
}

// ===== ドライブ操作の共通処理 =====

function escapeDriveQuery_(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ゴミ箱を除き、同名ファイルのうち最終更新が最も新しいものを返す（無ければ null）
function findNewestFileByName_(name) {
  const it = DriveApp.searchFiles("title = '" + escapeDriveQuery_(name) + "' and trashed = false");
  let best = null;
  while (it.hasNext()) {
    const f = it.next();
    if (!best || f.getLastUpdated().getTime() > best.getLastUpdated().getTime()) best = f;
  }
  return best;
}

// 利用者のデータファイルを返す（無ければ null）。
// ファイルIDを UserProperties に記憶して、名前検索の揺れ（同名ファイルの重複・ゴミ箱）に影響されないようにする。
function getDataFile_() {
  const fileName = getUserDataFileName();
  const propKey = DATA_FILE_ID_PROP_PREFIX + fileName;
  const props = PropertiesService.getUserProperties();
  const savedId = props.getProperty(propKey);
  if (savedId) {
    try {
      const f = DriveApp.getFileById(savedId);
      if (!f.isTrashed()) return f;
    } catch (e) { /* 削除済みなど → 名前検索へ */ }
  }
  const f = findNewestFileByName_(fileName);
  if (f) props.setProperty(propKey, f.getId());
  return f;
}

// ファイルを読み、{ obj: 正規化済みデータ, corrupt: JSONとして読めなかったか } を返す
function readDataFile_(file) {
  if (!file) return { obj: normalizeData_(null), corrupt: false };
  let raw = '';
  try { raw = file.getBlob().getDataAsString(); } catch (e) { raw = ''; }
  if (!raw || !raw.trim()) return { obj: normalizeData_(null), corrupt: false };
  try {
    return { obj: normalizeData_(JSON.parse(raw)), corrupt: false };
  } catch (e) {
    return { obj: normalizeData_(null), corrupt: true };
  }
}

// データファイルへ書き込む（無ければ作成し、IDを記憶する）
function writeDataFile_(file, obj) {
  const payload = JSON.stringify(obj);
  if (file) { file.setContent(payload); return file; }
  const fileName = getUserDataFileName();
  const created = DriveApp.createFile(fileName, payload, MimeType.PLAIN_TEXT);
  PropertiesService.getUserProperties().setProperty(DATA_FILE_ID_PROP_PREFIX + fileName, created.getId());
  return created;
}

// 壊れたJSONファイルの控えを同じ場所に残す（読めない内容を黙って上書きしない）
function backupCorruptFile_(file) {
  try { file.makeCopy(getUserDataFileName() + '.corrupt-' + Date.now() + '.bak'); } catch (e) { /* 控えが作れなくても処理は続ける */ }
}

// 読み書きを直列化する（同時保存で古い内容が勝つのを防ぐ）
function withUserLock_(fn) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(15000)) {
    throw new Error('別の保存処理が実行中のため待機時間を超えました。しばらくしてからもう一度お試しください。');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

function isPlainObject_(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

// どんな形で保存されていても { settings, data, notes, meta } の形に揃える
function normalizeData_(obj) {
  const o = isPlainObject_(obj) ? obj : {};
  const meta = isPlainObject_(o.meta) ? o.meta : {};
  return {
    settings: isPlainObject_(o.settings) ? o.settings : {},
    data: isPlainObject_(o.data) ? o.data : {},
    notes: Array.isArray(o.notes) ? o.notes : [],
    meta: {
      revision: (typeof meta.revision === 'number' && meta.revision >= 0) ? meta.revision : 0,
      updatedAt: meta.updatedAt || null,
      legacyChecked: !!meta.legacyChecked
    }
  };
}

// データが実質空かどうかを判定する（移行の要否チェックに使う）
function isEmptyData(obj) {
  if (!obj) return true;
  const dataEmpty  = !obj.data  || Object.keys(obj.data).length === 0;
  const notesEmpty = !obj.notes || obj.notes.length === 0;
  return dataEmpty && notesEmpty;
}

// ===== 旧データの移行 =====

// 文字列をJSONとしてパースする（失敗したら null）
function tryParseJson(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t.length < 2) return null;
  if (t.charAt(0) !== '{' && t.charAt(0) !== '[') return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

// パース済みJSONの「中身」から settings / data / notes のどれかを判別する
//  A列のキー名に頼らず、値の形だけで分類できる（列見出しが違っても動く）。
function classifyJson(parsed) {
  if (parsed == null) return null;

  // notes：オブジェクトの配列（content / folder / date を持つ）
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return null;
    const el = parsed[0];
    if (el && typeof el === 'object' &&
        ('content' in el || 'folder' in el || 'date' in el)) return 'notes';
    return null;
  }

  if (typeof parsed !== 'object') return null;
  const keys = Object.keys(parsed);
  if (keys.length === 0) return null;

  // settings：設定特有のキーを持つ
  const settingsSig = ['configByYear', 'foldersByYear', 'noteFolders',
                       'folderDetailsByYear', 'noteFolderDetails'];
  for (let i = 0; i < settingsSig.length; i++) {
    if (parsed.hasOwnProperty(settingsSig[i])) return 'settings';
  }

  // data：トップキーが日付ID（2026-04-10...）か、値が授業セルの形
  const k0 = keys[0];
  if (/^\d{4}-\d{2}-\d{2}/.test(String(k0))) return 'data';
  const v0 = parsed[k0];
  if (v0 && typeof v0 === 'object' &&
      ('subject' in v0 || 'record' in v0 || 'isSplit' in v0 || 'attachments' in v0)) return 'data';

  // 予備：year だけ持つ設定
  if (parsed.hasOwnProperty('year')) return 'settings';
  return null;
}

// 判別結果に応じてアプリデータへ取り込む
function assignAppField(target, kind, parsed) {
  if (parsed == null) return false;
  if (kind === 'settings' && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.assign(target.settings, parsed); return true;
  }
  if (kind === 'data' && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.assign(target.data, parsed); return true;
  }
  if (kind === 'notes' && Array.isArray(parsed)) {
    target.notes = parsed; return true;
  }
  return false;
}

// バインドされたスプレッドシートから、旧アプリのデータ（JSON）を探し出す。
// A列のキー名には頼らず、JSONの中身を見て settings/data/notes を判別して取り込む。
function findSpreadsheetData() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) return null;

  const result = { settings: {}, data: {}, notes: [] };
  let found = false;
  const sheets = ss.getSheets();

  for (let s = 0; s < sheets.length; s++) {
    let values;
    try { values = sheets[s].getDataRange().getValues(); } catch (e) { continue; }

    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const cell = values[r][c];
        if (typeof cell !== 'string' || cell.length < 2) continue;
        const parsed = tryParseJson(cell);
        if (parsed == null) continue;

        // (A) 1セルに丸ごと {settings,data,notes} が入っている形式
        if (!Array.isArray(parsed) &&
            (parsed.hasOwnProperty('settings') || parsed.hasOwnProperty('data') || parsed.hasOwnProperty('notes'))) {
          if (assignAppField(result, 'settings', parsed.settings)) found = true;
          if (assignAppField(result, 'data', parsed.data)) found = true;
          if (assignAppField(result, 'notes', parsed.notes)) found = true;
          continue;
        }

        // (B) 中身から種類を判別して取り込む（A列ラベル不要）
        const kind = classifyJson(parsed);
        if (kind && assignAppField(result, kind, parsed)) found = true;
      }
    }
  }

  // (C) 予備：PropertiesService（旧版が使っていた可能性）
  if (!found) {
    const stores = [];
    try { stores.push(PropertiesService.getDocumentProperties()); } catch (e) {}
    try { stores.push(PropertiesService.getScriptProperties());   } catch (e) {}
    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      if (!store) continue;
      let keys = [];
      try { keys = store.getKeys(); } catch (e) { continue; }
      for (let k = 0; k < keys.length; k++) {
        const parsed = tryParseJson(store.getProperty(keys[k]));
        const kind = classifyJson(parsed);
        if (kind && assignAppField(result, kind, parsed)) found = true;
      }
    }
  }

  return found ? result : null;
}

// 旧形式のドライブJSON → バインドされたスプレッドシートの順に旧データを探す（無ければ null）
function findLegacyData_() {
  for (let i = 0; i < LEGACY_DATA_FILE_NAMES.length; i++) {
    const f = findNewestFileByName_(LEGACY_DATA_FILE_NAMES[i]);
    if (!f) continue;
    const legacy = readDataFile_(f).obj;
    if (!isEmptyData(legacy)) return legacy;
  }
  const fromSheet = findSpreadsheetData();
  if (fromSheet && !isEmptyData(fromSheet)) return normalizeData_(fromSheet);
  return null;
}

// 旧データを現在のデータへ取り込む（現在のデータを優先し、旧データは不足分だけ補う）
function mergeLegacyInto_(current, legacy) {
  current.settings = Object.assign({}, legacy.settings, current.settings);
  Object.keys(legacy.data).forEach(function(k) {
    if (!(k in current.data)) current.data[k] = legacy.data[k];
  });
  const ids = {};
  current.notes.forEach(function(n) { if (n && n.id != null) ids[String(n.id)] = true; });
  legacy.notes.forEach(function(n) {
    if (n && (n.id == null || !ids[String(n.id)])) current.notes.push(n);
  });
  return current;
}

// 【手動実行用】スプレッドシートの旧データをドライブJSONへ取り込む。
//  GASエディタでこの関数を選んで実行してください（既にあるデータは消えません）。
function migrateSpreadsheetToDrive() {
  const fromSheet = findSpreadsheetData();
  if (!fromSheet || isEmptyData(fromSheet)) {
    Logger.log('スプレッドシートからアプリのデータを検出できませんでした。inspectSpreadsheetData() で中身を確認してください。');
    return '検出できませんでした';
  }
  return withUserLock_(function() {
    const file = getDataFile_();
    const current = readDataFile_(file).obj;
    mergeLegacyInto_(current, normalizeData_(fromSheet));
    current.meta.legacyChecked = true;
    current.meta.revision += 1;
    current.meta.updatedAt = new Date().toISOString();
    writeDataFile_(file, current);
    const msg = '移行完了 → ' + getUserDataFileName()
      + '（data: ' + Object.keys(current.data).length + '件, notes: ' + current.notes.length + '件）';
    Logger.log(msg);
    return msg;
  });
}

// 【診断用】スプレッドシートの中身を調べてログに出す
//  形式が分からないとき、GASエディタでこの関数を実行して結果を確認してください。
function inspectSpreadsheetData() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (!ss) {
    Logger.log('このスクリプトはスプレッドシートにバインドされていません（getActiveSpreadsheet が取得できません）。');
    return;
  }
  Logger.log('スプレッドシート名: ' + ss.getName());
  Logger.log('URL: ' + ss.getUrl());
  const sheets = ss.getSheets();
  Logger.log('シート数: ' + sheets.length);
  for (let s = 0; s < sheets.length; s++) {
    const sh = sheets[s];
    Logger.log('── シート「' + sh.getName() + '」 行:' + sh.getLastRow() + ' 列:' + sh.getLastColumn());
    let values;
    try { values = sh.getDataRange().getValues(); } catch (e) { continue; }
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const v = values[r][c];
        if (typeof v === 'string' && v.length > 40) {
          const parsed = tryParseJson(v);
          const kind = parsed ? (classifyJson(parsed) || '判別不能') : '非JSON';
          Logger.log('  [' + (r+1) + ',' + (c+1) + '] 文字数:' + v.length + ' 判別:' + kind + ' 先頭60字: ' + v.substring(0, 60));
        }
      }
    }
  }
  const detected = findSpreadsheetData();
  Logger.log(detected
    ? '▶ 自動検出できました。data件数:' + Object.keys(detected.data || {}).length + ' notes件数:' + (detected.notes ? detected.notes.length : 0)
    : '▶ アプリのJSONデータは自動検出できませんでした（表形式で保存されている可能性があります）。');
}

// ===== 読み込み・保存 =====

// データをドライブのJSONファイルから読み込む。
// 戻り値の meta.revision は保存時の競合検知に使う版番号。
function loadDataFromServer() {
  return withUserLock_(function() {
    const file = getDataFile_();
    const read = readDataFile_(file);
    const current = read.obj;

    // 正常系：中身のあるファイルはそのまま返す
    if (file && !isEmptyData(current)) return current;

    // 壊れたJSONを作り直す前に、念のため控えを残す
    if (file && read.corrupt) backupCorruptFile_(file);

    // 旧データの取り込みは「一度だけ」行う。
    // （以前は中身が空だと毎回やり直していたため、消したはずのデータが復活したり、設定が旧データで上書きされたりした）
    if (!current.meta.legacyChecked) {
      const legacy = findLegacyData_();
      if (legacy) mergeLegacyInto_(current, legacy);
      current.meta.legacyChecked = true;
    }
    current.meta.revision += 1;
    current.meta.updatedAt = new Date().toISOString();
    writeDataFile_(file, current);
    return current;
  });
}

// データをドライブのJSONファイルに保存する。
// expectedRevision：クライアントが読み込んだ時点の版番号。サーバー側の版と食い違っていれば
// 上書きせず { conflict: true, current } を返し、クライアント側で統合してもらう。
function saveDataToServer(settings, data, notes, expectedRevision) {
  return withUserLock_(function() {
    const file = getDataFile_();
    const read = readDataFile_(file);
    const current = read.obj;
    const currentRev = current.meta.revision;
    const expected = (typeof expectedRevision === 'number') ? expectedRevision : null;

    // 読み込みに成功していないクライアントからの保存で、中身のあるファイルを消してしまわない
    if (file && !isEmptyData(current) && expected === null) {
      return { ok: false, conflict: true, reason: 'NOT_LOADED', current: current };
    }
    if (file && expected !== null && expected !== currentRev) {
      return { ok: false, conflict: true, reason: 'REVISION_MISMATCH', current: current };
    }

    // 壊れたJSONを上書きする前に、念のため控えを残す
    if (file && read.corrupt) backupCorruptFile_(file);

    const next = normalizeData_({ settings: settings, data: data, notes: notes });
    next.meta = { revision: currentRev + 1, updatedAt: new Date().toISOString(), legacyChecked: true };
    writeDataFile_(file, next);
    return { ok: true, revision: next.meta.revision, updatedAt: next.meta.updatedAt };
  });
}

// ===== 添付ファイル =====

// フォーム経由のアップロード（画像・PDF）
function uploadFileFromForm(formObject) {
  try {
    const fileBlob = formObject && formObject.myFile;
    if (!fileBlob) return { error: 'ファイルが選択されていません。' };
    return saveAttachmentBlob_(fileBlob);
  } catch (error) {
    return { error: error.toString() };
  }
}

// ブラウザ側で縮小した画像のアップロード（base64）
function uploadFileData(name, mimeType, base64) {
  try {
    if (!base64) return { error: 'ファイルの内容が空です。' };
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'application/octet-stream', name || 'upload');
    return saveAttachmentBlob_(blob);
  } catch (error) {
    return { error: error.toString() };
  }
}

function saveAttachmentBlob_(blob) {
  const folder = getOrCreateFolder(ATTACHMENT_FOLDER_NAME);
  const file = folder.createFile(blob);
  // 以前は「リンクを知っている全員」に公開していたが、児童の写真等を扱うため公開はしない。
  // スクリプトの所有者として実行されている場合だけ、アップロードした本人に閲覧権限を付ける。
  shareWithActiveUserIfNeeded_(file);
  return { url: file.getUrl(), name: file.getName() };
}

function shareWithActiveUserIfNeeded_(file) {
  try {
    const active = Session.getActiveUser().getEmail();
    const effective = Session.getEffectiveUser().getEmail();
    if (active && effective && active !== effective) file.addViewer(active);
  } catch (e) { /* 共有できなくてもアップロード自体は成功扱い */ }
}

// ドライブ検索（ファイル名の部分一致、ゴミ箱は除く）
function searchDriveFiles(keyword) {
  const result = [];
  if (!keyword || keyword.trim() === "") return result;
  try {
    const files = DriveApp.searchFiles("title contains '" + escapeDriveQuery_(keyword.trim()) + "' and trashed = false");
    let count = 0;
    while (files.hasNext() && count < 30) {
      const f = files.next();
      result.push({ name: f.getName(), url: f.getUrl() });
      count++;
    }
    return result;
  } catch(e) { return { error: e.toString() }; }
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.searchFolders("title = '" + escapeDriveQuery_(folderName) + "' and trashed = false");
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}
