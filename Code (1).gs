const ATTACHMENT_FOLDER_NAME = "週案アプリ_添付ファイル";

function getUserDataFileName() {
  const email = Session.getActiveUser().getEmail();
  const safeEmail = email.replace(/[@.]/g, '_');
  return `weekly_plan_data_${safeEmail}.json`;
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('週案＆時数管理ノート')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 旧バージョンで使っていた保存ファイル名（新しい順に探索する）
const LEGACY_DATA_FILE_NAMES = [
  "weekly_plan_data.json",     // 2代目（ユーザー共通）
  "週案アプリ_保存データ.json"  // 元祖
];

// データが実質空かどうかを判定する（移行の要否チェックに使う）
function isEmptyData(obj) {
  if (!obj) return true;
  const dataEmpty  = !obj.data  || Object.keys(obj.data).length === 0;
  const notesEmpty = !obj.notes || obj.notes.length === 0;
  return dataEmpty && notesEmpty;
}

// ファイル名で最初に見つかったファイルの中身をパースして返す（無ければ null）
function readJsonFileByName(name) {
  const files = DriveApp.getFilesByName(name);
  if (!files.hasNext()) return null;
  try {
    return JSON.parse(files.next().getBlob().getDataAsString());
  } catch (e) {
    return null;
  }
}

// 取得したデータをユーザー別のドライブJSONファイルへ保存（移行）する
function migrateToUserFile(obj) {
  const fileName = getUserDataFileName();
  const payload = JSON.stringify(obj);
  const existing = DriveApp.getFilesByName(fileName);
  if (existing.hasNext()) {
    existing.next().setContent(payload);
  } else {
    DriveApp.createFile(fileName, payload, MimeType.PLAIN_TEXT);
  }
}

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

// 走査したキー・値をアプリデータへ取り込む
function assignAppField(target, key, parsed) {
  key = String(key).trim().toLowerCase();
  if (parsed == null) return false;
  if (key === 'settings' && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.assign(target.settings, parsed); return true;
  }
  if (key === 'data' && typeof parsed === 'object' && !Array.isArray(parsed)) {
    Object.assign(target.data, parsed); return true;
  }
  if (key === 'notes' && Array.isArray(parsed)) {
    target.notes = parsed; return true;
  }
  return false;
}

// バインドされたスプレッドシートから、旧アプリのデータ（JSON）を探し出す
// 旧形式は「A列＝キー名(settings/data/notes)／B列＝そのJSON」という表になっている。
// 全シートを走査し、キー名セルの隣（右・または下）のJSONを取り込む。
// 1セルに丸ごとの {settings,data,notes} が入っている形式にもフォールバック対応する。
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
        if (typeof cell !== 'string') continue;
        const key = cell.trim().toLowerCase();

        // (A) キー＝バリュー形式：「settings / data / notes」というキー名セル
        if (key === 'settings' || key === 'data' || key === 'notes') {
          let raw = null;
          if (c + 1 < values[r].length && typeof values[r][c + 1] === 'string') {
            raw = values[r][c + 1];                       // 右隣を優先
          } else if (r + 1 < values.length && typeof values[r + 1][c] === 'string') {
            raw = values[r + 1][c];                       // なければ下
          }
          const parsed = tryParseJson(raw);
          if (parsed != null && assignAppField(result, key, parsed)) { found = true; continue; }
        }

        // (B) フォールバック：1セルに {settings,data,notes} 丸ごと
        if (cell.indexOf('"data"') >= 0 || cell.indexOf('"settings"') >= 0 || cell.indexOf('"notes"') >= 0) {
          const whole = tryParseJson(cell);
          if (whole && typeof whole === 'object' && !Array.isArray(whole)) {
            if (assignAppField(result, 'settings', whole.settings)) found = true;
            if (assignAppField(result, 'data', whole.data)) found = true;
            if (assignAppField(result, 'notes', whole.notes)) found = true;
          }
        }
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
        if (assignAppField(result, keys[k], parsed)) found = true;
      }
    }
  }

  return found ? result : null;
}

