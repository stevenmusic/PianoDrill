/* 練習紀錄備份(PianoDrill / DrumDrill 共用,兩邊逐位元組相同;tools/test/sync.json same)。
   純函式:不碰 DOM、不 import(node 可以直接測:tools/test/checks/backup.mjs)。畫面在 js/main.js 共用部分(頁尾「備份紀錄」)。
   - exportAll(storage, { app, prefix, langKey, now }) → { app, ver: 1, at, data: { key: 字串值 } }:prefix 開頭的每個 key + 語言 key
   - validate(obj, { app, prefix, langKey }) → 錯誤代碼(字串)或 null;代碼由畫面換成一句白話(i18n 的 bak.err_*)
       notfile = 不是備份檔(不是物件、沒有 data)· otherapp = 別的 App 的備份 · newer = 新版 App 存的 · damaged = 內容不對(key、值)· toolarge = 太大
   - importAll(storage, obj, { prefix, langKey }) → null 或 "write":先記下現在的值,刪掉 prefix 開頭的 key(檔案裡沒有的不留)再寫入檔案的;
       中途寫不進去(空間不夠、私密瀏覽)就全部還原成原本的樣子
   storage = localStorage 的介面(length、key(i)、getItem、setItem、removeItem) */
export const BACKUP_VER = 1;
export const MAX_BYTES = 2 * 1024 * 1024;   // 整份(JSON 字串)要小於 2 MB:練習紀錄最多 400 天,正常遠小於這個

const isJson = v => { try { JSON.parse(v); return true; } catch (e) { return false; } };
const own = (storage, prefix, langKey) => {
  const keys = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k != null && (k.startsWith(prefix) || k === langKey)) keys.push(k); }
  return keys.sort();
};

export function exportAll(storage, { app, prefix, langKey, now = new Date() }){
  const data = {};
  for (const k of own(storage, prefix, langKey)) {
    const v = storage.getItem(k);
    if (typeof v !== "string") continue;
    // 不是 App 存的格式(不是 JSON、語言不是 en / zh)不放:還原時 validate 才不會擋掉自己的檔
    if (k === langKey ? v !== "en" && v !== "zh" : !isJson(v)) continue;
    data[k] = v;
  }
  return { app, ver: BACKUP_VER, at: now.toISOString(), data };
}

export function validate(obj, { app, prefix, langKey }){
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "notfile";
  if (typeof obj.app !== "string" || !obj.data || typeof obj.data !== "object" || Array.isArray(obj.data)) return "notfile";
  if (obj.app !== app) return "otherapp";
  if (!Number.isInteger(obj.ver) || obj.ver < 1) return "damaged";
  if (obj.ver > BACKUP_VER) return "newer";
  let size = 0;
  try { size = JSON.stringify(obj).length * 2; } catch (e) { return "damaged"; }   // UTF-16:一個字元 2 bytes(跟 localStorage 的算法一樣保守)
  if (size >= MAX_BYTES) return "toolarge";
  for (const [k, v] of Object.entries(obj.data)) {
    if (typeof v !== "string") return "damaged";
    if (k === langKey) { if (v !== "en" && v !== "zh") return "damaged"; continue; }
    if (!k.startsWith(prefix) || k.length > 200) return "damaged";
    if (!isJson(v)) return "damaged";
  }
  return null;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export function importAll(storage, obj, { prefix, langKey }){
  const before = {};
  for (const k of own(storage, prefix, langKey)) before[k] = storage.getItem(k);
  try {
    for (const k of Object.keys(before)) if (!has(obj.data, k)) storage.removeItem(k);
    for (const [k, v] of Object.entries(obj.data)) storage.setItem(k, v);
    return null;
  } catch (e) {
    // 還原:檔案寫進來的拿掉,原本的寫回去(原本就放得下,寫得回去)
    try {
      for (const k of Object.keys(obj.data)) if (!has(before, k)) storage.removeItem(k);
      for (const [k, v] of Object.entries(before)) if (v != null) storage.setItem(k, v);
    } catch (e2) {}
    return "write";
  }
}
