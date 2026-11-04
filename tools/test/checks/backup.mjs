// 練習紀錄備份(js/shared/backup.js)的檢查;兩個 App 同一份(sync.json same),verify.mjs 會呼叫;也可以單獨跑:node tools/test/checks/backup.mjs
//   往返(存 → 清掉 → 還原 = 一模一樣)、別的 key 不碰、壞 JSON、別的 App、新版、惡意 key、值不是字串、太大、寫入失敗全部還原
import { exportAll, validate, importAll, MAX_BYTES } from "../../../js/shared/backup.js";

/* localStorage 的替身;quota = 最多幾個字元(超過就丟錯,像真的空間不夠) */
function mem(init = {}, quota = Infinity){
  const m = new Map(Object.entries(init));
  const used = () => [...m].reduce((a, [k, v]) => a + k.length + v.length, 0);
  return {
    get length(){ return m.size; }, key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem(k, v){ const old = m.get(k); m.set(k, String(v)); if (used() > quota) { if (old == null) m.delete(k); else m.set(k, old); throw new Error("QuotaExceededError"); } },
    removeItem: k => { m.delete(k); }, dump: () => Object.fromEntries([...m].sort())
  };
}

export default function check(ok){
  const opt = { app: "pianodrill", prefix: "pianodrill.", langKey: "pianodrill-lang" };
  const init = {
    "pianodrill.v1": JSON.stringify({ theme: "light", exam: { system: "abrsm", grade: 2 } }),
    "pianodrill.tech.v1": JSON.stringify({ log: { "2026-11-01": { n: 3, sec: 600 } }, goal: 30 }),
    "pianodrill.sight.mic": "0",
    "pianodrill-lang": "zh",
    "pianodrill.junk": "not json",
    "drumdrill.v1": "{}", "other": "x"
  };
  const a = mem(init);
  const b = exportAll(a, { ...opt, now: new Date(Date.UTC(2026, 10, 4)) });
  ok(b.app === "pianodrill" && b.ver === 1 && b.at === "2026-11-04T00:00:00.000Z", "備份:app / ver / at");
  ok(Object.keys(b.data).join() === "pianodrill-lang,pianodrill.sight.mic,pianodrill.tech.v1,pianodrill.v1", "備份:只有自己的 key + 語言(不是 JSON 的不放):" + Object.keys(b.data));
  ok(validate(b, opt) === null, "備份:自己存的檔要能通過檢查");
  // 往返:經過 JSON 檔案(字串)再讀回來
  const file = JSON.parse(JSON.stringify(b));
  const c = mem({ "pianodrill.v1": "{}", "pianodrill.ear.v1": JSON.stringify({ log: {} }), "drumdrill.v1": "{\"keep\":1}" });
  ok(importAll(c, file, opt) === null, "還原:成功");
  const d = c.dump();
  ok(d["pianodrill.tech.v1"] === init["pianodrill.tech.v1"] && d["pianodrill.v1"] === init["pianodrill.v1"] && d["pianodrill-lang"] === "zh", "還原:內容一模一樣");
  ok(!("pianodrill.ear.v1" in d), "還原:檔案裡沒有的(這台的舊紀錄)要拿掉 = 取代");
  ok(d["drumdrill.v1"] === "{\"keep\":1}", "還原:別的 App 的紀錄不碰");

  // 壞檔
  ok(validate(null, opt) === "notfile" && validate("x", opt) === "notfile" && validate([], opt) === "notfile" && validate({ app: "pianodrill" }, opt) === "notfile", "壞檔:不是物件 / 沒有 data");
  ok(validate({ ...b, data: [] }, opt) === "notfile", "壞檔:data 是陣列");
  ok(validate({ ...b, app: "drumdrill" }, opt) === "otherapp", "別的 App 的備份");
  ok(validate({ ...b, ver: 2 }, opt) === "newer", "新版 App 存的");
  ok(validate({ ...b, ver: "1" }, opt) === "damaged" && validate({ ...b, ver: 0 }, opt) === "damaged", "ver 不對");
  ok(validate({ ...b, data: { ...b.data, "pianodrill.tech.v1": "{oops" } }, opt) === "damaged", "值不是 JSON");
  ok(validate({ ...b, data: { ...b.data, "pianodrill.tech.v1": { log: {} } } }, opt) === "damaged", "值不是字串");
  ok(validate({ ...b, data: { ...b.data, "pianodrill-lang": "<script>" } }, opt) === "damaged", "語言 key 只能 en / zh");
  // 惡意 key:別的 App、別的網站資料、原型污染
  for (const k of ["drumdrill.v1", "evil", "__proto__", "constructor", "pianodrill", "PIANODRILL.v1"]) {
    const o = JSON.parse(`{"app":"pianodrill","ver":1,"at":"x","data":{${JSON.stringify(k)}:"{}"}}`);
    ok(validate(o, opt) === "damaged", "惡意 key 要擋:" + k);
  }
  ok(validate({ ...b, data: { ["pianodrill." + "x".repeat(300)]: "{}" } }, opt) === "damaged", "key 太長");
  // 太大
  const big = { ...b, data: { "pianodrill.big": JSON.stringify("x".repeat(MAX_BYTES / 2)) } };
  ok(validate(big, opt) === "toolarge", "太大(≥ 2 MB)");
  ok(validate({ ...b, data: { "pianodrill.ok": JSON.stringify("x".repeat(MAX_BYTES / 4)) } }, opt) === null, "1 MB 以內可以");

  // 寫入失敗:全部還原成原本的樣子
  const orig = { "pianodrill.v1": "{\"a\":1}", "pianodrill.tech.v1": "{\"log\":{}}", "pianodrill-lang": "en", "drumdrill.v1": "{}" };
  const used = Object.entries(orig).reduce((s, [k, v]) => s + k.length + v.length, 0);
  const e = mem(orig, used + 60);
  const fat = { app: "pianodrill", ver: 1, at: "x", data: { "pianodrill.a": "1", "pianodrill.b": JSON.stringify("y".repeat(200)), "pianodrill.v1": "{}" } };
  ok(validate(fat, opt) === null, "寫入失敗的測試檔本身是好的");
  ok(importAll(e, fat, opt) === "write", "寫不進去 → write");
  ok(JSON.stringify(e.dump()) === JSON.stringify(mem(orig).dump()), "寫不進去 → 全部還原:" + JSON.stringify(e.dump()));
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let fails = 0, n = 0;
  check((c, m) => { n++; if (!c) { fails++; console.log("✗ " + m); } return c; });
  console.log(fails ? `✗ ${fails} / ${n} 項失敗` : `✓ 備份 ${n} 項`);
  process.exit(fails ? 1 : 0);
}
