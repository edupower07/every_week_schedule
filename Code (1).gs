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

// データをドライブのJSONファイルから読み込む
function loadDataFromServer() {
  const fileName = getUserDataFileName();

  // 1) ユーザー別ファイルを読む
  const current = readJsonFileByName(fileName);

  // 2) 中身があればそのまま返す（正常系）
  if (current && !isEmptyData(current)) {
    return current;
  }

  // 3) ユーザー別ファイルが無い or 空のときは、旧形式ファイルから移行を試みる
  //    （空のユーザー別ファイルが先に作られてしまっても、古いデータを取りこぼさない）
  for (let i = 0; i < LEGACY_DATA_FILE_NAMES.length; i++) {
    const legacy = readJsonFileByName(LEGACY_DATA_FILE_NAMES[i]);
    if (legacy && !isEmptyData(legacy)) {
      // ユーザー別ファイルへ移行保存（既にあれば上書き、無ければ新規作成）
      const existing = DriveApp.getFilesByName(fileName);
      if (existing.hasNext()) {
        existing.next().setContent(JSON.stringify(legacy));
      } else {
        DriveApp.createFile(fileName, JSON.stringify(legacy), MimeType.PLAIN_TEXT);
      }
      return legacy;
    }
  }

  // 4) どこにもデータが無ければ、現在のファイル内容（空）か初期値を返す
  return current || { settings: {}, data: {}, notes: [] };
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
