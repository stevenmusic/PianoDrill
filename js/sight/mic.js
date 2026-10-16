/**
 * Microphone capture for rhythm scoring.
 *
 * Raw mono samples are collected on the device and handed to `scoring.js` when
 * the take ends; nothing is recorded to disk and nothing leaves the page.
 * Echo cancellation, noise suppression and auto-gain are switched off: they are
 * built for speech and flatten exactly the attack a piano onset is made of.
 */

export function createRecorder() {
  let stream = null;
  let context = null;
  let node = null;
  let source = null;
  let chunks = [];
  let startedAt = 0;

  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    context = new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') await context.resume();
    source = context.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but is the one capture path that behaves the
    // same on iOS Safari, where this app is mostly used.
    node = context.createScriptProcessor(2048, 1, 1);
    chunks = [];
    node.onaudioprocess = (event) => { chunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
    source.connect(node);
    node.connect(context.destination); // required for the node to run; its output is silent
    startedAt = performance.now() / 1000;
  }

  function release() {
    try { node?.disconnect(); source?.disconnect(); } catch { /* already gone */ }
    stream?.getTracks().forEach((track) => track.stop());
    context?.close().catch(() => {});
    stream = null; context = null; node = null; source = null;
  }

  /** Stop and return the take, or null if nothing was recording. */
  function finish() {
    if (!context) return null;
    const sampleRate = context.sampleRate;
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(length);
    let at = 0;
    for (const chunk of chunks) { samples.set(chunk, at); at += chunk.length; }
    const take = { samples, sampleRate, startedAt };
    chunks = [];
    release();
    return take;
  }

  function cancel() { chunks = []; release(); }

  return { start, finish, cancel, get active() { return context !== null; } };
}
