let audioCtx = null;
let permitted = false;

function getContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

/**
 * Close the context this module instance created.
 *
 * `AudioContext` is a hardware-backed resource: one left open keeps the audio
 * output device alive and Chrome logs a warning for it. It was never closed at
 * all, and under Vite HMR each edit re-evaluated this module and allocated a
 * *new* context while the previous one stayed open and unreachable, so a
 * development session leaked one context per save. Disposing on HMR keeps that
 * bounded.
 */
function disposeContext() {
  if (!audioCtx) return;
  try {
    if (audioCtx.state !== 'closed') audioCtx.close();
  } catch {
    /* already closed, or unavailable */
  }
  audioCtx = null;
  permitted = false;
}

if (import.meta.hot) {
  import.meta.hot.dispose(disposeContext);
}

/**
 * Must be called from a user-gesture handler (click/keydown) on first
 * interaction.  Unlocks the AudioContext and requests notification permission
 * in one go.
 */
export function initNotifications() {
  try {
    const ctx = getContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    permitted = true;
  } catch {
    /* unavailable */
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function playNotificationSound() {
  if (!permitted) return;
  try {
    const ctx = getContext();
    if (ctx.state === 'suspended') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* unavailable */
  }
}
