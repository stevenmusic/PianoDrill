/**
 * Microphone capture for rhythm scoring (PianoDrill / DrumDrill share this
 * file byte for byte; tools/test/sync.mjs checks it).
 *
 * Raw mono samples are collected on the device and handed to the onset finder
 * (`js/shared/onsets.js`) when the take ends; nothing is recorded to disk and
 * nothing leaves the page. Echo cancellation, noise suppression and auto-gain
 * are switched off: they are built for speech and flatten exactly the attack an
 * onset is made of.
 *
 * createRecorder() records on its own AudioContext (PianoDrill: its play-along
 * is silent, so only the wall clock matters). createRecorder({ context }) records
 * on the context that `context()` returns instead (DrumDrill: the same context the
 * click and drums are scheduled on, so a take's `contextTime` is on the playback
 * clock); that context is left running when the take ends.
 *
 * Audio session (iOS):
 * - Web (Safari 17+): `navigator.audioSession.type` is set to "play-and-record"
 *   while recording and put back to what it was afterwards.
 * - App (Capacitor native): the page never touches navigator.audioSession (it
 *   would override the native category, docs/IOS.md §3). If the app registers the
 *   native AudioSession plugin (docs/IOS.md §4b) it is asked to switch to
 *   .playAndRecord and back to .playback + .mixWithOthers; without the plugin
 *   WebKit switches the category for the capture by itself.
 */

const isNative = () => {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch { return false; }
};
let nativePlugin = null;
function nativeSession() {
  if (!nativePlugin) {
    try { nativePlugin = window.Capacitor.registerPlugin('AudioSession'); } catch { nativePlugin = false; }
  }
  return nativePlugin || null;
}

export function createRecorder({ context: shared = null } = {}) {
  let stream = null;
  let context = null;
  let ownContext = false;
  let node = null;
  let source = null;
  let chunks = [];
  let startedAt = 0;
  let contextTime = null;
  let nextTime = 0;
  let filled = 0;
  let sessionBefore = null;
  let nativeSwitched = false;

  async function enterSession() {
    if (isNative()) {
      const plugin = nativeSession();
      if (plugin) {
        try { await plugin.setMode({ mode: 'record' }); nativeSwitched = true; } catch { /* plugin not in this build: WebKit switches by itself */ }
      }
      return;
    }
    const session = navigator.audioSession;
    if (!session) return;
    try { sessionBefore = session.type; session.type = 'play-and-record'; } catch { sessionBefore = null; }
  }

  function leaveSession() {
    if (nativeSwitched) {
      nativeSwitched = false;
      const plugin = nativeSession();
      if (plugin) plugin.setMode({ mode: 'playback' }).catch(() => {});
    }
    if (sessionBefore !== null) {
      try { navigator.audioSession.type = sessionBefore; } catch { /* nothing to restore */ }
      sessionBefore = null;
    }
  }

  async function start() {
    if (context) cancel();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new DOMException('getUserMedia is not available', 'NotSupportedError');
    }
    await enterSession();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      ownContext = !shared;
      context = shared ? shared() : new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') await context.resume();
      source = context.createMediaStreamSource(stream);
      // ScriptProcessor is deprecated but is the one capture path that behaves the
      // same on iOS Safari, where this app is mostly used.
      const size = 2048;
      node = context.createScriptProcessor(size, 1, 1);
      chunks = [];
      contextTime = null;
      filled = 0;
      node.onaudioprocess = (event) => {
        const rate = context.sampleRate, at = event.playbackTime;
        if (contextTime === null) {
          // The input block handed over here started two blocks before the time its
          // output would be heard (one block of input buffering, one of output).
          contextTime = at > 0 ? at - (2 * size) / rate : context.currentTime - size / rate;
        } else if (at > 0 && at - nextTime > size / rate / 2) {
          // A busy main thread can make the browser skip blocks: pad the gap with
          // silence so later samples stay on the same clock as the first one.
          const gap = Math.min(Math.round((at - nextTime) * rate), rate * 5);
          chunks.push(new Float32Array(gap));
          filled += gap;
        }
        if (at > 0) nextTime = at + size / rate;
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      };
      source.connect(node);
      node.connect(context.destination); // required for the node to run; its output is silent
      startedAt = performance.now() / 1000;
    } catch (error) {
      release();
      throw error;
    }
  }

  function release() {
    try { node?.disconnect(); source?.disconnect(); } catch { /* already gone */ }
    if (node) node.onaudioprocess = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (ownContext) context?.close().catch(() => {});
    stream = null; context = null; node = null; source = null; ownContext = false;
    leaveSession();
  }

  /**
   * Stop and return the take, or null if nothing was recording.
   * startedAt: performance.now() / 1000 when recording began (wall clock);
   * contextTime: the recording context's time of the first sample (null if no
   * block arrived); filled: samples of silence put in where blocks were skipped.
   */
  function finish() {
    if (!context) return null;
    const sampleRate = context.sampleRate;
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(length);
    let at = 0;
    for (const chunk of chunks) { samples.set(chunk, at); at += chunk.length; }
    const take = { samples, sampleRate, startedAt, contextTime, filled };
    chunks = [];
    release();
    return take;
  }

  function cancel() { chunks = []; release(); }

  return { start, finish, cancel, get active() { return context !== null; } };
}