// 【手動実行用】スプレッドシートの旧データをドライブJSONへ一度だけ移行する。
//  再デプロイ前に、GASエディタでこの関数を選んで実行しておくと確実です。
function migrateSpreadsheetToDrive() {
  const fromSheet = findSpreadsheetData();
  if (!fromSheet || isEmptyData(fromSheet)) {
    Logger.log('スプレッドシートからアプリのデータを検出できませんでした。inspectSpreadsheetData() で中身を確認してください。');
    return '検出できませんでした';
  }
  migrateToUserFile(fromSheet);
  const msg = '移行完了 → ' + getUserDataFileName()
    + '（data: ' + Object.keys(fromSheet.data).length + '件, notes: ' + fromSheet.notes.length + '件）';
  Logger.log(msg);
  return msg;
}

// データをドライブのJSONファイルから読み込む
function loadDataFromServer() {
  const fileName = getUserDataFileName();

  // 1) ユーザー別ファイルを読む
  const current = readJsonFileByName(fileName);

  // 2) 中身があればそのまま返す（正常系）
  if (current && !isEmptyData(current)) {
    return current;
  }

  // 3) 旧形式のドライブJSONファイルから移行を試みる
  //    （空のユーザー別ファイルが先に作られてしまっても、古いデータを取りこぼさない）
  for (let i = 0; i < LEGACY_DATA_FILE_NAMES.length; i++) {
    const legacy = readJsonFileByName(LEGACY_DATA_FILE_NAMES[i]);
    if (legacy && !isEmptyData(legacy)) {
      migrateToUserFile(legacy);
      return legacy;
    }
  }

  // 4) ドライブに無ければ、バインドされたスプレッドシートから移行を試みる
  //    （最初期はスプレッドシートのセルに保存していたケースに対応）
  const fromSheet = findSpreadsheetData();
  if (fromSheet && !isEmptyData(fromSheet)) {
    migrateToUserFile(fromSheet);
    return fromSheet;
  }

  // 5) どこにもデータが無ければ、現在のファイル内容（空）か初期値を返す
  return current || { settings: {}, data: {}, notes: [] };
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
          const isJson = tryParseJson(v) ? '★JSONの可能性' : '';
          Logger.log('  [' + (r+1) + ',' + (c+1) + '] 文字数:' + v.length + ' 先頭60字: ' + v.substring(0, 60) + ' ' + isJson);
        }
      }
    }
  }
  const detected = findSpreadsheetData();
  Logger.log(detected
    ? '▶ 自動検出できました。data件数:' + Object.keys(detected.data || {}).length + ' notes件数:' + (detected.notes ? detected.notes.length : 0)
    : '▶ アプリのJSONデータは自動検出できませんでした（表形式で保存されている可能性があります）。');
}

// データをドライブのJSONファイルに保存する
function saveDataToServer(settings, data, notes) {
  const fileName = getUserDataFileName();
  const payload = JSON.stringify({
    settings: settings,
    data: data,
    notes: notes
  });

  const files = DriveApp.getFilesByName(fileName);
  if (files.hasNext()) {
    const file = files.next();
    file.setContent(payload);
  } else {
    DriveApp.createFile(fileName, payload, MimeType.PLAIN_TEXT);
  }
  return true;
}

// Gemini API を直接呼び出す（PropertiesService に GEMINI_API_KEY を設定してください）
function callGeminiApi(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return { error: 'API_KEY_NOT_SET' };
  }
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
  };
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      return { text: json.candidates[0].content.parts[0].text };
    }
    return { error: JSON.stringify(json) };
  } catch (e) {
    return { error: e.toString() };
  }
}

// 添付ファイルのアップロード（フォルダへ保存）
function uploadFileFromForm(formObject) {
  try {
    let fileBlob = formObject.myFile;
    let folder = getOrCreateFolder(ATTACHMENT_FOLDER_NAME);
    let file = folder.createFile(fileBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { url: file.getUrl(), name: file.getName() };
  } catch (error) {
    return { error: error.toString() };
  }
}

// ドライブ検索
function searchDriveFiles(keyword) {
  let result = [];
  if (!keyword || keyword.trim() === "") return result;
  try {
    let files = DriveApp.searchFiles('title contains "' + keyword + '" and trashed = false');
    let count = 0;
    while (files.hasNext() && count < 30) {
      let f = files.next();
      result.push({ name: f.getName(), url: f.getUrl() });
      count++;
    }
    return result;
  } catch(e) { return {error: e.toString()}; }
}

function getOrCreateFolder(folderName) {
  let folders = DriveApp.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
}
