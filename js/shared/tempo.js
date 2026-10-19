/* 共用的速度介面(照 PianoDrill / DrumDrill 技巧):− / + 按鈕(點一下 ±1,按住越按越快)、滑桿(點哪裡跳到哪裡、按住拖)、
   速度數字與單位、拍點燈號。元素都用模組自己的 $(id => document.getElementById(前綴 + id)),這裡不寫死前綴:
     $("bpmDown")、$("bpmUp")、$("bpmRange")、$("bpmVal")、$("bpmUnit")、$("beats")
   opts:min、max(滑桿範圍)、get()(目前速度)、set(v)(使用者改的速度;模組自己存、重排播放)
   回傳:sync(unitText)(數字、滑桿、單位)、setBeats(n)(拍點燈號幾個)、showBeat(beat, countIn)(播放時亮第幾個;null 全暗) */
export function createTempo({ $, min = 30, max = 240, get, set }){
  /* − / +:點一下 ±1;按住 0.4 秒後開始連續增減,越按越快(每次 ±1 → 1 秒後 ±2 → 1.6 秒後 ±5) */
  function holdRepeat(btn, dir){
    let timer = 0, t0 = 0, fired = false;
    const step = () => { const held = performance.now() - t0; set(get() + dir * (held > 1600 ? 5 : held > 1000 ? 2 : 1)); timer = setTimeout(step, held > 1000 ? 70 : 110); };
    btn.addEventListener("pointerdown", e => {
      if (e.button > 0) return;
      e.preventDefault(); fired = true; t0 = performance.now();
      set(get() + dir);
      timer = setTimeout(() => { t0 = performance.now() - 400; step(); }, 400);
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    });
    const stop = () => { clearTimeout(timer); timer = 0; };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener("contextmenu", e => e.preventDefault());
    // 鍵盤(Enter / 空白鍵)沒有 pointer 事件:照一般點擊 ±1
    btn.addEventListener("click", () => { if (fired) { fired = false; return; } set(get() + dir); });
  }
  holdRepeat($("bpmDown"), -1);
  holdRepeat($("bpmUp"), +1);
  // 點滑桿任何位置都跳到那裡、按住左右拖(手機上只能抓圓鈕太難滑到)
  const range = $("bpmRange");
  const setFromX = e => { const r = range.getBoundingClientRect(); const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); set(Math.round(min + t * (max - min))); };
  let dragging = false;
  range.addEventListener("pointerdown", e => { dragging = true; try { range.setPointerCapture(e.pointerId); } catch {} setFromX(e); });
  range.addEventListener("pointermove", e => { if (dragging) setFromX(e); });
  range.addEventListener("pointerup", () => { dragging = false; }); range.addEventListener("pointercancel", () => { dragging = false; });
  range.oninput = () => set(Number(range.value));
  return {
    sync(unitText){
      range.min = min; range.max = max;
      $("bpmVal").textContent = get(); range.value = get();
      if (unitText != null) $("bpmUnit").textContent = unitText;
    },
    setBeats(n){ $("beats").innerHTML = "<i class=\"first\"></i>" + "<i></i>".repeat(Math.max(1, n) - 1); },
    /* beat:從第一拍算起的拍數(預備拍是負的);countIn:預備拍幾拍 */
    showBeat(beat, countIn = 0){
      const dots = $("beats").children, n = dots.length;
      const k = beat == null ? -1 : beat < 0 ? ((Math.floor(beat + countIn) % n) + n) % n : Math.floor(beat + 1e-6) % n;
      for (let i = 0; i < n; i++) dots[i].classList.toggle("on", i === k);
    }
  };
}
