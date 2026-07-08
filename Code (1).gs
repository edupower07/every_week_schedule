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

// 同名ファイルのうちゴミ箱に入っていないものを返す
// （DriveApp.getFilesByName はゴミ箱内のファイルも返すため、そのまま使うと
//   削除済みファイルへ保存してしまいデータが消えたように見える）
function findActiveFileByName(fileName) {
  const files = DriveApp.getFilesByName(fileName);
  while (files.hasNext()) {
    const file = files.next();
    if (!file.isTrashed()) return file;
  }
  return null;
}

// データをドライブのJSONファイルから読み込む
function loadDataFromServer() {
  const fileName = getUserDataFileName();
  const file = findActiveFileByName(fileName);
  if (file) {
    const content = file.getBlob().getDataAsString();
    return JSON.parse(content);
  }

  // 旧形式（fixed filename）のデータがあれば移行する
  const legacy = findActiveFileByName("weekly_plan_data.json");
  if (legacy) {
    const content = legacy.getBlob().getDataAsString();
    const parsed = JSON.parse(content);
    // 新ファイルとして保存（移行）
    DriveApp.createFile(fileName, JSON.stringify(parsed), MimeType.PLAIN_TEXT);
    return parsed;
  }

  return { settings: {}, data: {}, notes: [] };
}

// データをドライブのJSONファイルに保存する
function saveDataToServer(settings, data, notes) {
  const fileName = getUserDataFileName();
  const payload = JSON.stringify({
    settings: settings,
    data: data,
    notes: notes
  });

  const file = findActiveFileByName(fileName);
  if (file) {
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
  // gemini-1.5-flash は提供終了のため現行モデルを使用
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
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
    // 児童の記録等を含む可能性があるため、リンクを知っている全員への公開はしない
    // （本人のドライブ内ファイルとしてそのまま開ける）
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
    // クエリ文字列を壊す文字（\ と "）をエスケープする
    const safeKeyword = keyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let files = DriveApp.searchFiles('title contains "' + safeKeyword + '" and trashed = false');
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
