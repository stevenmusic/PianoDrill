/* 麥克風聽彈奏(PianoDrill 視奏「彈一遍」自動打分):js/shared/mic.js(兩個 App 逐位元組相同,不改)外面包一層。
   mic.js 負責權限、音訊工作階段(iOS)與整段錄音;這裡給它一個自己的 AudioContext,
   在 createMediaStreamSource 那一步多接一條即時分析(micscore.js 的 createNoteOnsets),
   只用來知道「開始彈了沒、彈完了沒」(最後一個音之後 2 秒沒有新的音)。打分用整段錄音,在裝置上算,不存檔、不上傳。 */
import { createRecorder } from '../shared/mic.js';
import { createNoteOnsets, LIVE } from './micscore.js';

export function createListener() {
  let ctx = null, tap = null, live = null, onNotes = null;
  const recorder = createRecorder({
    context: () => {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const raw = ctx.createMediaStreamSource.bind(ctx);
      ctx.createMediaStreamSource = (stream) => {
        const source = raw(stream);
        tap = ctx.createScriptProcessor(2048, 1, 1);
        live = createNoteOnsets(ctx.sampleRate, LIVE);
        tap.onaudioprocess = (event) => {
          if (!live) return;
          const found = live.push(event.inputBuffer.getChannelData(0));
          if (found.length && onNotes) onNotes(found.length);
        };
        source.connect(tap);
        tap.connect(ctx.destination);   // 要接到輸出才會跑;輸出是靜音
        return source;
      };
      return ctx;
    },
  });
  function cleanup() {
    try { tap?.disconnect(); } catch { /* 已經斷了 */ }
    if (tap) tap.onaudioprocess = null;
    tap = null; live = null; onNotes = null;
    const c = ctx; ctx = null;
    c?.close().catch(() => {});
  }
  return {
    /** 開始聽;notes(n) = 即時聽到 n 個新的音。拿不到麥克風就丟錯(NotAllowedError…) */
    async start(notes) {
      cleanup();
      onNotes = notes;
      try { await recorder.start(); } catch (error) { cleanup(); throw error; }
      onNotes = notes;
    },
    /** 停止,回傳整段錄音 { samples, sampleRate, … } 或 null */
    finish() { const take = recorder.finish(); cleanup(); return take; },
    cancel() { recorder.cancel(); cleanup(); },
    get active() { return recorder.active; },
  };
}
